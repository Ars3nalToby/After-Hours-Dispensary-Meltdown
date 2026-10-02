'use strict';
// HTTPS goes through the proxy's CONNECT path. A self-signed fixture proves tunnelling works and that private targets are refused there too.
const test = require('node:test');
const assert = require('node:assert/strict');
const https = require('node:https');
const http = require('node:http');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
process.env.CHROMIUM_NO_SANDBOX = process.env.CHROMIUM_NO_SANDBOX || '1';
const { Renderer, RenderError } = require('../render');
const { SessionProxy } = require('../proxy');

let hasOpenssl = true;
try { execFileSync('openssl', ['version'], { stdio: 'ignore' }); } catch { hasOpenssl = false; }

test('https site renders through the CONNECT tunnel; https to a private port is refused', { skip: !hasOpenssl && 'openssl not installed' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-cert-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(dir, 'k.pem'), '-out', path.join(dir, 'c.pem'), '-days', '2', '-subj', '/CN=secure.test', '-addext', 'subjectAltName=DNS:secure.test,DNS:internal.test'], { stdio: 'ignore' });
  const key = fs.readFileSync(path.join(dir, 'k.pem')), cert = fs.readFileSync(path.join(dir, 'c.pem'));
  const hits = [];
  const inner = https.createServer({ key, cert }, (req, res) => { hits.push(req.url); res.writeHead(200, { 'content-type': 'text/plain' }); res.end('INTERNAL'); });
  await new Promise(ok => inner.listen(0, '127.0.0.1', ok));
  const innerPort = inner.address().port;
  const site = https.createServer({ key, cert }, (req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<html><head><title>Secure shop</title></head><body style="margin:0;background:#fff"><h1>Secure</h1><button>Buy</button><img src="https://internal.test:${innerPort}/leak.png"></body></html>`);
  });
  await new Promise(ok => site.listen(0, '127.0.0.1', ok));
  const sitePort = site.address().port;
  const lookup = async h => [{ address: '127.0.0.1', family: 4 }];
  const r = new Renderer({ lookup, allowIp: (ip, port) => port === sitePort, ignoreHTTPSErrors: true, totalMs: 20000, navMs: 8000, loadMs: 3000, idleMs: 800, scrollMs: 500 });
  try {
    const j = await r.render('https://secure.test:' + sitePort + '/');
    assert.equal(j.ok, true); assert.equal(j.title, 'Secure shop'); assert.ok(j.blockedRequests >= 1, 'subresource to the internal https port must be blocked');
    assert.deepEqual(hits, [], 'internal https server must see no request');
    await assert.rejects(r.render('https://internal.test:' + innerPort + '/'), e => e instanceof RenderError && e.code === 'blocked');
    assert.deepEqual(hits, []);
  } finally { await r.close(); site.close(); inner.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test('DNS rebinding: a host that answers public first and private second never reaches the private address', async () => {
  const hits = [];
  const internal = http.createServer((req, res) => { hits.push(req.url); res.end('secret'); });
  await new Promise(ok => internal.listen(0, '127.0.0.1', ok));
  const port = internal.address().port;
  let calls = 0;
  const lookup = async () => (++calls === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]);   // 1st answer public, then private
  const proxy = new SessionProxy({ lookup });
  const pport = await proxy.start();
  const status = await new Promise(ok => {
    // Ask for an http URL on port <internal> through the proxy; lookup #1 is spent by "validation", the proxy's own lookup is #2.
    calls = 1;
    http.request({ host: '127.0.0.1', port: pport, method: 'GET', path: `http://rebind.test:${port}/steal`, headers: { host: 'rebind.test:' + port } }, res => { res.resume(); ok(res.statusCode); }).on('error', () => ok(0)).end();
  });
  assert.equal(status, 403); assert.deepEqual(hits, []);
  assert.equal(proxy.state.blocked[0].host, 'rebind.test');
  // and the pinned answer is reused, so a later private answer cannot swap in mid-render
  const ok2 = new SessionProxy({ lookup: (() => { let n = 0; return async () => (++n === 1 ? [{ address: '93.184.216.34', family: 4 }] : [{ address: '127.0.0.1', family: 4 }]); })() });
  const a1 = await ok2.target('flip.test', 80), a2 = await ok2.target('flip.test', 80);
  assert.equal(a1.address, '93.184.216.34'); assert.equal(a2.address, '93.184.216.34');
  proxy.close(); ok2.close(); internal.close();
});
