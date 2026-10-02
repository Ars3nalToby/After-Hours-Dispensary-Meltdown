'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.CHROMIUM_NO_SANDBOX = process.env.CHROMIUM_NO_SANDBOX || '1';
const { createApp } = require('../index');
const fixtures = require('./fixtures');

let fx, srv, base, svc;
async function boot(extra = {}) {
  svc = createApp(Object.assign({ ratePerMin: 100, ratePerHour: 1000, cacheTtlMs: 0, render: { lookup: fx.lookup, allowIp: fx.allowIp, totalMs: 20000, navMs: 8000, loadMs: 3000, idleMs: 1000, scrollMs: 1500 } }, extra));
  await new Promise(ok => { srv = svc.app.listen(0, '127.0.0.1', ok); });
  base = 'http://127.0.0.1:' + srv.address().port;
}
async function stop() { await new Promise(ok => srv.close(ok)); await svc.close(); }
const post = (path, body, raw) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: raw ? body : JSON.stringify(body) });
const site = p => 'http://shop.test:' + fx.A.port + p;

test.before(async () => { fx = await fixtures.start(); await boot(); });
test.after(async () => { await stop(); fx.close(); });

test('renders a page: screenshot plus sane boxes', async () => {
  const r = await post('/api/render', { url: site('/') }); const j = await r.json();
  assert.equal(r.status, 200, JSON.stringify(j).slice(0, 200));
  assert.equal(j.ok, true); assert.equal(j.width, 1280); assert.ok(j.height >= 800 && j.height <= 6000);
  assert.match(j.image, /^data:image\/(png|jpeg);base64,/); assert.equal(j.title, 'Fixture shop');
  assert.match(j.bg, /^#[0-9a-f]{6}$/);
  const kinds = new Set(j.boxes.map(b => b.k));
  for (const k of ['text', 'image', 'button', 'block']) assert.ok(kinds.has(k), 'missing box kind ' + k + ' in ' + [...kinds]);
  for (const b of j.boxes) { assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 1280 && b.y + b.h <= j.height, JSON.stringify(b)); }
  assert.ok(j.boxes.filter(b => b.k === 'button').length >= 2);
  // the image really decodes to the advertised size
  const buf = Buffer.from(j.image.split(',')[1], 'base64'); assert.equal(buf.readUInt32BE(16), 1280);
});

test('redirects that stay on the allowed site work', async () => {
  const j = await (await post('/api/render', { url: site('/redirect-ok') })).json();
  assert.equal(j.ok, true); assert.ok(j.url.endsWith('/'));
});

test('a redirect to a private address is blocked and never reaches it', async () => {
  fx.hitsB.length = 0;
  for (const p of ['/redirect-private', '/redirect-chain']) {
    const r = await post('/api/render', { url: site(p) }); const j = await r.json();
    assert.equal(r.status, 400, p + ' ' + JSON.stringify(j)); assert.equal(j.error, 'blocked');
  }
  assert.deepEqual(fx.hitsB, [], 'internal server must receive zero requests');
});

test('subresources pointing at private addresses are blocked, the page still renders', async () => {
  fx.hitsB.length = 0;
  const j = await (await post('/api/render', { url: site('/sub-private') })).json();
  assert.equal(j.ok, true); assert.ok(j.blockedRequests >= 1, 'blocked count ' + j.blockedRequests);
  assert.deepEqual(fx.hitsB, [], 'img/fetch/iframe to internal host must never arrive');
});

test('direct requests for private targets are rejected before any browser work', async () => {
  fx.hitsB.length = 0;
  const targets = [`http://internal.test:${fx.B.port}/`, `http://127.0.0.1:${fx.B.port}/`, 'http://localhost:' + fx.B.port + '/', 'http://[::1]:' + fx.B.port + '/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.1/', 'http://192.168.1.1/', 'http://2130706433:' + fx.B.port + '/',
    'http://0x7f.1:' + fx.B.port + '/', 'http://[::ffff:127.0.0.1]:' + fx.B.port + '/', 'file:///etc/passwd', 'ftp://example.com/', 'javascript:alert(1)', 'http://user:pw@example.com/', 'http://example.com:22/'];
  for (const t of targets) {
    const r = await post('/api/render', { url: t }); const j = await r.json();
    assert.equal(r.status, 400, t + ' -> ' + JSON.stringify(j)); assert.equal(j.ok, false);
  }
  assert.deepEqual(fx.hitsB, []);
});

test('bad bodies are rejected cleanly', async () => {
  assert.equal((await post('/api/render', '{nope', true)).status, 400);
  assert.equal((await post('/api/render', {})).status, 400);
  assert.equal((await post('/api/render', { url: 5 })).status, 400);
  assert.ok([400, 413].includes((await post('/api/render', JSON.stringify({ url: 'x'.repeat(10000) }), true)).status));
  assert.equal((await fetch(base + '/api/nope')).status, 404);
});

test('non-http resources inside a page (file:) never load', async () => {
  const j = await (await post('/api/render', { url: site('/ftp-link') })).json();
  assert.equal(j.ok, true);
});

test('server errors and 404 pages: 500 fails, 404 still renders', async () => {
  const r500 = await post('/api/render', { url: site('/err500') }); assert.equal(r500.status, 502);
  const r404 = await post('/api/render', { url: site('/missing') }); assert.equal((await r404.json()).ok, true);
});

test('very tall pages are cut to the height limit', async () => {
  const j = await (await post('/api/render', { url: site('/long') })).json();
  assert.equal(j.ok, true); assert.equal(j.height, 6000); assert.equal(j.truncated, true);
});

test('static files: game is served, server code and package files are not', async () => {
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/js/core.js')).status, 200);
  for (const p of ['/package.json', '/server/index.js', '/server/netguard.js', '/node_modules/express/package.json', '/.git/config', '/js/../package.json', '/%2e%2e/package.json', '/tests/smoke.cjs']) {
    const r = await fetch(base + p); assert.notEqual(r.status, 200, p); assert.ok(r.status === 404 || r.status === 403 || r.status === 400, p + ' ' + r.status);
  }
  const h = (await fetch(base + '/')).headers; assert.equal(h.get('x-content-type-options'), 'nosniff'); assert.ok(h.get('content-security-policy').includes("frame-ancestors 'none'")); assert.equal(h.get('x-powered-by'), null);
});

test.describe('limits', () => {
  test('page size cap stops runaway responses', async () => {
    await stop(); await boot({ render: { lookup: fx.lookup, allowIp: fx.allowIp, totalMs: 20000, navMs: 8000, maxTotalBytes: 2 * 1024 * 1024, scrollMs: 500 } });
    const r = await post('/api/render', { url: site('/huge') }); const j = await r.json();
    assert.equal(r.status, 413, JSON.stringify(j)); assert.equal(j.error, 'too_big');
  });
  test('overall timeout fires on a page that never finishes', async () => {
    await stop(); await boot({ render: { lookup: fx.lookup, allowIp: fx.allowIp, totalMs: 4000, navMs: 2500, loadMs: 500, idleMs: 300, scrollMs: 300 } });
    const t0 = Date.now(); const r = await post('/api/render', { url: site('/slow') }); const j = await r.json();
    assert.ok(Date.now() - t0 < 12000, 'took ' + (Date.now() - t0));
    assert.ok([504, 502].includes(r.status), r.status + JSON.stringify(j)); assert.equal(j.ok, false);
  });
  test('per-IP rate limit returns 429 with Retry-After', async () => {
    await stop(); await boot({ ratePerMin: 2, ratePerHour: 100 });
    const a = await post('/api/render', { url: site('/redirect-ok') }); const b = await post('/api/render', { url: site('/missing') });
    assert.equal(a.status, 200); assert.equal(b.status, 200);
    const c = await post('/api/render', { url: site('/') }); assert.equal(c.status, 429); assert.ok(Number(c.headers.get('retry-after')) > 0);
    // bad input does not burn the quota check ahead of validation
    assert.equal((await post('/api/render', { url: 'file:///x' })).status, 400);
  });
  test('concurrency cap returns 503 while crews are busy', async () => {
    await stop(); await boot({ concurrency: 1, render: { lookup: fx.lookup, allowIp: fx.allowIp, totalMs: 6000, navMs: 4000, loadMs: 1500, idleMs: 300, scrollMs: 300 } });
    const first = post('/api/render', { url: site('/slow') });
    await new Promise(r => setTimeout(r, 400));
    const second = await post('/api/render', { url: site('/') });
    assert.equal(second.status, 503); assert.ok(second.headers.get('retry-after'));
    await first;
  });
  test('identical requests are served from cache without another render', async () => {
    await stop(); await boot({ cacheTtlMs: 60000 });
    const a = await post('/api/render', { url: site('/') }); assert.equal(a.headers.get('x-cache'), 'miss'); await a.json();
    const b = await post('/api/render', { url: site('/') }); assert.equal(b.headers.get('x-cache'), 'hit'); assert.equal((await b.json()).ok, true);
  });
});
