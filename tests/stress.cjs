// Stress: rapid-fire big explosions, fire and black holes at once; reports JS cost per frame and peak particle count.
const { chromium, serve, open, out } = require('./lib.cjs');
const path = require('path');
(async () => {
  const { srv, url } = await serve(); const browser = await chromium.launch(); const errors = [];
  const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 } }, errors, 'stress');
  await page.click('#start');
  await page.evaluate(() => { const D = DD; D.waves.breakT = 1e9; D.P.inv = 1e9; D.P.x = 500; D.P.y = 600; window.__peak = 0; window.__f = [];
    let last = performance.now(); (function loop(t) { window.__f.push(t - last); last = t; window.__peak = Math.max(window.__peak, D.fx.count()); requestAnimationFrame(loop); })(last);
    let n = 0; const iv = setInterval(() => { for (let i = 0; i < 3; i++) D.boom(D.S.camX - D.S.offX + 100 + Math.random() * (D.S.VW - 200), D.S.camY + 100 + Math.random() * 500, 60 + Math.random() * 40, { dmg: 0 }); D.fire.igniteArea(300 + Math.random() * 600, 200 + Math.random() * 900, 8, 1); if (++n > 60) clearInterval(iv); }, 60); });
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(2500);
    console.log(await page.evaluate(() => { const D = DD, p = D.perf, f = window.__f.splice(0), s = f.slice().sort((a, b) => a - b); const r = { q: +D.quality.toFixed(2), updMs: +(p.upd / p.n).toFixed(2), renMs: +(p.ren / p.n).toFixed(2), fps: +(1000 / (f.reduce((a, b) => a + b, 0) / f.length)).toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), worst: +s[s.length - 1].toFixed(1), peakParticles: window.__peak, fires: D.fire.count() }; p.upd = p.ren = p.n = 0; return JSON.stringify(r); }));
  }
  await page.screenshot({ path: path.join(out, 'stress.png') });
  await browser.close(); srv.close(); console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
})().catch(e => { console.error('FAILED', e); process.exit(1); });
