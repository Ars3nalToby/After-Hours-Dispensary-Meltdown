/* fx.js: pooled particle system and all explosion/weapon visuals.
 * Everything is preallocated: one particle pool (swap-remove, no per-frame allocation),
 * small pools for rings, crater glows, smoke emitters and score popups, and pre-rendered
 * sprites for fire and smoke so a fireball is a few dozen drawImage calls, not gradients. */
(function (D) {
'use strict';
const S = D.S, L = D.L, TAU = D.TAU, rand = D.rand;
const K = { DEB: 1, SMOKE: 2, FIRE: 3, SPARK: 4, EMBER: 5, CHUNK: 6, GIB: 7, BLOOD: 8, SHELL: 9, FLASH: 10, DUST: 11 };
const MAXP = 1800;
const PS = [];
for (let i = 0; i < MAXP; i++) PS.push({ k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1, rot: 0, vr: 0, col: '', a: 1, g: 0, drag: 0, z: 0, b: 0, ref: -1 });
let np = 0, stainBudget = 0;

function spawn(k, low) {
  if (np >= MAXP || (low && np > MAXP * 0.75)) return null;
  const p = PS[np++];
  p.k = k; p.ref = -1; p.b = 0; p.z = 0; p.a = 1; p.drag = 0; p.g = 0; p.rot = 0; p.vr = 0; p.s = 1; p.col = '';
  return p;
}
function kill(i) { const t = PS[i]; PS[i] = PS[np - 1]; PS[np - 1] = t; np--; }

/* ---------- pre-rendered sprites ---------- */
const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const SPR = { fire: [], smoke: [], flash: null };
(function () {
  const cols = [[255, 255, 245], [255, 244, 176], [255, 208, 74], [255, 167, 38], [255, 122, 26], [224, 69, 26], [160, 42, 18], [74, 26, 16]];
  for (const c of cols) {
    const cv = mk(64, 64), g = cv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + c + ',1)'); gr.addColorStop(0.4, 'rgba(' + c + ',0.7)'); gr.addColorStop(1, 'rgba(' + c + ',0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); SPR.fire.push(cv);
  }
  const shades = [[34, 30, 40], [78, 72, 88], [138, 132, 148]];
  const blobs = [[0, 0, 22], [-14, 6, 15], [13, -7, 16], [6, 14, 13], [-8, -13, 14], [17, 9, 11], [-18, -3, 10]];
  for (const s of shades) {
    const cv = mk(96, 96), g = cv.getContext('2d');
    for (const b of blobs) {
      const gr = g.createRadialGradient(48 + b[0], 48 + b[1], 0, 48 + b[0], 48 + b[1], b[2] + 8);
      gr.addColorStop(0, 'rgba(' + s + ',0.8)'); gr.addColorStop(0.6, 'rgba(' + s + ',0.42)'); gr.addColorStop(1, 'rgba(' + s + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
    }
    SPR.smoke.push(cv);
  }
  const f = mk(96, 96), g = f.getContext('2d');   // muzzle flash: glow plus a spiky star pointing along +x
  const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(0.35, 'rgba(255,200,90,0.75)'); gr.addColorStop(1, 'rgba(255,140,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 96, 96);
  g.fillStyle = 'rgba(255,245,200,0.95)'; g.beginPath();
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = i % 2 ? 9 : (i === 0 ? 47 : 26); g.lineTo(48 + Math.cos(a) * r, 48 + Math.sin(a) * r); }
  g.closePath(); g.fill(); SPR.flash = f;
})();

/* ---------- small pools ---------- */
const rings = [], glows = [], emit = [], pops = [];
for (let i = 0; i < 28; i++) rings.push({ on: false, x: 0, y: 0, r0: 0, r1: 0, life: 0, max: 1, w: 3, col: '' });
for (let i = 0; i < 16; i++) glows.push({ on: false, x: 0, y: 0, r: 0, life: 0, max: 1 });
for (let i = 0; i < 14; i++) emit.push({ on: false, x: 0, y: 0, life: 0, max: 1, rate: 0, acc: 0, k: 1, kind: 0, spread: 0 });
for (let i = 0; i < 24; i++) pops.push({ on: false, x: 0, y: 0, vy: 0, life: 0, max: 1, text: '', col: '#fff', size: 14 });
let popCur = 0, ringCur = 0, glowCur = 0;

const FX = D.fx = {};
FX.count = () => np;
FX.stats = function () { const o = {}; for (let i = 0; i < np; i++) { const k = PS[i].k; o[k] = (o[k] || 0) + 1; } return o; };   // test/debug helper
FX.reset = function () {
  for (let i = 0; i < np; i++) if (PS[i].k === K.CHUNK) L.freeChunk(PS[i].ref);
  np = 0;
  for (const a of [rings, glows, emit, pops]) for (const o of a) o.on = false;
};
FX.K = K;

/* ---------- spawners ---------- */
// Page pixels flying out with their ORIGINAL colours. Call before carving so the cells are still solid.
FX.debrisBurst = function (x, y, r, n, speed) {
  let made = 0;
  for (let t = 0; t < n * 3 && made < n; t++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
    if (px < 0 || py < 0 || px >= L.W || py >= L.H || !L.solidPx(px, py)) continue;
    const v = L.pix[(py | 0) * L.W + (px | 0)]; if ((v >>> 24) < 60) continue;
    const p = spawn(K.DEB, true); if (!p) return;
    const f = 1 - d / r, sp = speed * (0.35 + 0.9 * f) * (0.6 + Math.random() * 0.7), ux = d > 0.5 ? (px - x) / d : Math.cos(a), uy = d > 0.5 ? (py - y) / d : Math.sin(a);
    p.x = px; p.y = py; p.vx = ux * sp + rand(-30, 30); p.vy = uy * sp - rand(40, 180) * (0.5 + f);
    p.s = 2 + (Math.random() * 3 | 0); p.life = p.max = 1.4 + Math.random() * 1.4;
    p.col = D.rgb(v & 255, (v >> 8) & 255, (v >> 16) & 255); made++;
  }
};
// Slices of the real page (text, product images) that tumble and bounce.
FX.chunks = function (x, y, r, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, d = r * rand(0.15, 0.95), cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d;
    const size = Math.min(L.CHUNK, Math.round(rand(14, 30) * (r > 50 ? 1.25 : 1)));
    if (cx < size || cy < size || cx > L.W - size || cy > L.H - size || !L.solidPx(cx, cy)) continue;
    const idx = L.grabChunk(cx, cy, size, x, y, r); if (idx < 0) return;
    const p = spawn(K.CHUNK); if (!p) { L.freeChunk(idx); return; }
    const sp = speed * rand(0.5, 1) * (1.1 - d / r * 0.5), ux = Math.cos(a), uy = Math.sin(a);
    p.ref = idx; p.s = size; p.x = cx; p.y = cy; p.vx = ux * sp; p.vy = uy * sp - rand(60, 220);
    p.rot = rand(0, TAU); p.vr = rand(-10, 10); p.life = p.max = rand(3, 5.2);
  }
};
// Pixels flying out of a whole rectangle (used when a block shatters or an explosive block goes up).
FX.debrisRect = function (x, y, w, h, n, speed) {
  const cx = x + w / 2, cy = y + h / 2, half = Math.max(w, h) / 2 + 1;
  for (let t = 0, made = 0; t < n * 2 && made < n; t++) {
    const px = x + Math.random() * w, py = y + Math.random() * h;
    if (px < 0 || py < 0 || px >= L.W || py >= L.H) continue;
    const v = L.pix[(py | 0) * L.W + (px | 0)]; if ((v >>> 24) < 60) continue;
    const p = spawn(K.DEB, true); if (!p) return;
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1, sp = speed * (0.4 + 0.8 * (1 - d / half)) * (0.6 + Math.random() * 0.7);
    p.x = px; p.y = py; p.vx = dx / d * sp + rand(-30, 30); p.vy = dy / d * sp - rand(60, 220);
    p.s = 2 + (Math.random() * 3 | 0); p.life = p.max = 1.3 + Math.random() * 1.3; p.col = D.rgb(v & 255, (v >> 8) & 255, (v >> 16) & 255); made++;
  }
};
FX.fireball = function (x, y, r, k, load) {
  let p = spawn(K.FIRE);   // warm light bloom that tints the page around the blast
  if (p) { p.x = x; p.y = y; p.s = r * 2.2; p.z = r * 2.4; p.life = p.max = 0.34; p.b = 2; p.a = 0.5; }
  p = spawn(K.FIRE);       // white-hot core
  if (p) { p.x = x; p.y = y; p.s = r * 0.9; p.z = r * 3.4; p.life = p.max = 0.3; p.b = 0; }
  p = spawn(K.FIRE);       // orange body
  if (p) { p.x = x; p.y = y; p.s = r * 0.8; p.z = r * 3.0; p.life = p.max = 0.55; p.b = 1; }
  const n = ((9 + 15 * k) * load) | 0;
  for (let i = 0; i < n; i++) {   // billowing lobes that fly outward, cool from yellow to red, then dark
    p = spawn(K.FIRE); if (!p) return;
    const a = Math.random() * TAU, sp = rand(0.2, 1) * r * 3.6;
    p.x = x + Math.cos(a) * r * 0.2; p.y = y + Math.sin(a) * r * 0.2; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - r * 0.9;
    p.s = r * rand(0.26, 0.52); p.z = r * 0.5; p.life = p.max = rand(0.5, 1.05); p.drag = 3.0; p.g = -140; p.b = (Math.random() * 2) | 0;
  }
};
FX.smokeColumn = function (x, y, k, dur) {
  for (const e of emit) if (!e.on) { e.on = true; e.x = x; e.y = y; e.life = e.max = dur || (1.1 + 0.5 * k); e.rate = 40 + 20 * k; e.acc = 0; e.k = k; e.kind = 0; return; }
};
FX.flare = function (x, y, dur) {   // red beacon smoke for the airstrike
  for (const e of emit) if (!e.on) { e.on = true; e.x = x; e.y = y; e.life = e.max = dur; e.rate = 30; e.acc = 0; e.k = 0.6; e.kind = 1; return; }
};
FX.sparks = function (x, y, n, speed, ang, spread) {
  for (let i = 0; i < n; i++) {
    const p = spawn(K.SPARK, true); if (!p) return;
    const a = ang === undefined ? Math.random() * TAU : ang + (Math.random() - 0.5) * spread, sp = speed * rand(0.3, 1);
    p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.g = 700; p.drag = 0.9; p.life = p.max = rand(0.3, 0.9); p.s = rand(0.025, 0.045);
  }
};
FX.ember = function (x, y, sc) {
  const p = spawn(K.EMBER, true); if (!p) return;
  p.x = x; p.y = y; p.vx = rand(-140, 140) * sc; p.vy = rand(-260, -60) * sc; p.g = 260; p.drag = 1.1; p.s = rand(1.6, 2.8);
  p.life = p.max = rand(2, 4.5); p.rot = rand(0, 6);
};
FX.embers = function (x, y, n, sc) { for (let i = 0; i < n; i++) FX.ember(x + rand(-6, 6), y + rand(-6, 6), sc); };
FX.flame = function (x, y) {   // small flame from a burning page cell
  const p = spawn(K.FIRE, true); if (!p) return;
  p.x = x; p.y = y; p.vx = rand(-14, 14); p.vy = -rand(30, 90); p.s = rand(4, 8); p.z = -6; p.g = -60; p.drag = 1; p.life = p.max = rand(0.35, 0.65); p.b = 2 + (Math.random() * 2 | 0);
};
FX.streamFlame = function (x, y, vx, vy, big) {   // visible body of the flamethrower jet
  const p = spawn(K.FIRE, true); if (!p) return;
  p.x = x; p.y = y; p.vx = vx * 0.5 + rand(-20, 20); p.vy = vy * 0.5 + rand(-20, 20); p.s = big ? rand(5, 8) : rand(3, 5); p.z = 26; p.g = -90; p.drag = 2.2;
  p.life = p.max = rand(0.28, 0.42); p.b = 0;
};
FX.jet = function (x, y) {   // jetpack exhaust
  const p = spawn(K.FIRE, true); if (!p) return;
  p.x = x; p.y = y; p.vx = rand(-30, 30); p.vy = rand(150, 250); p.s = rand(3, 5.5); p.z = -9; p.drag = 0.5; p.life = p.max = rand(0.16, 0.28); p.b = 1 + (Math.random() * 2 | 0);
};
FX.smokeBit = function (x, y) {
  const p = spawn(K.SMOKE, true); if (!p) return;
  p.x = x; p.y = y; p.vx = rand(-8, 8); p.vy = -rand(20, 50); p.s = rand(5, 9); p.z = 10; p.g = -18; p.drag = 0.8; p.life = p.max = rand(0.9, 1.6); p.a = 0.6;
};
FX.smokePuff = function (x, y, s, vx, vy, life, a, drag, buoy) {
  const p = spawn(K.SMOKE, true); if (!p) return;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.s = s; p.z = s * 1.0; p.g = buoy === undefined ? -10 : buoy; p.drag = drag === undefined ? 1.2 : drag; p.life = p.max = life; p.a = a || 0.8;
};
FX.dust = function (x, y, n, spread) {
  for (let i = 0; i < n; i++) {
    const p = spawn(K.DUST, true); if (!p) return;
    p.x = x + rand(-spread, spread); p.y = y; p.vx = rand(-40, 40); p.vy = -rand(10, 50); p.s = rand(3, 6); p.z = 14; p.g = -4; p.drag = 2; p.life = p.max = rand(0.4, 0.8); p.a = 0.55;
  }
};
FX.muzzle = function (x, y, ang, size, smoke) {
  const p = spawn(K.FLASH); if (p) { p.x = x; p.y = y; p.rot = ang; p.s = size; p.life = p.max = 0.06; }
  FX.sparks(x, y, 2 + (size / 8 | 0), 260 + size * 8, ang, 0.6);
  if (smoke) FX.smokePuff(x, y, 4 + size * 0.15, Math.cos(ang) * 40 + rand(-10, 10), Math.sin(ang) * 40 - 20, 0.6, 0.5);
};
FX.shell = function (x, y, vx, vy) {
  const p = spawn(K.SHELL, true); if (!p) return;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.g = 1300; p.rot = rand(0, TAU); p.vr = rand(-20, 20); p.life = p.max = 1.1; p.s = 3;
};
FX.gibs = function (x, y, n, col, vx, vy, len) {
  for (let i = 0; i < n; i++) {
    const p = spawn(K.GIB); if (!p) return;
    p.x = x + rand(-3, 3); p.y = y + rand(-6, 4); const a = Math.random() * TAU, sp = rand(80, 320);
    p.vx = vx + Math.cos(a) * sp; p.vy = vy + Math.sin(a) * sp - 120; p.rot = rand(0, TAU); p.vr = rand(-14, 14);
    p.s = len * rand(0.5, 1.1); p.col = col; p.life = p.max = rand(1.4, 2.6);
  }
};
FX.blood = function (x, y, n, col, dx, dy, speed) {
  for (let i = 0; i < n; i++) {
    const p = spawn(K.BLOOD, true); if (!p) return;
    const a = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6, sp = speed * rand(0.3, 1);
    p.x = x; p.y = y; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp - 50; p.g = 900; p.col = col; p.s = rand(1.5, 3); p.life = p.max = rand(0.5, 1.1);
  }
};
FX.ring = function (x, y, r1, life, w, col) {
  const o = rings[ringCur = (ringCur + 1) % rings.length];
  o.on = true; o.x = x; o.y = y; o.r1 = r1; o.life = o.max = life; o.w = w; o.col = col;
};
FX.glow = function (x, y, r) {
  const o = glows[glowCur = (glowCur + 1) % glows.length];
  o.on = true; o.x = x; o.y = y; o.r = r; o.life = o.max = 2.6;
};
FX.popup = function (x, y, text, col, size) {
  const o = pops[popCur = (popCur + 1) % pops.length];
  o.on = true; o.x = x; o.y = y; o.vy = -60; o.life = o.max = 0.9; o.text = text; o.col = col; o.size = size || 15;
};

/* ---------- update ---------- */
function pull(p, dt) {   // black hole gravity; returns true if the particle was swallowed
  const hs = D.holes;
  for (let i = 0; i < hs.length; i++) {
    const h = hs[i]; if (!h.on) continue;
    const dx = h.x - p.x, dy = h.y - p.y, d = Math.sqrt(dx * dx + dy * dy) + 0.01, R = h.R * 1.7;
    if (d > R) continue;
    if (d < 12 && h.t > 0.3) return true;
    const f = h.pull * Math.pow(1 - d / R, 1.2) * (h.t < 0.35 ? h.t / 0.35 : 1);
    p.vx += (dx / d * f - dy / d * f * 0.55) * dt; p.vy += (dy / d * f + dx / d * f * 0.55) * dt;
    p.vx *= 1 - 0.6 * dt; p.vy *= 1 - 0.6 * dt;
  }
  return false;
}
FX.update = function (dt) {
  stainBudget = 5;
  const hs = D.holes; let anyHole = false; for (let i = 0; i < hs.length; i++) if (hs[i].on) anyHole = true;
  for (let i = np - 1; i >= 0; i--) {
    const p = PS[i]; p.life -= dt;
    if (p.life <= 0) { if (p.k === K.CHUNK) L.freeChunk(p.ref); kill(i); continue; }
    if (anyHole && p.k !== K.FLASH && pull(p, dt)) { if (p.k === K.CHUNK) L.freeChunk(p.ref); kill(i); continue; }
    switch (p.k) {
      case K.DEB: {
        p.vy += 1100 * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (L.solidPx(nx, p.y)) p.vx *= -0.3; else p.x = nx;
        if (L.solidPx(p.x, ny)) { if (Math.abs(p.vy) < 45) { p.vy = 0; p.vx *= 0.6; if (p.life > 1.1) p.life = 1.1; } else { p.vy *= -0.28; p.vx *= 0.7; } } else p.y = ny;
        break;
      }
      case K.CHUNK: {
        p.vy += 1000 * dt; p.rot += p.vr * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, h = p.s * 0.4;
        if (L.solidPx(nx + (p.vx > 0 ? h : -h), p.y)) { p.vx *= -0.4; p.vr *= 0.7; } else p.x = nx;
        if (L.solidPx(p.x, ny + h)) {
          if (Math.abs(p.vy) > 220 && Math.random() < 0.5) FX.dust(p.x, p.y + h, 2, 6);
          if (Math.abs(p.vy) < 60) { p.vy = 0; p.vx *= 0.85; p.vr *= 0.8; if (p.life > 1.2) p.life = 1.2; } else { p.vy *= -0.36; p.vx *= 0.75; p.vr *= 0.6; }
        } else p.y = ny;
        break;
      }
      case K.GIB: {
        p.vy += 1000 * dt; p.rot += p.vr * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (L.solidPx(nx, p.y)) p.vx *= -0.4; else p.x = nx;
        if (L.solidPx(p.x, ny)) { p.vy *= -0.3; p.vx *= 0.7; p.vr *= 0.6; if (Math.abs(p.vy) < 40) p.vy = 0; } else p.y = ny;
        break;
      }
      case K.SHELL: {
        p.vy += p.g * dt; p.rot += p.vr * dt;
        const ny = p.y + p.vy * dt;
        if (L.solidPx(p.x, ny)) { p.vy *= -0.4; p.vx *= 0.6; p.vr *= 0.5; } else p.y = ny;
        p.x += p.vx * dt; break;
      }
      case K.BLOOD: {
        p.vy += p.g * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (L.solidPx(nx, ny)) {
          if (stainBudget > 0 && Math.random() < 0.5) { stainBudget--; L.stain(p.x, p.y, p.s * 1.1, p.col, 0.55); }
          p.life = 0;
        } else { p.x = nx; p.y = ny; }
        break;
      }
      case K.SMOKE: case K.DUST: {
        const dr = 1 - p.drag * dt;
        p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += p.z * dt; break;
      }
      case K.FIRE: {
        const dr = 1 - p.drag * dt;
        p.vx *= dr; p.vy = p.vy * dr + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.s += p.z * dt; if (p.s < 0.5) p.life = 0;
        break;
      }
      case K.SPARK: {
        p.vy += p.g * dt; p.vx *= 1 - p.drag * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (L.solidPx(nx, ny)) { if (p.b++ > 1) p.life = 0; else { p.vy *= -0.45; p.vx *= 0.6; } } else { p.x = nx; p.y = ny; }
        break;
      }
      case K.EMBER: {
        if (p.b === 1) {   // landed: glows in place and may start a fire
          if (Math.random() < dt * 1.3 && D.fire.igniteAt(p.x, p.y - 1, 1)) p.life = 0;
          break;
        }
        p.vy += p.g * dt; p.vx *= 1 - p.drag * dt; p.vx += Math.sin(p.life * 9 + p.rot) * 30 * dt;
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        if (L.solidPx(nx, ny)) { p.vx = p.vy = 0; p.b = 1; if (D.fire.igniteAt(nx, ny, 0.5)) p.life = 0; } else { p.x = nx; p.y = ny; }
        break;
      }
      default: break;   // FLASH just times out
    }
  }
  for (const r of rings) if (r.on && (r.life -= dt) <= 0) r.on = false;
  for (const g of glows) if (g.on && (g.life -= dt) <= 0) g.on = false;
  for (const o of pops) if (o.on) { o.life -= dt; o.y += o.vy * dt; o.vy *= 1 - 3 * dt; if (o.life <= 0) o.on = false; }
  for (const e of emit) {
    if (!e.on) continue;
    e.life -= dt; if (e.life <= 0) { e.on = false; continue; }
    e.acc += e.rate * dt;
    const prog = 1 - e.life / e.max;
    while (e.acc >= 1) {
      e.acc -= 1;
      if (e.kind === 0) {   // rising column that broadens with height
        FX.smokePuff(e.x + rand(-8, 8) * e.k, e.y + rand(-4, 4), rand(12, 22) * e.k, rand(-1, 1) * (16 + 46 * prog) * e.k, -rand(90, 210) * (0.7 + e.k * 0.4), rand(2.2, 3.8), 0.9, 0.5, -38);
      } else {
        FX.smokePuff(e.x + rand(-3, 3), e.y, rand(4, 8), rand(-10, 10), -rand(60, 130), rand(1.2, 2), 0.75);
        const p = spawn(K.FIRE, true); if (p) { p.x = e.x; p.y = e.y; p.vx = rand(-6, 6); p.vy = -rand(80, 160); p.s = 4; p.z = -2; p.g = -20; p.drag = 0.5; p.life = p.max = 0.5; p.b = 3; }
      }
    }
  }
};

/* ---------- draw ---------- */
// Visible world rectangle (with margin); particles outside it are skipped to save fill rate.
let vx0 = 0, vy0 = 0, vx1 = 0, vy1 = 0;
FX.setView = function (x0, y0, x1, y1) { vx0 = x0 - 80; vy0 = y0 - 80; vx1 = x1 + 80; vy1 = y1 + 80; };
const off = p => p.x < vx0 || p.x > vx1 || p.y < vy0 || p.y > vy1;
// Pass 1: solid things (behind characters).
FX.drawSolid = function (g) {
  let curA = 1;
  for (let i = 0; i < np; i++) {
    const p = PS[i]; if (off(p)) continue;
    switch (p.k) {
      case K.DEB: {
        const a = p.life < 0.35 ? p.life / 0.35 : 1; if (a !== curA) { g.globalAlpha = a; curA = a; }
        g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, p.s, p.s); break;
      }
      case K.CHUNK: {
        const a = p.life < 0.5 ? p.life / 0.5 : 1; if (a !== curA) { g.globalAlpha = a; curA = a; }
        const c = L.chunkPool[p.ref].c, s = p.s;
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(c, 0, 0, s, s, -s / 2, -s / 2, s, s); g.restore(); break;
      }
      case K.GIB: {
        if (curA !== 1) { g.globalAlpha = 1; curA = 1; }
        g.strokeStyle = p.col; g.lineWidth = 2.4; g.beginPath();
        g.moveTo(p.x - Math.cos(p.rot) * p.s * 0.5, p.y - Math.sin(p.rot) * p.s * 0.5); g.lineTo(p.x + Math.cos(p.rot) * p.s * 0.5, p.y + Math.sin(p.rot) * p.s * 0.5); g.stroke(); break;
      }
      case K.SHELL: {
        if (curA !== 1) { g.globalAlpha = 1; curA = 1; }
        g.fillStyle = '#D9A441'; g.fillRect(p.x | 0, p.y | 0, 3, 2); break;
      }
      case K.BLOOD: {
        const a = p.life < 0.2 ? p.life / 0.2 : 1; if (a !== curA) { g.globalAlpha = a; curA = a; }
        g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, p.s, p.s); break;
      }
      default: break;
    }
  }
  g.globalAlpha = 1;
};
// Pass 2: smoke.
FX.drawSmoke = function (g) {
  for (let i = 0; i < np; i++) {
    const p = PS[i]; if ((p.k !== K.SMOKE && p.k !== K.DUST) || off(p)) continue;
    const age = 1 - p.life / p.max, sh = p.k === K.DUST ? 2 : age < 0.25 ? 0 : age < 0.6 ? 1 : 2;
    const a = p.a * Math.pow(1 - age, 1.1) * (age < 0.08 ? age / 0.08 : 1);
    if (a < 0.02) continue;
    g.globalAlpha = a; g.drawImage(SPR.smoke[sh], p.x - p.s, p.y - p.s, p.s * 2, p.s * 2);
  }
  g.globalAlpha = 1;
};
// Pass 3: fire in normal compositing, so flames stay saturated on a white page (additive light would vanish there).
FX.drawFire = function (g) {
  for (const o of glows) {
    if (!o.on) continue;
    const t = o.life / o.max, a = t * t * (0.75 + Math.random() * 0.25);
    g.strokeStyle = 'rgba(230,70,20,' + (a * 0.5).toFixed(3) + ')'; g.lineWidth = 7; g.beginPath(); g.arc(o.x, o.y, o.r, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,190,80,' + (a * 0.95).toFixed(3) + ')'; g.lineWidth = 2.4; g.beginPath(); g.arc(o.x, o.y, o.r, 0, TAU); g.stroke();
  }
  for (const r of rings) {   // dark pressure ring, readable on paper
    if (!r.on) continue;
    const t = 1 - r.life / r.max, e = 1 - Math.pow(1 - t, 3);
    g.globalAlpha = 0.35 * Math.pow(1 - t, 1.5); g.strokeStyle = '#2a1e22'; g.lineWidth = Math.max(1, r.w * (1 - t) * 0.8);
    g.beginPath(); g.arc(r.x, r.y, r.r1 * e + 3, 0, TAU); g.stroke();
  }
  for (let i = 0; i < np; i++) {
    const p = PS[i]; if (off(p)) continue;
    switch (p.k) {
      case K.FIRE: {
        const age = 1 - p.life / p.max, b = p.b, stage = Math.min(7, (b + age * (8 - b)) | 0);
        g.globalAlpha = (p.life < 0.15 ? p.life / 0.15 : 1) * p.a * (stage < 2 ? 0.85 : 1);
        g.drawImage(SPR.fire[stage < 2 ? 2 : stage], p.x - p.s, p.y - p.s, p.s * 2, p.s * 2); break;
      }
      case K.SPARK: {
        const age = 1 - p.life / p.max; g.globalAlpha = Math.min(1, 1.6 - age * 1.4);
        g.strokeStyle = age < 0.5 ? '#FF9A1F' : '#E0451A'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * p.s, p.y - p.vy * p.s); g.stroke(); break;
      }
      case K.EMBER: {
        const fl = 0.6 + 0.4 * Math.sin(p.life * 22 + p.rot), fade = p.life < 0.6 ? p.life / 0.6 : 1;
        g.globalAlpha = fl * fade; g.drawImage(SPR.fire[4], p.x - p.s * 2.4, p.y - p.s * 2.4, p.s * 4.8, p.s * 4.8);
        g.globalAlpha = fade; g.fillStyle = '#FFD27A'; g.fillRect(p.x - 1, p.y - 1, 2.4, 2.4); break;
      }
      case K.FLASH: {
        g.globalAlpha = Math.min(1, p.life / p.max * 1.6);
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(SPR.flash, -p.s * 0.3, -p.s * 0.5, p.s * 1.6, p.s); g.restore(); break;
      }
      default: break;
    }
  }
  g.globalAlpha = 1;
};
// Pass 4: additive light on top: white-hot fire cores, spark cores and bright shock rings.
FX.drawAdd = function (g) {
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < np; i++) {
    const p = PS[i]; if (off(p)) continue;
    if (p.k === K.FIRE) {
      const age = 1 - p.life / p.max, b = p.b, stage = Math.min(7, (b + age * (8 - b)) | 0);
      if (stage >= 3) continue;
      g.globalAlpha = (p.life < 0.15 ? p.life / 0.15 : 1) * p.a * 0.8;
      g.drawImage(SPR.fire[stage], p.x - p.s * 0.7, p.y - p.s * 0.7, p.s * 1.4, p.s * 1.4);
    } else if (p.k === K.SPARK) {
      const age = 1 - p.life / p.max; g.globalAlpha = 1 - age * age; g.strokeStyle = '#FFF6D0'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * p.s * 0.6, p.y - p.vy * p.s * 0.6); g.stroke();
    }
  }
  for (const r of rings) {
    if (!r.on) continue;
    const t = 1 - r.life / r.max, e = 1 - Math.pow(1 - t, 3);
    g.globalAlpha = Math.pow(1 - t, 1.4); g.strokeStyle = r.col; g.lineWidth = Math.max(1, r.w * (1 - t));
    g.beginPath(); g.arc(r.x, r.y, r.r1 * e + 2, 0, TAU); g.stroke();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
};
FX.drawText = function (g) {
  g.textAlign = 'center'; g.lineJoin = 'round';
  for (const o of pops) {
    if (!o.on) continue;
    g.globalAlpha = Math.min(1, o.life / 0.3); g.font = o.size + 'px ' + D.F_HEAD;
    g.lineWidth = 4; g.strokeStyle = D.C.ink; g.strokeText(o.text, o.x, o.y); g.fillStyle = o.col; g.fillText(o.text, o.x, o.y);
  }
  g.globalAlpha = 1; g.textAlign = 'left';
};
FX.sprites = SPR;
})(window.DD);
