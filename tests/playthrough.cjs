// Real-time bot playthrough: aims at zombies, cycles weapons, logs FPS and state, screenshots along the way.
const { chromium, serve, open, out } = require('./lib.cjs');
const path = require('path');
const SECS = +process.argv[2] || 40, GOD = process.argv[3] === 'god';
(async () => {
  const { srv, url } = await serve(); const browser = await chromium.launch(); const errors = [];
  const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 } }, errors, 'play');
  await page.click('#start');
  await page.evaluate((GOD) => {
    const D = DD, S = D.S, P = D.P;
    window.__frames = []; let last = performance.now();
    (function loop(t) { window.__frames.push(t - last); last = t; requestAnimationFrame(loop); })(last);
    let wi = 0, wt = 0;
    setInterval(() => {
      if (S.mode !== 'play') { D.input.firing = false; return; }
      if (GOD) P.hp = P.maxHp;
      let best = null, bd = 1e9;
      for (const z of D.zombies) if (z.alive) { const d = Math.hypot(z.x - P.x, z.y - P.y); if (d < bd) { bd = d; best = z; } }
      D.keys.left = D.keys.right = false;
      if (best) {
        D.pointer.has = true; D.pointer.x = best.x - S.camX + S.offX; D.pointer.y = best.y - best.h / 2 - S.camY;
        D.input.firing = true; D.input.fireBuf = 0.1;
        if (bd < 90) { if (best.x < P.x) D.keys.right = true; else D.keys.left = true; if (P.onGround && Math.random() < 0.05) D.tryDash(); }
        else if (bd > 260) { if (best.x < P.x) D.keys.left = true; else D.keys.right = true; }
      } else { D.input.firing = false; }
      wt += 0.05; if (wt > 3.5) { wt = 0; wi = (wi + 1) % 9; D.selectWeapon(wi); }
      if (Math.random() < 0.03) D.input.grenadeBuf = 0.2;
    }, 50);
  }, GOD);
  for (let s = 5; s <= SECS; s += 5) {
    await page.waitForTimeout(5000);
    const st = await page.evaluate(() => { const D = DD, pf = D.perf, pu = +(pf.upd / pf.n).toFixed(2), pr = +(pf.ren / pf.n).toFixed(2); pf.upd = pf.ren = pf.n = 0; const f = window.__frames.splice(0), avg = f.reduce((a, b) => a + b, 0) / f.length, sorted = f.slice().sort((a, b) => a - b);
      return { mode: D.S.mode, wave: D.S.wave, alive: D.aliveCount(), kills: D.S.kills, score: Math.floor(D.S.score), hp: Math.round(D.P.hp), pct: D.hud.pct(), particles: D.fx.count(), fires: D.fire.count(), fps: +(1000 / avg).toFixed(1), updMs: pu, renMs: pr, p95ms: +sorted[Math.floor(sorted.length * 0.95)].toFixed(1), maxms: +sorted[sorted.length - 1].toFixed(1) }; });
    console.log(s + 's', JSON.stringify(st));
    console.log('  zombies', JSON.stringify(await page.evaluate(() => DD.zombies.filter(z => z.alive).map(z => ({ t: z.type, x: Math.round(z.x), y: Math.round(z.y), vx: Math.round(z.vx), g: z.onGround, stuck: +z.stuck.toFixed(1), stun: +z.stun.toFixed(1), hp: Math.round(z.hp) })).concat([{ P: [Math.round(DD.P.x), Math.round(DD.P.y)] }]))));
    if (s % 10 === 0) await page.screenshot({ path: path.join(out, 'play-' + s + '.png') });
    if (st.mode !== 'play') { await page.waitForTimeout(1200); await page.screenshot({ path: path.join(out, 'play-end.png') }); break; }
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
