'use strict';
/* index.js: Express app. Serves the game and exposes POST /api/render.
 *
 * Public-facing safety rules (all enforced here or in the modules it uses):
 *   - only http/https targets; private/loopback/link-local/reserved addresses blocked at every hop (netguard + proxy)
 *   - per-IP rate limit, global concurrency cap, request timeout, byte caps
 *   - the target site's scripts only ever run inside headless Chromium on the server; the game gets a
 *     picture and numbers, never HTML or JavaScript from the target.
 */
const path = require('node:path');
const express = require('express');
const { Renderer, RenderError } = require('./render');
const { parseTarget } = require('./netguard');

const ROOT = path.resolve(__dirname, '..');
const int = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

function createApp(opts = {}) {
  const cfg = {
    concurrency: opts.concurrency || int(process.env.RENDER_CONCURRENCY, 2),
    ratePerMin: opts.ratePerMin || int(process.env.RATE_PER_MIN, 5),
    ratePerHour: opts.ratePerHour || int(process.env.RATE_PER_HOUR, 30),
    cacheTtlMs: opts.cacheTtlMs === undefined ? 10 * 60 * 1000 : opts.cacheTtlMs,
    cacheMax: opts.cacheMax || 24,
    trustProxy: opts.trustProxy === undefined ? int(process.env.TRUST_PROXY, 0) : opts.trustProxy,
  };
  const renderer = opts.renderer || new Renderer(opts.render || {});
  const app = express();
  app.disable('x-powered-by');
  if (cfg.trustProxy) app.set('trust proxy', cfg.trustProxy);   // set to the number of proxies in front (Render/Fly = 1) so req.ip is the visitor

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; media-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
    next();
  });

  /* ---- rate limit (sliding window per IP, in memory) ---- */
  const hits = new Map();
  const sweep = setInterval(() => { const cut = Date.now() - 3600e3; for (const [ip, a] of hits) { while (a.length && a[0] < cut) a.shift(); if (!a.length) hits.delete(ip); } }, 60e3);
  sweep.unref();
  function limited(ip) {
    const now = Date.now(); let a = hits.get(ip);
    if (!a) { if (hits.size > 20000) hits.delete(hits.keys().next().value); a = []; hits.set(ip, a); }
    while (a.length && a[0] < now - 3600e3) a.shift();
    const lastMin = a.filter(t => t > now - 60e3);
    if (lastMin.length >= cfg.ratePerMin) return Math.ceil((lastMin[0] + 60e3 - now) / 1000);
    if (a.length >= cfg.ratePerHour) return Math.ceil((a[0] + 3600e3 - now) / 1000);
    a.push(now); return 0;
  }

  /* ---- result cache + concurrency ---- */
  const cache = new Map();
  let active = 0;
  const fail = (res, status, code, message, extra) => { if (extra) res.set(extra); return res.status(status).json({ ok: false, error: code, message }); };

  app.get('/api/health', (req, res) => res.json({ ok: true, render: true, busy: active >= cfg.concurrency }));

  app.post('/api/render', express.json({ limit: '4kb', type: () => true }), async (req, res) => {
    const url = req.body && req.body.url;
    if (typeof url !== 'string') return fail(res, 400, 'bad_url', 'Send a JSON body like {"url":"https://example.com"}.');
    let key;
    try { key = parseTarget(url).href; } catch (e) { return fail(res, 400, e.code || 'bad_url', e.message); }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < cfg.cacheTtlMs) { res.set('X-Cache', 'hit'); return res.type('json').send(hit.body); }
    const wait = limited(req.ip);
    if (wait) return fail(res, 429, 'rate_limited', 'Slow down. Try again in ' + wait + ' seconds.', { 'Retry-After': String(wait) });
    if (active >= cfg.concurrency) return fail(res, 503, 'busy', 'The demolition crew is busy. Try again in a few seconds.', { 'Retry-After': '5' });
    active++;
    const t0 = Date.now();
    try {
      const out = await renderer.render(url);
      const body = JSON.stringify(out);
      if (cfg.cacheTtlMs > 0) { cache.set(key, { at: Date.now(), body }); while (cache.size > cfg.cacheMax) cache.delete(cache.keys().next().value); }
      console.log('render ok host=%s ms=%d bytes=%d boxes=%d', out.host, Date.now() - t0, body.length, out.boxes.length);
      res.set('X-Cache', 'miss').type('json').send(body);
    } catch (e) {
      const known = e instanceof RenderError;
      console.log('render fail code=%s ms=%d', known ? e.code : 'internal', Date.now() - t0);
      fail(res, known ? e.status : 500, known ? e.code : 'internal', known ? e.message : 'Something went wrong on our side.');
    } finally { active--; }
  });

  /* ---- static game files: explicit allowlist, so server code and package files are never exposed ---- */
  app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));
  for (const dir of ['js', 'css', 'assets']) app.use('/' + dir, express.static(path.join(ROOT, dir), { dotfiles: 'ignore', index: false, maxAge: opts.staticMaxAge === undefined ? '1h' : opts.staticMaxAge }));
  app.use('/api', (req, res) => fail(res, 404, 'not_found', 'Unknown endpoint.'));
  app.use((err, req, res, next) => {   // body-parser / JSON errors
    if (err && (err.type === 'entity.parse.failed' || err.type === 'entity.too.large' || err.status === 400 || err.status === 413)) return fail(res, err.status || 400, 'bad_request', 'Send a small JSON body.');
    console.error('unhandled', err && err.message); fail(res, 500, 'internal', 'Something went wrong on our side.');
  });
  app.use((req, res) => res.status(404).type('text').send('Not found'));
  return { app, renderer, cfg, close: async () => { clearInterval(sweep); await renderer.close(); } };
}

if (require.main === module) {
  const { app, renderer } = createApp();
  const port = int(process.env.PORT, 3000);
  const server = app.listen(port, () => console.log('Discount Demolition 2 on http://localhost:' + port));
  server.requestTimeout = 60e3; server.headersTimeout = 20e3;
  const stop = () => { server.close(); renderer.close().finally(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); };
  process.on('SIGTERM', stop); process.on('SIGINT', stop);
}
module.exports = { createApp };
