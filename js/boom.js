/* boom.js: explosions, small impacts, explosive barrels and screen effects.
 * D.boom() is the big one: it layers debris, a fireball, a smoke column, shockwave rings, sparks,
 * embers, a glowing crater edge and permanent scorch, then shakes the screen, freezes a few frames,
 * punches the zoom, splits the colour channels, and shoves everything nearby. */
(function (D) {
'use strict';
const S = D.S, L = D.L, P = D.P, fx = D.fx, rand = D.rand, TAU = D.TAU, clamp = D.clamp;
let boomLoad = 0;   // recent blast count; used to thin out effects during chain reactions
const queue = [];
for (let i = 0; i < 48; i++) queue.push({ on: false, t: 0, x: 0, y: 0, r: 0, o: null });

// How close a world point is to the middle of the screen, as 0.12..1 (used to scale shake and sound).
function attenuation(x, y) {
  const cx = S.camX - S.offX + S.VW / 2, cy = S.camY + S.VH / 2, d = Math.hypot(x - cx, y - cy);
  return clamp(1 - (d - S.VH * 0.35) / (S.VH * 0.9), 0.12, 1);
}
D.attenuation = attenuation;

D.queueBoom = function (x, y, r, o, delay) {
  for (const q of queue) if (!q.on) { q.on = true; q.t = delay; q.x = x; q.y = y; q.r = r; q.o = o; return; }
  D.boom(x, y, r, o);
};
D.boomUpdate = function (dt) {
  boomLoad = Math.max(0, boomLoad - dt * 7);
  for (const q of queue) if (q.on && (q.t -= dt) <= 0) { q.on = false; D.boom(q.x, q.y, q.r, q.o); }
};
D.boomReset = function () { for (const q of queue) q.on = false; boomLoad = 0; };

D.damageBarrel = function (i, dmg, delay) {
  const b = L.barrels[i]; if (!b || !b.alive) return;
  b.hp -= dmg;
  if (b.hp <= 0) {
    b.alive = false;
    D.queueBoom(b.cx, b.cy, b.r || 72, { dmg: 120, selfDmg: 34, ignite: 1, barrel: true, rect: b.rect ? b : null }, delay === undefined ? 0.06 + Math.random() * 0.08 : delay);
  }
};
// Damage every drum whose rectangle is within reach of a circle.
function hitBarrels(x, y, reach, dmg, baseDelay) {
  for (let i = 0; i < L.barrels.length; i++) {
    const b = L.barrels[i]; if (!b.alive) continue;
    const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h), d = Math.hypot(nx - x, ny - y);
    if (d <= reach) D.damageBarrel(i, dmg, baseDelay + d / 1100);
  }
}

// Small impact: bullet holes, pellet chips, acid bites.
D.pop = function (x, y, r, o) {
  o = o || {};
  fx.debrisBurst(x, y, r * 1.15, 5 + (r * 1.3 | 0), 150 + r * 9);
  const n = L.carve(x, y, r);
  if (n && r >= 5 && Math.random() < 0.6) L.scorch(x, y, r, 0.3);
  fx.sparks(x, y, 3, 260);
  if (Math.random() < 0.35) fx.dust(x, y, 1, 3);
  hitBarrels(x, y, r, o.barrelDmg || r * 3.4, 0);
  if (o.ignite) D.fire.igniteArea(x, y, r + 2, o.ignite);
  D.sfx('pop', attenuation(x, y) * 0.9);
  return n;
};

D.boom = function (x, y, r, o) {
  o = o || {};
  const k = Math.min(2.4, r / 62), load = Math.max(0.3, 1 - boomLoad * 0.15) * D.quality, rm = D.reduceMotion, att = attenuation(x, y);
  boomLoad += 1;

  // 1. Page pieces first, while the cells are still solid.
  if (o.rect) {   // an explosive block (ad, button, banner) goes up as a whole rectangle
    const b = o.rect, area = b.w * b.h;
    fx.debrisRect(b.x, b.y, b.w, b.h, (Math.min(400, (area / 90) | 0) * load) | 0, 380);
    for (let i = 0; i < Math.min(6, 2 + area / 8000); i++) fx.chunks(b.x + Math.random() * b.w, b.y + Math.random() * b.h, Math.min(24, Math.min(b.w, b.h) / 2), 1, 360);
    L.carveRect(b.x, b.y, b.w, b.h);
  }
  fx.debrisBurst(x, y, r, ((70 + 200 * k) * load) | 0, 320 + 120 * k);
  fx.chunks(x, y, r, ((5 + 8 * k) * load) | 0, 380 + 90 * k);

  // 2. Carve the crater, with a few bites out of the rim so it isn't a perfect circle.
  L.carve(x, y, r);
  for (let i = 0; i < 6; i++) { const a = Math.random() * TAU; L.carve(x + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, r * rand(0.18, 0.34)); }
  L.scorch(x, y, r, 0.8 + 0.2 * k);

  // 3. Visual layers.
  fx.fireball(x, y, r, k, load);
  fx.smokeColumn(x, y - r * 0.25, k);
  fx.sparks(x, y, ((18 + 34 * k) * load) | 0, 380 + 140 * k);
  fx.embers(x, y, ((4 + 8 * k) * load) | 0, 1 + 0.3 * k);
  fx.ring(x, y, r * 3.8, 0.36, 5, 'rgb(255,255,255)');
  fx.ring(x, y, r * 2.8, 0.6, 14 * k + 6, 'rgb(255,226,170)');
  fx.ring(x, y, r * 1.7, 1.0, 20, 'rgb(255,120,40)');
  fx.glow(x, y, r * 1.02);
  fx.dust(x, y + r * 0.6, 5, r * 0.6);
  if (o.barrel) fx.embers(x, y, 14, 1.9);   // drums throw extra burning embers that start new fires

  // 4. Screen: flash frame, shake, hit-stop, zoom punch, chromatic split. Toned down for reduced motion.
  S.trauma = Math.min(1, S.trauma + (rm ? 0.05 : 0.2 + 0.34 * k) * att);
  S.flash = Math.max(S.flash, (rm ? 0.16 : Math.min(0.92, 0.3 + 0.42 * k)) * att); S.flashCol = '#ffffff';
  if (!rm) S.dim = Math.max(S.dim, Math.min(0.32, 0.1 + 0.12 * k) * att);
  // Hit-stop and the chromatic split have cooldowns so a chain of blasts doesn't freeze or smear the whole screen.
  if (!rm && att > 0.45 && S.hitCd <= 0) { const f = k > 1.35 ? 4 : k > 0.95 ? 3 : k > 0.6 ? 2 : 0; if (f) { S.hitstop = Math.max(S.hitstop, f / 60); S.hitCd = 0.28; } }
  if (!rm) {
    S.zoom = Math.max(S.zoom, Math.min(0.05, 0.022 * k) * att);
    if (k > 0.9 && S.chromaCd <= 0 && D.quality > 0.6) { S.chroma = Math.max(S.chroma, Math.min(1, 0.45 + 0.3 * k) * att); S.chromaCd = 0.6; }
  }

  // 5. Shockwave shoves and damages zombies and the player.
  const dmg = o.dmg === undefined ? r * 1.6 : o.dmg, self = o.selfDmg === undefined ? dmg * 0.3 : o.selfDmg;
  if (dmg > 0) {
    const R = r * 1.9;
    for (const z of D.zombies) {
      if (!z.alive) continue;
      const dx = z.x - x, dy = z.y - z.h / 2 - y, d = Math.hypot(dx, dy);
      if (d < R) {
        const f = 1 - d / R, ux = dx / (d || 1), uy = dy / (d || 1);
        D.hurtZombie(z, dmg * Math.pow(f, 0.6), ux * f * 1500, uy * f * 1500 - 380 * f, 'blast');
      }
    }
    if (!P.dead) {
      const dx = P.x - x, dy = P.y - P.h / 2 - y, d = Math.hypot(dx, dy), R2 = r * 1.7;
      if (d < R2) {
        const f = 1 - d / R2;
        P.vx += dx / (d || 1) * f * 820; P.vy += dy / (d || 1) * f * 820 - 120; P.onGround = false;
        if (self > 0) D.hurtPlayer(self * f, 0, 0, true);
      }
    }
  }

  // 6. Chain reactions: fire on the crater rim and neighbouring drums.
  const ig = o.ignite === undefined ? 0.5 : o.ignite;
  if (ig > 0) {
    const nIg = (12 + 20 * k) | 0;
    for (let i = 0; i < nIg; i++) { const a = Math.random() * TAU, d = r * rand(0.85, 1.5); D.fire.igniteAt(x + Math.cos(a) * d, y + Math.sin(a) * d, ig); }
    D.fire.igniteArea(x, y, r * 1.25, ig * 0.35);
  }
  hitBarrels(x, y, r * 1.35, 100, 0.05);

  D.sfx('boom', 0.15 + 0.85 * att, k);
};

/* ---------- screen effect decay (real time, not affected by hit-stop) ---------- */
D.screenUpdate = function (dt) {
  S.trauma = Math.max(0, S.trauma - dt * 1.6);
  S.flash = Math.max(0, S.flash - dt * 6.5);
  S.dim = Math.max(0, S.dim - dt * 0.9);
  S.zoom *= Math.exp(-dt * 9);
  S.chromaCd -= dt; S.hitCd -= dt;
  S.chroma = Math.max(0, S.chroma - dt * 4.2);
};

/* ---------- high-HP blocks ---------- */
D.onBlockHit = function (b, x, y) {
  fx.sparks(x, y, 4, 280); if (Math.random() < 0.4) fx.dust(x, y, 1, 3);
  S.trauma = Math.min(1, S.trauma + 0.02);
  const q = Math.floor((1 - b.hp / b.max) * 4);
  if (q > b.q) { b.q = q; L.crack(b, x, y); D.sfx('smash', 0.7 * attenuation(x, y)); fx.ring(x, y, 40, 0.3, 4, 'rgb(255,255,255)'); }
};
D.onBlockBreak = function (b) {
  const area = b.w * b.h, cx = b.x + b.w / 2, cy = b.y + b.h / 2, att = attenuation(cx, cy), load = D.quality;
  fx.debrisRect(b.x, b.y, b.w, b.h, Math.min(380, (area / 100) | 0) * load | 0, 380);
  for (let i = 0; i < Math.min(10, 3 + area / 5000); i++) fx.chunks(b.x + Math.random() * b.w, b.y + Math.random() * b.h, Math.min(26, Math.min(b.w, b.h) / 2), 1, 380);
  fx.dust(cx, b.y + b.h, 8, Math.min(60, b.w / 3)); fx.sparks(cx, cy, 20 * load | 0, 420);
  fx.ring(cx, cy, Math.min(220, Math.max(b.w, b.h) * 0.8), 0.5, 10, 'rgb(255,226,170)');
  fx.smokePuff(cx, cy, Math.min(40, b.w / 4), 0, -60, 1.6, 0.8, 0.8, -20);
  S.trauma = Math.min(1, S.trauma + 0.25 * att); if (!D.reduceMotion && att > 0.45 && S.hitCd <= 0) { S.hitstop = Math.max(S.hitstop, 2 / 60); S.hitCd = 0.28; }
  D.sfx('boom', 0.5 + 0.4 * att, 0.7); fx.popup(cx, b.y - 8, 'Smashed', D.C.yellow, 16);
};
})(window.DD);
