'use strict';
/* proxy.js: a tiny filtering HTTP/HTTPS proxy, one instance per render.
 *
 * Chromium is pointed at it, so EVERY request the target page makes (the document, redirects,
 * images, scripts, XHR, websockets) is checked here, not just the first URL:
 *   - the host name is resolved once, every address must be public, and we connect to that exact IP
 *     (no second DNS lookup, so DNS rebinding cannot swap in a private address);
 *   - port and scheme rules apply to every hop;
 *   - bytes are counted so one page cannot stream gigabytes through us.
 * Blocked requests get a 403 (http) or a refused tunnel (https) and are recorded in state.blocked. */
const http = require('node:http');
const net = require('node:net');
const { resolvePublic, portOk, GuardError } = require('./netguard');

const HOP = new Set(['connection', 'proxy-connection', 'keep-alive', 'proxy-authorization', 'proxy-authenticate', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

class SessionProxy {
  constructor(opts = {}) {
    this.lookup = opts.lookup; this.allowIp = opts.allowIp;
    this.maxTotalBytes = opts.maxTotalBytes || 60 * 1024 * 1024;
    this.maxResponseBytes = opts.maxResponseBytes || 25 * 1024 * 1024;
    this.idleMs = opts.idleMs || 20000;
    this.state = { bytes: 0, requests: 0, blocked: [], overBudget: false };
    this.pins = new Map();       // host:port -> resolved address, so one render always talks to the same IP
    this.sockets = new Set();
    this.server = http.createServer((req, res) => this.onRequest(req, res));
    this.server.on('connect', (req, sock, head) => this.onConnect(req, sock, head));
    this.server.on('connection', s => { this.sockets.add(s); s.on('close', () => this.sockets.delete(s)); });
    this.server.on('clientError', (e, s) => { if (s.writable) s.end('HTTP/1.1 400 Bad Request\r\n\r\n'); });
  }
  start() { return new Promise((ok, fail) => { this.server.once('error', fail); this.server.listen(0, '127.0.0.1', () => ok(this.server.address().port)); }); }
  close() { this.server.close(); for (const s of this.sockets) s.destroy(); this.sockets.clear(); }

  block(host, reason) { if (this.state.blocked.length < 200) this.state.blocked.push({ host: String(host).toLowerCase(), reason }); }
  async target(host, port) {
    if (!portOk(port)) throw new GuardError('bad_port', 'port');
    const key = host.toLowerCase() + ':' + port;
    if (!this.pins.has(key)) this.pins.set(key, await resolvePublic(host, this.lookup, this.allowIp, port));
    return this.pins.get(key);
  }
  charge(n) {
    this.state.bytes += n;
    if (this.state.bytes > this.maxTotalBytes && !this.state.overBudget) { this.state.overBudget = true; setImmediate(() => { for (const s of this.sockets) s.destroy(); }); }
    return !this.state.overBudget;
  }

  async onRequest(req, res) {
    this.state.requests++;
    let u;
    try { u = new URL(req.url); } catch { res.writeHead(400).end(); return; }
    if (u.protocol !== 'http:') { res.writeHead(400).end(); return; }
    const port = u.port ? Number(u.port) : 80;
    let addr;
    try { addr = await this.target(u.hostname, port); }
    catch (e) { this.block(u.hostname, e.code || 'error'); res.writeHead(403, { 'content-type': 'text/plain' }).end('blocked'); return; }
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) if (!HOP.has(k)) headers[k] = v;
    headers.host = u.host; headers.connection = 'close';
    const up = http.request({ host: addr.address, port, method: req.method, path: u.pathname + u.search, headers, timeout: this.idleMs, agent: false }, ur => {
      const len = Number(ur.headers['content-length']);
      if (len > this.maxResponseBytes) { ur.destroy(); res.writeHead(502).end('too large'); this.state.overBudget = true; return; }
      const out = {};
      for (const [k, v] of Object.entries(ur.headers)) if (!HOP.has(k)) out[k] = v;
      res.writeHead(ur.statusCode, out);
      let got = 0;
      ur.on('data', c => { got += c.length; if (got > this.maxResponseBytes || !this.charge(c.length)) { this.state.overBudget = true; ur.destroy(); res.destroy(); } else res.write(c); });
      ur.on('end', () => res.end());
      ur.on('error', () => res.destroy());
    });
    up.on('timeout', () => up.destroy());
    up.on('error', () => { if (!res.headersSent) res.writeHead(502).end(); else res.destroy(); });
    res.on('close', () => up.destroy());
    req.pipe(up);
  }

  async onConnect(req, sock, head) {
    this.state.requests++;
    sock.on('error', () => {});
    const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(req.url || '');
    if (!m) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
    const host = m[1], port = Number(m[2]);
    let addr;
    try { addr = await this.target(host, port); }
    catch (e) { this.block(host, e.code || 'error'); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const up = net.connect({ host: addr.address, port, family: addr.family });
    up.setTimeout(this.idleMs, () => up.destroy()); sock.setTimeout(this.idleMs * 3, () => sock.destroy());
    this.sockets.add(up); up.on('close', () => this.sockets.delete(up));
    up.on('error', () => { if (sock.writable && !sock.destroyed) sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n'); sock.destroy(); });
    up.on('connect', () => {
      sock.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head && head.length) up.write(head);
      up.on('data', c => { if (!this.charge(c.length)) { up.destroy(); sock.destroy(); } });
      up.pipe(sock); sock.pipe(up);
    });
    sock.on('close', () => up.destroy());
  }
}
module.exports = { SessionProxy };
