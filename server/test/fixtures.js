'use strict';
// Local fixture websites for the render tests. "A" is the site we are allowed to render (loopback is only
// allowed for this one port through the test-only allowIp hook). "B" plays the internal network: it must never be reached.
const http = require('node:http');

function listen(handler) {
  return new Promise(ok => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => ok({ server: s, port: s.address().port })); });
}
const PAGE = `<!doctype html><html><head><title>Fixture shop</title><style>
body{margin:0;background:#f3efe6;font-family:Arial,sans-serif}.wrap{width:1000px;margin:0 auto;background:#fff;padding:24px}
h1{font-size:42px;margin:0 0 12px}p{font-size:16px;line-height:1.5;width:600px}.card{display:inline-block;width:220px;height:160px;background:#ffd23f;margin:8px;vertical-align:top;padding:8px}
button{font-size:18px;padding:14px 28px;background:#e83f6f;color:#fff;border:0;border-radius:8px}
.hero{width:960px;height:220px;background:linear-gradient(90deg,#0e6e6e,#3ba55c);color:#fff;font-size:34px;padding:20px;box-sizing:border-box}
</style></head><body><div class="wrap"><h1>Mega Fixture Shop</h1>
<div class="hero">Big sale banner<br><img alt="" width="120" height="80" src="/pic.svg"></div>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. This paragraph exists so the extractor finds a text block to turn into a platform.</p>
<div class="card"><b>Card one</b><p style="width:180px">Short text</p></div><div class="card"><b>Card two</b></div><div class="card"><b>Card three</b></div>
<p><button id="buy">Buy now</button> <button>Add to cart</button></p>
<p style="margin-top:300px">Footer text far down the page.</p></div>%EXTRA%</body></html>`;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="#8ecae6"/><circle cx="60" cy="40" r="26" fill="#e83f6f"/></svg>';

async function start() {
  const hitsB = [];
  const B = await listen((req, res) => { hitsB.push(req.url); res.writeHead(200, { 'content-type': 'text/plain' }); res.end('INTERNAL SECRET'); });
  const A = await listen((req, res) => {
    const u = req.url.split('?')[0];
    if (u === '/') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE.replace('%EXTRA%', '')); }
    if (u === '/pic.svg') { res.writeHead(200, { 'content-type': 'image/svg+xml' }); return res.end(SVG); }
    if (u === '/redirect-ok') { res.writeHead(302, { location: '/' }); return res.end(); }
    if (u === '/redirect-private') { res.writeHead(302, { location: 'http://internal.test:' + B.port + '/secret' }); return res.end(); }
    if (u === '/redirect-chain') { res.writeHead(302, { location: '/redirect-private' }); return res.end(); }
    if (u === '/sub-private') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(PAGE.replace('%EXTRA%', `<img src="http://internal.test:${B.port}/leak.png"><img src="http://127.0.0.1:${B.port}/literal.png"><script>fetch("http://internal.test:${B.port}/xhr").catch(()=>{});new Image().src="http://localhost:${B.port}/img2"</script><iframe src="http://internal.test:${B.port}/frame"></iframe>`)); }
    if (u === '/huge') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html><body>'); const chunk = 'x'.repeat(64 * 1024); const t = setInterval(() => { if (!res.write(chunk)) return; }, 1); res.on('close', () => clearInterval(t)); return; }
    if (u === '/slow') { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html><body>loading'); return; }   // never ends
    if (u === '/long') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body style="margin:0"><div style="height:9000px;background:linear-gradient(#fff,#ccc)"><h1>Very tall</h1></div></body></html>'); }
    if (u === '/ftp-link') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<html><body><a href="file:///etc/passwd">x</a><img src="file:///etc/hostname"></body></html>'); }
    if (u === '/err500') { res.writeHead(500, { 'content-type': 'text/html' }); return res.end('boom'); }
    res.writeHead(404, { 'content-type': 'text/html' }); res.end('<html><body><h1>Not found</h1></body></html>');
  });
  // Names the tests use. Both really live on loopback; the allow rule below only lets the shop's own port through.
  const lookup = async h => (/\.test$/.test(h) ? [{ address: '127.0.0.1', family: 4 }] : require('node:dns').promises.lookup(h, { all: true }));
  return { A, B, hitsB, lookup, allowIp: (ip, port) => ip === '127.0.0.1' && port === A.port, close: () => { A.server.closeAllConnections?.(); B.server.closeAllConnections?.(); A.server.close(); B.server.close(); } };
}
module.exports = { start };
