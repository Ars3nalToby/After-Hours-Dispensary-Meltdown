/* fire.js: fire that spreads across the page and eats it.
 * Fire lives on a coarse grid (FC px cells). A burning cell chars its pixels at once, spreads to
 * neighbours (faster upward, and it can jump small gaps), and after ~1s burns out: the page pixels
 * are removed and soot stays on the paper. Ink and text are more flammable than card stock.
 * State per cell: 0 = untouched, 1..250 = ticks of burning left, 255 = burnt out. */
(function (D) {
'use strict';
const L = D.L, FC = D.FC, rand = D.rand;
const MAX_ACT = 3600, TICK = 0.1;
let st = null, act = new Int32Array(MAX_ACT), nAct = 0, acc = 0, cursor = 0, FW = 0, FH = 0;
const NB = [[0, -1, 1.5], [-1, 0, 1], [1, 0, 1], [0, 1, 0.55]];   // dx, dy, spread multiplier (fire climbs)

const F = D.fire = {
  reset() { FW = L.FW; FH = L.FH; st = new Uint8Array(FW * FH); nAct = 0; acc = 0; cursor = 0; },
  count() { return nAct; },
  ignite(fx, fy, life) {
    if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return false;
    const fi = fy * FW + fx;
    if (st[fi] !== 0 || nAct >= MAX_ACT || L.flam[fi] === 0 || !L.fireHas(fx, fy)) return false;
    st[fi] = life || (5 + (Math.random() * 6 | 0));
    act[nAct++] = fi;
    L.charRect(fx * FC, fy * FC, FC, FC);
    const b = L.barGrid[fi]; if (b) D.damageBarrel(b - 1, 6, 0.1);
    return true;
  },
  igniteAt(x, y, p) { if (p >= 1 || Math.random() < p) return F.ignite(Math.floor(x / FC), Math.floor(y / FC)); return false; },
  igniteArea(x, y, r, p) {
    let n = 0;
    for (let fy = Math.floor((y - r) / FC); fy <= Math.floor((y + r) / FC); fy++)
      for (let fx = Math.floor((x - r) / FC); fx <= Math.floor((x + r) / FC); fx++) {
        const dx = fx * FC + 3 - x, dy = fy * FC + 3 - y;
        if (dx * dx + dy * dy <= r * r && (p >= 1 || Math.random() < p) && F.ignite(fx, fy)) n++;
      }
    return n;
  },
  burningAt(x, y) {
    const fx = Math.floor(x / FC), fy = Math.floor(y / FC);
    if (fx < 0 || fy < 0 || fx >= FW || fy >= FH) return false;
    const s = st[fy * FW + fx]; return s > 0 && s < 255;
  },
  update(dt) {
    acc += dt;
    while (acc >= TICK) { acc -= TICK; tick(); }
  },
  // Spawn a few flame particles from burning cells each frame (budgeted so big fires stay cheap).
  emit(budget) {
    if (!nAct) return;
    for (let k = 0; k < budget; k++) {
      cursor = (cursor + 1 + (Math.random() * 3 | 0)) % nAct;
      const fi = act[cursor], fx = fi % FW, fy = (fi / FW) | 0;
      D.fx.flame(fx * FC + Math.random() * FC, fy * FC + Math.random() * FC);
    }
  },
};

function tick() {
  for (let i = nAct - 1; i >= 0; i--) {
    const fi = act[i], fx = fi % FW, fy = (fi / FW) | 0;
    let s = st[fi] - 1;
    // Spread. The chance scales with the target's flammability.
    for (let n = 0; n < 4; n++) {
      const nx = fx + NB[n][0], ny = fy + NB[n][1];
      if (nx < 0 || ny < 0 || nx >= FW || ny >= FH) continue;
      const ni = ny * FW + nx;
      if (st[ni] === 0 && L.flam[ni] && Math.random() < 0.3 * NB[n][2] * L.flam[ni] / 255) F.ignite(nx, ny);
    }
    if (Math.random() < 0.05) F.ignite(fx + ((Math.random() * 5 | 0) - 2), fy + ((Math.random() * 5 | 0) - 2));   // hop small gaps
    if (Math.random() < 0.02) D.fx.smokeBit(fx * FC + 3, fy * FC);
    if (s <= 0) {
      st[fi] = 255; L.burnCell(fx, fy);
      if (Math.random() < 0.25) D.fx.ember(fx * FC + 3, fy * FC + 3, 0.6);
      act[i] = act[--nAct];
    } else st[fi] = s;
  }
}
})(window.DD);
