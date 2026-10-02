// Headless smoke test: loads the game, starts it, exercises weapons, captures screenshots and console errors.
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..'), out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  if (req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{"ok":false}'); }   // static host: no render server
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); res.end(d); } });
});
(async () => {
  await new Promise(r => srv.listen(0, r)); const url = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  async function session(name, opts, fn) {
    const ctx = await browser.newContext(opts); const page = await ctx.newPage();
    page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_CERT|fonts\.g/.test(m.text())) errors.push(name + ' console.' + m.type() + ': ' + m.text()); });
    page.on('pageerror', e => errors.push(name + ' pageerror: ' + e.message + '\n' + (e.stack || '')));
    await page.goto(url); await page.waitForFunction(() => window.DD && window.DD.ready, null, { timeout: 15000 });
    await fn(page); await ctx.close();
  }
  await session('desktop', { viewport: { width: 1280, height: 800 } }, async page => {
    await page.screenshot({ path: path.join(out, 'desktop-title.png') });
    await page.click('#start'); await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, 'desktop-play.png') });
    // fire a rocket at the page and screenshot mid-explosion
    await page.evaluate(() => { const D = DD; D.selectWeapon(6); D.pointer.has = true; D.pointer.x = 640; D.pointer.y = 500; });
    await page.mouse.move(640, 500); await page.mouse.click(640, 500);
    await page.waitForTimeout(700); await page.screenshot({ path: path.join(out, 'desktop-rocket.png') });
    await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, 'desktop-after.png') });
  });
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
