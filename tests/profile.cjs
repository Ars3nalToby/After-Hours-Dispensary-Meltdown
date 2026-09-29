// Times D.render() at a heavy frozen moment with individual passes disabled, to find what dominates.
const { chromium, serve, open, frozen, step } = require('./lib.cjs');
(async () => {
  const { srv, url } = await serve(); const browser = await chromium.launch(); const errors = [];
  const { ctx, page } = await open(browser, url, { viewport: { width: 1280, height: 800 } }, errors, 'profile');
  await frozen(page, 500, 400, 100);
  await page.evaluate(() => { const D = DD; for (let i = 0; i < 24; i++) D.boom(200 + Math.random() * 800, 200 + Math.random() * 500, 60 + Math.random() * 40, { dmg: 0 }); for (let i = 0; i < 30; i++) D.fire.igniteArea(300 + Math.random() * 600, 200 + Math.random() * 900, 8, 1); });
  await step(page, 40);
  const res = await page.evaluate(() => {
    const D = DD, out = {}, fx = D.fx;
    const time = (label) => { const t0 = performance.now(); for (let i = 0; i < 20; i++) D.render(); const t = (performance.now() - t0) / 20; out[label] = +t.toFixed(2); };
    out.particles = fx.count(); out.kinds = fx.stats(); out.K = fx.K;
    time('all');
    const orig = { smoke: fx.drawSmoke, fire: fx.drawFire, add: fx.drawAdd, solid: fx.drawSolid, text: fx.drawText };
    for (const k of ['smoke', 'fire', 'add', 'solid']) { const name = 'draw' + k[0].toUpperCase() + k.slice(1); fx[name] = () => {}; time('no-' + k); fx[name] = orig[k]; }
    const S = D.S; const dim = S.dim, chroma = S.chroma; S.dim = 0; S.chroma = 0; time('no-dim-no-chroma'); S.dim = dim; S.chroma = chroma;
    const zoom = S.zoom; S.zoom = 0; time('no-zoom'); S.zoom = zoom;
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})();
