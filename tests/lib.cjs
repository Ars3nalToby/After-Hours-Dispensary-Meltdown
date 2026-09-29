// Shared helpers for the headless tests: static server, browser session, frozen-world stepping.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };
function serve() {
  const srv = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
  });
  return new Promise(r => srv.listen(0, () => r({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}
async function open(browser, url, opts, errors, name) {
  const ctx = await browser.newContext(opts); const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_CERT|fonts\.g/.test(t)) errors.push(name + ' console.' + m.type() + ': ' + t); });
  page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '')));
  await page.goto(url); await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 15000 });
  return { ctx, page };
}
// Start a game, freeze the wave timer, and place the player.
async function frozen(page, px, py, camY) {
  await page.click('#start'); await page.waitForTimeout(100);
  await page.evaluate(([px, py, camY]) => { const D = DD; D.waves.breakT = 1e9; D.S.mode = 'won'; D.testFreeze = true; D.P.x = px; D.P.y = py; D.P.inv = 1e9; D.S.camY = camY; D.pointer.has = true; }, [px, py, camY]);
}
const step = (page, n, dt) => page.evaluate(([n, dt]) => DD.debugStep(n, dt), [n, dt || 1 / 60]);
module.exports = { chromium, serve, open, frozen, step, out };
