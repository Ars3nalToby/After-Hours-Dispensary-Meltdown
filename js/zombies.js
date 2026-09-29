/* zombies.js: zombie types, AI, waves, medkits and kill scoring.
 * Zombies use the same pixel-grid collision as the player (L.moveX / L.moveY). */
(function (D) {
'use strict';
const S = D.S, L = D.L, P = D.P, fx = D.fx, rand = D.rand, clamp = D.clamp;
const Z = D.zombies, MAXZ = 48;
const WALKER = 1, RUNNER = 2, BRUTE = 3, SPITTER = 4;
const ZT = [null,
  { name: 'Walker', hp: 42, spd: 54, w: 9, h: 30, dmg: 9, atk: 0.9, pts: 100, mass: 1, skin: '#8FBF6A', shirt: '#6B7A99' },
  { name: 'Runner', hp: 22, spd: 138, w: 8, h: 28, dmg: 6, atk: 0.55, pts: 130, mass: 0.8, skin: '#B7D96B', shirt: '#C2554D' },
  { name: 'Brute', hp: 300, spd: 38, w: 20, h: 44, dmg: 24, atk: 1.15, pts: 500, mass: 4, skin: '#6E9C5A', shirt: '#4A3F5C' },
  { name: 'Spitter', hp: 36, spd: 46, w: 9, h: 30, dmg: 6, atk: 1.2, pts: 220, mass: 1, skin: '#A6D64F', shirt: '#3F7F5F' },
];
D.ZT = ZT; D.ZK = { WALKER, RUNNER, BRUTE, SPITTER };
for (let i = 0; i < MAXZ; i++) Z.push({ alive: false, type: 1, x: 0, y: 0, vx: 0, vy: 0, w: 9, h: 30, onGround: false, stepH: 6, face: 1, walkT: 0, hp: 1, maxHp: 1, speed: 1, atkT: 0, flash: 0, burn: 0, burnDot: 0, stun: 0, jumpT: 0, spitT: 0, smashT: 0, stuck: 0, emerge: 0, groanT: 0, seed: 0, hpShow: 0 });

const BLOOD = '#7FE04B', BLOOD2 = '#4CA02C';

D.aliveCount = function () { let n = 0; for (let i = 0; i < MAXZ; i++) if (Z[i].alive) n++; return n; };

D.spawnZombie = function (type, x, y, hpMul, spdMul) {
  let z = null; for (let i = 0; i < MAXZ; i++) if (!Z[i].alive) { z = Z[i]; break; }
  if (!z) return null;
  const T = ZT[type];
  z.alive = true; z.type = type; z.x = x; z.y = y; z.vx = 0; z.vy = 0; z.w = T.w; z.h = T.h; z.onGround = false; z.stepH = type === BRUTE ? 9 : 6;
  z.hp = z.maxHp = T.hp * (hpMul || 1); z.speed = T.spd * (spdMul || 1); z.atkT = 0.6; z.flash = 0; z.burn = 0; z.burnDot = 0; z.stun = 0; z.jumpT = 0;
  z.spitT = rand(1, 2.2); z.smashT = 0; z.stuck = 0; z.emerge = 0.5; z.groanT = rand(1, 4); z.seed = Math.random() * 6; z.face = P.x > x ? 1 : -1; z.hpShow = 0;
  fx.dust(x, y, 4, 6);
  return z;
};

/* ---------- damage ---------- */
D.hurtZombie = function (z, dmg, kx, ky, cause, hx, hy) {
  if (!z.alive) return;
  const T = ZT[z.type];
  z.hp -= dmg; z.flash = 0.09; z.hpShow = 2.5;
  if (kx || ky) {
    z.vx += kx / T.mass; z.vy += ky / T.mass;
    if (ky / T.mass < -120) z.onGround = false;
    z.stun = Math.max(z.stun, Math.min(0.55, (Math.abs(kx) + Math.abs(ky)) / T.mass / 2600));
  }
  if (cause !== 'fire') {
    fx.blood(hx === undefined ? z.x : hx, hy === undefined ? z.y - z.h * 0.6 : hy, 2 + (dmg / 14 | 0), Math.random() < 0.5 ? BLOOD : BLOOD2, kx || (Math.random() - 0.5), ky ? ky * 0.3 : -20, 200);
    D.sfx('zhit', 0.7);
  }
  if (z.hp <= 0) D.killZombie(z, cause, kx, ky);
};

D.killZombie = function (z, cause, kx, ky) {
  if (!z.alive) return;
  z.alive = false;
  const T = ZT[z.type], cx = z.x, cy = z.y - z.h * 0.5, big = z.type === BRUTE;
  kx = (kx || 0) * 0.25; ky = (ky || 0) * 0.25;
  fx.gibs(cx, cy, big ? 10 : 5, T.skin, kx, ky, big ? 14 : 8);
  fx.gibs(cx, cy, big ? 5 : 3, D.C.ink, kx, ky, big ? 12 : 7);
  fx.blood(cx, cy, big ? 26 : 14, BLOOD, kx || rand(-1, 1), ky - 40, 320);
  L.stain(cx, cy, big ? 9 : 5, BLOOD2, 0.5);
  D.sfx('zdie', 0.9);
  if (big) { S.trauma = Math.min(1, S.trauma + 0.25); fx.dust(z.x, z.y, 8, 12); }
  if (!D.reduceMotion) S.hitstop = Math.max(S.hitstop, (big ? 3 : cause === 'blast' ? 1 : 0) / 60);
  if (P.dead) return;
  S.kills++; S.combo++; S.comboT = 2.8;
  const prevMult = S.mult; S.mult = Math.min(9, 1 + Math.floor(S.combo / 3));
  const pts = Math.round(T.pts * S.mult); S.score += pts;
  fx.popup(cx, z.y - z.h - 8, '+' + pts, S.mult > 1 ? D.C.yellow : '#fff', 14 + Math.min(8, S.mult));
  if (S.mult > prevMult) { D.sfx('combo', 0.8, S.mult); D.hud.comboBump(); }
  if (Math.random() < (P.hp < 40 ? 0.26 : 0.1)) D.dropMedkit(cx, z.y - z.h);
  D.hud.dirty();
};

/* ---------- acid spit ---------- */
function spit(z) {
  const sx = z.x + z.face * 6, sy = z.y - z.h + 6, tx = P.x + rand(-16, 16), ty = P.y - 16;
  const d = Math.hypot(tx - sx, ty - sy), t = clamp(d / 520, 0.3, 1.4);
  D.spawnAcid(sx, sy, (tx - sx) / t, (ty - sy) / t - 0.5 * 900 * t);
  D.sfx('spit', 0.6);
}

/* ---------- update ---------- */
function updateZ(z, dt) {
  const T = ZT[z.type];
  z.atkT -= dt; z.flash -= dt; z.stun -= dt; z.jumpT -= dt; z.smashT -= dt; z.hpShow -= dt; z.emerge -= dt; z.groanT -= dt;
  if (z.groanT <= 0) { z.groanT = rand(3, 7); if (Math.abs(z.x - P.x) < 700) D.sfx('groan', 0.5 * D.attenuation(z.x, z.y), z.type); }

  // Fire: standing in flames sets a zombie alight, and a burning zombie spreads fire to whatever it runs across.
  if (D.fire.burningAt(z.x, z.y - 6)) z.burn = Math.max(z.burn, 2.4);
  if (z.burn > 0) {
    z.burn -= dt; z.burnDot -= dt;
    if (Math.random() < dt * 22) fx.flame(z.x + rand(-4, 4), z.y - rand(4, z.h));
    if (Math.random() < dt * 2.5) D.fire.igniteAt(z.x, z.y - 2, 0.8);
    if (z.burnDot <= 0) { z.burnDot = 0.25; D.hurtZombie(z, 3.2 * (z.type === BRUTE ? 0.6 : 1), 0, 0, 'fire'); if (!z.alive) return; }
  }

  const dx = P.x - z.x;
  let want = 0;
  if (!P.dead && z.stun <= 0 && z.emerge <= 0) {
    if (z.type === SPITTER) {
      const ax = Math.abs(dx);
      want = ax < 230 ? -Math.sign(dx) : ax > 340 ? Math.sign(dx) : 0;
      z.spitT -= dt; if (z.spitT <= 0 && ax < 560 && ax > 90) { z.spitT = rand(1.8, 2.9); spit(z); }
    } else want = Math.abs(dx) < 4 ? 0 : Math.sign(dx);
  }
  const tvx = want * z.speed * (z.burn > 0 ? 1.25 : 1);
  z.vx += (tvx - z.vx) * Math.min(1, dt * (z.onGround ? 9 : 1.3));
  z.vy = Math.min(900, z.vy + 1500 * dt);
  z.face = want ? (want > 0 ? 1 : -1) : (dx >= 0 ? 1 : -1);

  // Wall ahead? Brutes smash it, others jump. Also jump toward a player standing above.
  if (want && z.onGround && z.stun <= 0) {
    const x0 = want > 0 ? z.x + z.w / 2 : z.x - z.w / 2 - 4;
    const wall = L.hitsRect(x0, z.y - z.h * 0.7, x0 + 4, z.y - z.stepH - 2);
    if (z.type === BRUTE) {
      if (wall && z.smashT <= 0) {
        z.smashT = 0.85;
        D.smashWall(z.x + want * 24, z.y - 20, 26);
        if (Math.abs(P.x - z.x) < 60 && Math.abs(P.y - z.y) < 40) D.hurtPlayer(T.dmg * 0.6, want * 320, -220);
      }
      if (P.y < z.y - 90 && Math.abs(dx) < 60 && z.jumpT <= 0) { z.vy = -560; z.jumpT = 2; z.onGround = false; }
    } else if (z.jumpT <= 0 && (wall || (P.y < z.y - 50 && Math.abs(dx) < 110) || z.stuck > 1.5)) {
      z.vy = -(z.type === RUNNER ? 520 : 430); z.jumpT = 0.8; z.onGround = false;
    }
  }

  const px = z.x;
  const blocked = L.moveX(z, z.vx * dt);
  const landV = L.moveY(z, z.vy * dt);
  if (landV > 700) { z.hp -= 0; fx.dust(z.x, z.y, 3, 6); }   // hard landings kick up dust only
  if (z.onGround && Math.abs(z.vx) > 15) z.walkT += dt * Math.abs(z.vx) * 0.075;

  // Stuck handling: jump harder, then give up and reappear at a fresh spawn point.
  if (want && Math.abs(z.x - px) < 0.2 * dt * 60 && z.stun <= 0) z.stuck += dt; else z.stuck = Math.max(0, z.stuck - dt * 2);
  if (z.stuck > 5 || z.y > P.y + 1400) { const sp = D.spawnPoint(); z.x = sp.x; z.y = sp.y; z.vx = z.vy = 0; z.stuck = 0; fx.dust(z.x, z.y, 4, 6); }
  if (z.y > L.H + 120) { z.alive = false; return; }

  // Melee touch.
  if (!P.dead && z.atkT <= 0 && z.emerge <= 0 && z.stun <= 0 && Math.abs(P.x - z.x) < (z.w + P.w) / 2 + 3 && P.y > z.y - z.h && P.y - P.h < z.y) {
    z.atkT = T.atk; D.hurtPlayer(T.dmg, Math.sign(dx || 1) * 300, -180);
  }
}
D.updateZombies = function (dt) {
  for (let i = 0; i < MAXZ; i++) if (Z[i].alive) updateZ(Z[i], dt);
  // Soft separation so a crowd spreads out instead of stacking on one pixel column.
  for (let i = 0; i < MAXZ; i++) {
    const a = Z[i]; if (!a.alive) continue;
    for (let j = i + 1; j < MAXZ; j++) {
      const b = Z[j]; if (!b.alive) continue;
      const dx = b.x - a.x, m = (a.w + b.w) * 0.5;
      if (Math.abs(dx) < m && Math.abs(b.y - a.y) < 18) { const s = (dx >= 0 ? 1 : -1) * 55 * dt; a.vx -= s; b.vx += s; }
    }
  }
};

// First zombie hit by a segment (slab test against padded boxes). Result point is stored in D.zhit.
D.zhit = { x: 0, y: 0 };
D.segZombie = function (x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1; let best = 2, bz = null;
  for (let i = 0; i < MAXZ; i++) {
    const z = Z[i]; if (!z.alive) continue;
    const l = z.x - z.w / 2 - 2, r = z.x + z.w / 2 + 2, t = z.y - z.h - 2, b = z.y;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-6) { if (x1 < l || x1 > r) continue; }
    else { let a = (l - x1) / dx, c = (r - x1) / dx; if (a > c) { const s = a; a = c; c = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
    if (Math.abs(dy) < 1e-6) { if (y1 < t || y1 > b) continue; }
    else { let a = (t - y1) / dy, c = (b - y1) / dy; if (a > c) { const s = a; a = c; c = s; } tmin = Math.max(tmin, a); tmax = Math.min(tmax, c); if (tmin > tmax) continue; }
    if (tmin < best) { best = tmin; bz = z; }
  }
  if (bz) { D.zhit.x = x1 + dx * best; D.zhit.y = y1 + dy * best; }
  return bz;
};

// Brute wall smash: a rough bite out of the page ahead of it.
D.smashWall = function (x, y, r) {
  fx.debrisBurst(x, y, r, 70, 340);
  fx.chunks(x, y, r, 4, 320);
  L.carve(x, y, r); L.carve(x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.6, r * 0.6);
  L.scorch(x, y, r, 0.35); fx.dust(x, y, 6, r * 0.6); fx.sparks(x, y, 6, 240);
  S.trauma = Math.min(1, S.trauma + 0.16 * D.attenuation(x, y)); D.sfx('smash', D.attenuation(x, y));
};

/* ---------- medkits ---------- */
const MK = D.medkits = [];
for (let i = 0; i < 8; i++) MK.push({ on: false, x: 0, y: 0, vy: 0, life: 0 });
D.dropMedkit = function (x, y) {
  for (const m of MK) if (!m.on) { m.on = true; m.x = x; m.y = y; m.vy = -220; m.life = 22; return; }
};
D.updateMedkits = function (dt) {
  for (const m of MK) {
    if (!m.on) continue;
    m.life -= dt; if (m.life <= 0 || m.y > L.H + 50) { m.on = false; continue; }
    m.vy = Math.min(700, m.vy + 1300 * dt);
    const ny = m.y + m.vy * dt;
    if (L.solidPx(m.x, ny + 7)) { m.vy = 0; } else m.y = ny;
    if (!P.dead && Math.abs(P.x - m.x) < 16 && Math.abs((P.y - 14) - m.y) < 24) {
      m.on = false; D.healPlayer(30); D.sfx('pickup', 0.9); fx.popup(P.x, P.y - 44, '+30 hp', '#7CF2A3', 14);
      fx.sparks(m.x, m.y, 10, 200, -Math.PI / 2, 2);
    }
  }
};

/* ---------- spawn points ---------- */
// True if a zombie could walk in a straight line at floor height fy from x1 to x2: body clear, ground underfoot.
function walkable(x1, x2, fy) {
  const dir = x2 > x1 ? 1 : -1, n = Math.ceil(Math.abs(x2 - x1) / 5); let noGround = 0;
  for (let i = 0; i <= n; i++) {
    const x = x1 + dir * i * 5;
    if (L.hitsRect(x - 4.5, fy - 30, x + 4.5, fy - 2)) return false;
    if (!L.solidPx(x, fy + 2) && ++noGround > 5) return false;
  }
  return true;
}
// Zombies arrive at a floor near the player's height that they can actually walk to the player from.
// (The page is a maze of cards and text, so a plain "nearest floor" would drop them into dead-end pockets.)
D.spawnPoint = function () {
  const W = L.W;
  for (let t = 0; t < 16; t++) {
    let side = Math.random() < 0.5 ? -1 : 1, x = P.x + side * rand(S.VW * 0.5 + 40, S.VW * 0.5 + 320);
    if (x < 16 || x > W - 16) { side = -side; x = P.x + side * rand(S.VW * 0.5 + 40, S.VW * 0.5 + 320); }
    x = clamp(x, 16, W - 16);
    if (Math.abs(x - P.x) < 200) continue;
    const fy = L.findFloor(x, P.y, 34);
    if (fy < 0 || Math.abs(fy - P.y) > 150) continue;
    if (walkable(x, P.x, fy)) return { x: x, y: fy - 1 };
  }
  // No reachable floor found: drop in from above, close to the player.
  return { x: clamp(P.x + (Math.random() < 0.5 ? -1 : 1) * rand(160, 320), 20, W - 20), y: Math.max(-60, P.y - 340) };
};

/* ---------- waves ---------- */
const Wv = D.waves = { n: 0, toSpawn: 0, total: 0, spawnT: 0, breakT: 0, state: 'break', interval: 1, maxAlive: 8, alive: 0, left: 0 };
Wv.reset = function () {
  for (const z of Z) z.alive = false;
  for (const m of MK) m.on = false;
  Wv.n = 0; Wv.state = 'break'; Wv.breakT = 2.4; Wv.toSpawn = 0; Wv.left = 0; S.wave = 0;
};
function pickType(n) {
  const w = [100, n >= 2 ? Math.min(70, 20 + 8 * n) : 0, n >= 4 ? Math.min(28, 4 + 3 * n) : 0, n >= 3 ? Math.min(36, 8 + 4 * n) : 0];
  let sum = w[0] + w[1] + w[2] + w[3], r = Math.random() * sum;
  for (let i = 0; i < 4; i++) { if (r < w[i]) return i + 1; r -= w[i]; }
  return WALKER;
}
function spawnOne(type) {
  const sp = D.spawnPoint(), n = Wv.n;
  const z = D.spawnZombie(type, sp.x, sp.y, 1 + 0.07 * (n - 1), 1 + Math.min(0.35, 0.02 * n) + rand(-0.08, 0.12));
  if (z && type === BRUTE) { S.trauma = Math.min(1, S.trauma + 0.1); D.sfx('groan', 0.9, 3); }
  return z;
}
function startWave(n) {
  Wv.n = n; S.wave = n; Wv.state = 'wave';
  Wv.total = Math.min(70, Math.round(5 + 2.6 * n + 0.12 * n * n)); Wv.toSpawn = Wv.total;
  Wv.interval = Math.max(0.3, 1.1 - 0.05 * n); Wv.maxAlive = Math.min(30, 8 + 2 * n); Wv.spawnT = 0.6;
  D.hud.banner('Wave ' + n, Wv.total + ' zombies' + (n % 5 === 0 ? ' and a brute squad' : ''));
  D.sfx('wave', 0.9);
  if (n % 5 === 0) for (let i = 0; i < Math.floor(n / 5) + 1; i++) spawnOne(BRUTE);
}
Wv.update = function (dt) {
  const alive = Wv.alive = D.aliveCount();
  Wv.left = alive + Wv.toSpawn;
  if (Wv.state === 'break') {
    Wv.breakT -= dt; if (Wv.breakT <= 0) startWave(Wv.n + 1);
    return;
  }
  Wv.spawnT -= dt;
  if (Wv.toSpawn > 0 && alive < Wv.maxAlive && Wv.spawnT <= 0) { spawnOne(pickType(Wv.n)); Wv.toSpawn--; Wv.spawnT = Wv.interval * rand(0.7, 1.3); }
  if (Wv.toSpawn <= 0 && alive === 0) {
    Wv.state = 'break'; Wv.breakT = 5;
    const bonus = 250 * Wv.n; S.score += bonus;
    D.hud.banner('Wave ' + Wv.n + ' cleared', '+' + bonus + ' points');
    D.dropMedkit(P.x + rand(-30, 30), P.y - 80); D.sfx('win', 0.5);
    D.hud.dirty();
  }
};
})(window.DD);
