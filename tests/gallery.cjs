// Captures effect frames: explosion timeline, every weapon, barrel chain, fire spread, black hole, airstrike.
const { chromium, serve, open, frozen, step, out } = require('./lib.cjs');
const path = require('path');
(async () => {
  const { srv, url } = await serve(); const browser = await chromium.launch(); const errors = [];
  const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 } }, errors, 'gallery');
  const shot = async n => { await page.evaluate(() => DD.render()); return page.screenshot({ path: path.join(out, n + '.png') }); };
  await frozen(page, 300, 520, 300);
  await step(page, 2);
  // 1. explosion timeline: hero card area
  await page.evaluate(() => DD.boom(640, 620, 78, { dmg: 0 }));
  let t = 0;
  for (const [name, target] of [['a-0-flash', 0], ['a-1-fireball', 0.1], ['a-2-peak', 0.3], ['a-3-smoke', 0.8], ['a-4-embers', 1.8], ['a-5-aftermath', 4]]) {
    const n = Math.round((target - t) * 60); if (n > 0) await step(page, n); t = target; await shot(name);
  }
  // 2. weapons: reset level, fire each for a while
  const W = ['pistol', 'smg', 'shotgun', 'minigun', 'flame', 'rail', 'rocket', 'air', 'hole'];
  for (let i = 0; i < 9; i++) {
    await page.evaluate(([i]) => { const D = DD; D.newGame(false); D.waves.breakT = 1e9; D.S.mode = 'won'; D.testFreeze = true; D.P.x = 260; D.P.y = 470; D.P.inv = 1e9; D.S.camY = 300; D.P.hp = 100;
      D.selectWeapon(i); D.pointer.has = true; D.pointer.x = 900; D.pointer.y = (i === 4 ? 285 : i === 3 || i === 1 ? 330 : 440); D.input.firing = true; D.input.fireBuf = 0.2; }, [i]);
    await step(page, 3);
    await page.evaluate(() => { DD.P.vx = 0; });
    const total = [12, 20, 12, 90, 40, 40, 32, 150, 100][i];
    await step(page, total);
    await page.evaluate(() => DD.render()); await shot('w-' + (i + 1) + '-' + W[i]);
    await page.evaluate(() => { DD.input.firing = false; });
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
