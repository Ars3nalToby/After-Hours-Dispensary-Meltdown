// Scenes: zombie lineup, barrel chain reaction, game-over card, win card, mobile layout, reduced motion.
const { chromium, serve, open, frozen, step, out } = require('./lib.cjs');
const path = require('path');
(async () => {
  const { srv, url } = await serve(); const browser = await chromium.launch(); const errors = [];
  const shot = async (page, n, clip) => { await page.evaluate(() => DD.render()); await page.screenshot({ path: path.join(out, n + '.png'), clip }); };
  {
    const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 }, errors, 'scenes');
    await frozen(page, 500, -2, -160);
    await page.evaluate(() => { const D = DD; D.P.x = 640 - 90; D.P.y = -2; D.P.hp = 100;
      D.spawnZombie(1, 380, -2); D.spawnZombie(2, 420, -2); D.spawnZombie(3, 340, -2); D.spawnZombie(4, 700, -2); D.zombies.forEach(z => { z.emerge = 0; z.stun = 99; }); });
    await step(page, 30);
    await page.evaluate(() => { DD.zombies.forEach(z => { if (z.alive) z.stun = 99; }); });
    await shot(page, 'z-lineup', { x: 300, y: 60, width: 700, height: 200 });
    // spit + damage numbers: let the spitter act
    await page.evaluate(() => { const D = DD; D.zombies.forEach(z => { z.stun = 0; }); D.P.inv = 0; });
    await step(page, 120);
    await shot(page, 'z-action', { x: 200, y: 20, width: 900, height: 300 });
    await ctx.close();
  }
  {   // barrel chain: shoot a drum in the pharmacist banner region
    const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 } }, errors, 'barrels');
    await frozen(page, 500, 0, 0);
    const info = await page.evaluate(() => { const L = DD.L; const b = L.barrels.filter(b => b.y > 1200 && b.y < 1700); return { total: L.barrels.length, bs: b.map(x => [Math.round(x.cx), Math.round(x.cy)]) }; });
    console.log('barrels', JSON.stringify(info));
    const t = info.bs[0];
    await page.evaluate(([x, y]) => { const D = DD; D.P.x = x - 200; D.P.y = y - 40; D.S.camY = y - 400; D.pointer.x = x + D.S.offX - D.S.camX; }, t);
    await page.evaluate(([x, y]) => { const D = DD; D.pop(x, y, 7, {}); D.pop(x, y, 7, {}); D.pop(x, y, 7, {}); D.pop(x, y, 7, {}); }, t);
    await step(page, 1);
    for (const [n, name] of [[8, 'b1'], [20, 'b2'], [50, 'b3'], [120, 'b4']]) { await step(page, n); await page.evaluate(([y]) => { DD.S.camY = y - 400; }, [t[1]]); await shot(page, 'barrels-' + name); }
    console.log('barrels alive', await page.evaluate(() => DD.L.barrels.filter(b => b.alive).length));
    await ctx.close();
  }
  {   // game-over and win cards
    const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 } }, errors, 'cards');
    await page.click('#start'); await page.waitForTimeout(200);
    await page.evaluate(() => { const D = DD; D.S.score = 18420; D.S.kills = 47; D.S.wave = 4; D.hurtPlayer(500, 0, 0, true); });
    await page.waitForTimeout(3500); await page.screenshot({ path: path.join(out, 'card-dead.png') });
    await page.click('#endAgain'); await page.waitForTimeout(300);
    await page.evaluate(() => { const D = DD; D.L.solidNow = Math.floor(D.L.solidTotal * 0.1); D.S.score = 31250; D.S.kills = 88; });
    await page.waitForTimeout(500); await page.screenshot({ path: path.join(out, 'card-win.png') });
    await ctx.close();
  }
  {   // mobile portrait with touch
    const { ctx, page } = await open(browser, url, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, errors, 'mobile');
    await page.screenshot({ path: path.join(out, 'mobile-title.png') });
    await page.tap('#start'); await page.waitForTimeout(800);
    await page.evaluate(() => { DD.selectWeapon(6); });
    await page.touchscreen.tap(250, 420); await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, 'mobile-play.png') });
    await ctx.close();
  }
  {   // reduced motion: shake and flash must be tamed
    const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }, errors, 'reduced');
    await frozen(page, 500, 300, 100);
    const r = await page.evaluate(() => { const D = DD; D.boom(640, 500, 100, { dmg: 0 }); return { rm: D.reduceMotion, trauma: D.S.trauma, flash: D.S.flash, chroma: D.S.chroma, zoom: D.S.zoom, hitstop: D.S.hitstop }; });
    console.log('reduced motion after big boom', JSON.stringify(r));
    await ctx.close();
  }
  {   // every synthesised sound must play without throwing
    const { ctx, page } = await open(browser, url, { viewport: { width: 800, height: 600 } }, errors, 'audio');
    await page.click('#start'); await page.waitForTimeout(200);
    const r = await page.evaluate(async () => {
      const names = ['pistol', 'smg', 'shotgun', 'minigun', 'flamestart', 'railcharge', 'rail', 'rocket', 'throw', 'tick', 'pop', 'whistle', 'plane', 'beacon', 'holeopen', 'holeend', 'groan', 'zhit', 'zdie', 'hurt', 'pickup', 'jump', 'dash', 'wave', 'over', 'win', 'spit', 'splat', 'combo', 'click', 'smash', 'boom'];
      let ok = 0; for (const n of names) { try { DD.sfx(n, 1, 1); ok++; } catch (e) { return 'threw on ' + n + ': ' + e.message; } await new Promise(r => setTimeout(r, 5)); }
      for (const l of ['mini', 'flame', 'hole', 'crackle']) { DD.loop(l, true, 0.5); DD.loop(l, false); }
      return 'played ' + ok + ' of ' + names.length;
    });
    console.log('audio', r);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
