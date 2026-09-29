const { chromium, serve, open, frozen, step, out } = require('./lib.cjs');
const path = require('path');
(async () => {
  const { srv, url } = await serve(); const browser = await chromium.launch(); const errors = [];
  const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, errors, 'diag');
  await frozen(page, 900, 300, 300);
  await page.evaluate(() => { DD.fire.igniteArea(110, 322, 10, 1); });
  for (const [n, name] of [[90, 'fire1'], [150, 'fire2'], [240, 'fire3']]) {
    await step(page, n);
    await page.screenshot({ path: path.join(out, 'diag-' + name + '.png'), clip: { x: 100, y: 240, width: 500, height: 400 } });
  }
  console.log(await page.evaluate(() => JSON.stringify({ fires: DD.fire.count(), pct: DD.hud.pct() })));
  await browser.close(); srv.close(); console.log(errors.join('\n') || 'no errors');
})();
