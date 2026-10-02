// End to end: real server + fixture website. Paste a URL in the game, play the generated level, try each built-in site,
// the screenshot upload, and an error case.
process.env.CHROMIUM_NO_SANDBOX = '1';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const { createApp } = require('../server/index');
const fixtures = require('../server/test/fixtures');
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });

(async () => {
  const fx = await fixtures.start();
  const svc = createApp({ cacheTtlMs: 0, ratePerMin: 50, render: { lookup: fx.lookup, allowIp: fx.allowIp, totalMs: 25000, navMs: 9000, loadMs: 3000, idleMs: 1000, scrollMs: 1500 } });
  const srv = await new Promise(ok => { const s = svc.app.listen(0, '127.0.0.1', () => ok(s)); });
  const base = 'http://127.0.0.1:' + srv.address().port + '/';
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !/ERR_CERT|fonts\.g|status of 400|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET|Failed to load resource.*(fonts|gstatic|googleapis|400)/.test(t)) errors.push('console.' + m.type() + ': ' + t); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  const shot = async n => { await page.evaluate(() => DD.render()); await page.screenshot({ path: path.join(out, n + '.png') }); };
  const freeze = () => page.evaluate(() => { DD.waves.breakT = 1e9; DD.testFreeze = true; DD.P.inv = 1e9; });

  await page.goto(base); await page.waitForFunction(() => window.DD && window.DD.ready);
  await page.waitForFunction(() => !document.getElementById('urlInput').disabled, null, { timeout: 5000 });
  await page.screenshot({ path: path.join(out, 'p2-menu.png') });

  // 1. a real (fixture) website through the whole pipeline
  await page.fill('#urlInput', 'http://shop.test:' + fx.A.port + '/');
  await page.click('#urlGo');
  await page.waitForFunction(() => document.getElementById('intro').hidden, null, { timeout: 40000 });
  const info = await page.evaluate(() => { const L = DD.L; return { name: L.name, W: L.W, H: L.H, pct: DD.hud.pct(), hard: L.hard.length, barrels: L.barrels.length, solid: L.solidTotal, bg: L.srcOpts && L.srcOpts.bgColor, mode: DD.S.mode }; });
  console.log('imported level', JSON.stringify(info));
  await page.waitForTimeout(300); await freeze();
  await page.evaluate(() => { DD.S.camY = -160; DD.debugStep(30, 1 / 60); });
  await shot('p2-fixture-level');
  // shoot an explosive button, and chip at an armoured image
  const targets = await page.evaluate(() => ({ boom: DD.L.barrels.filter(b => b.rect).map(b => [Math.round(b.cx), Math.round(b.cy), b.r]), hard: DD.L.hard.map(b => [Math.round(b.x + b.w / 2), Math.round(b.y + b.h / 2), Math.round(b.hp)]) }));
  console.log('targets', JSON.stringify(targets));
  if (targets.hard.length) {
    const [hx, hy, hp] = targets.hard[0];
    const r = await page.evaluate(([x, y]) => { const L = DD.L, before = L.solidNow; for (let i = 0; i < 3; i++) DD.pop(x, y, 7, {}); DD.debugStep(10, 1 / 60); const b = L.hard[0]; return { hp: Math.round(b.hp), alive: b.alive, cleared: before - L.solidNow }; }, [hx, hy]);
    console.log('pistol chips armour (hp left, alive, cells cleared):', JSON.stringify(r));
    await page.evaluate(([x, y]) => { for (let i = 0; i < 6; i++) DD.boom(x, y, 78, { dmg: 0 }); DD.debugStep(12, 1 / 60); }, [hx, hy]);
    const r2 = await page.evaluate(() => ({ alive: DD.L.hard[0].alive })); console.log('after rockets: armour alive =', r2.alive);
    await shot('p2-armour-shattered');
  }
  if (targets.boom.length) {
    const [bx, by] = targets.boom[0];
    await page.evaluate(([x, y]) => { DD.S.camY = y - 300; DD.pop(x, y, 7, {}); DD.pop(x, y, 7, {}); DD.pop(x, y, 7, {}); DD.pop(x, y, 7, {}); DD.debugStep(14, 1 / 60); }, [bx, by]);
    await shot('p2-explosive-block');
    console.log('explosive blocks left:', await page.evaluate(() => DD.L.barrels.filter(b => b.rect && b.alive).length), 'of', targets.boom.length);
  }

  // 2. back to the menu, try every built-in site
  for (const id of ['megasave', 'chirpr', 'overshare', 'tubeline']) {
    await page.evaluate(() => { DD.testFreeze = false; DD.openMenu(); });
    await page.click('.site[data-id="' + id + '"]'); await page.click('#start');
    await page.waitForTimeout(250); await freeze();
    await page.evaluate(() => { DD.S.camY = -160; DD.debugStep(20, 1 / 60); });
    const d = await page.evaluate(() => ({ name: DD.L.name, W: DD.L.W, H: DD.L.H, hard: DD.L.hard.length, expl: DD.L.barrels.filter(b => b.rect).length, drums: DD.L.barrels.filter(b => !b.rect).length }));
    console.log('site', id, JSON.stringify(d));
    await shot('p2-site-' + id);
    if (id !== 'megasave') { await page.evaluate(() => { DD.S.camY = 500; DD.P.y = 500; DD.debugStep(2, 1 / 60); }); await shot('p2-site-' + id + '-mid'); }
  }

  // 3. screenshot upload
  await page.evaluate(() => { DD.testFreeze = false; DD.openMenu(); });
  await page.setInputFiles('#shotInput', path.join(out, 'p2-site-chirpr.png'));
  await page.waitForFunction(() => document.getElementById('intro').hidden, null, { timeout: 30000 });
  console.log('uploaded level', JSON.stringify(await page.evaluate(() => ({ name: DD.L.name, W: DD.L.W, H: DD.L.H, solid: DD.L.solidTotal }))));
  await page.waitForTimeout(200); await freeze(); await page.evaluate(() => { DD.S.camY = 100; DD.debugStep(10, 1 / 60); }); await shot('p2-upload-level');

  // 4. errors shown inline
  await page.evaluate(() => { DD.testFreeze = false; DD.openMenu(); });
  for (const bad of ['http://127.0.0.1:' + fx.B.port + '/', 'file:///etc/passwd', 'http://shop.test:' + fx.A.port + '/redirect-private']) {
    await page.fill('#urlInput', bad); await page.click('#urlGo');
    await page.waitForFunction(() => /\S/.test(document.getElementById('siteMsg').textContent) && !document.querySelector('#siteMsg.load'), null, { timeout: 30000 });
    console.log('error shown for', bad.slice(0, 40), '->', await page.textContent('#siteMsg'));
  }
  await page.screenshot({ path: path.join(out, 'p2-menu-error.png') });
  console.log('internal server hits:', fx.hitsB.length);
  await browser.close(); srv.close(); await svc.close(); fx.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
  process.exit(0);
})().catch(e => { console.error('FAILED', e); process.exit(1); });
