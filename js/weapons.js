/* weapons.js: the nine weapons, grenades, projectiles, railgun beams, airstrikes and black holes. */
(function (D) {
'use strict';
const S = D.S, L = D.L, P = D.P, fx = D.fx, input = D.input, pointer = D.pointer, rand = D.rand, clamp = D.clamp, TAU = D.TAU;

// muzzle = barrel length from the shoulder; recoil = impulse pushed onto the player; shake = camera trauma per shot.
const WEAPONS = D.WEAPONS = [
  { id: 'pistol', name: 'Pistol', cd: 0.26, auto: true, muzzle: 22, recoil: 70, shake: 0.05 },
  { id: 'smg', name: 'SMG', cd: 0.062, auto: true, muzzle: 28, recoil: 18, shake: 0.03 },
  { id: 'shotgun', name: 'Shotgun', cd: 0.8, auto: true, muzzle: 32, recoil: 340, shake: 0.3 },
  { id: 'minigun', name: 'Minigun', cd: 0.033, auto: true, muzzle: 38, recoil: 10, shake: 0.05 },
  { id: 'flame', name: 'Flamethrower', cd: 0.03, auto: true, muzzle: 34, recoil: 6, shake: 0 },
  { id: 'rail', name: 'Railgun', cd: 1.7, auto: false, muzzle: 40, recoil: 460, shake: 0.5 },
  { id: 'rocket', name: 'Rockets', cd: 0.85, auto: true, muzzle: 32, recoil: 200, shake: 0.16 },
  { id: 'air', name: 'Airstrike', cd: 7, auto: false, muzzle: 12, recoil: 0, shake: 0 },
  { id: 'hole', name: 'Black hole', cd: 10, auto: false, muzzle: 28, recoil: 70, shake: 0.1 },
];
const NW = WEAPONS.length;
const cdT = D.cdT = new Float32Array(NW);
let gCd = 0;
D.grenadeCd = () => Math.max(0, gCd) / 0.9;
S.weapon = 0;

/* ---------- projectile pool ---------- */
const T = { BUL: 1, MG: 2, PEL: 3, MINI: 4, FLAME: 5, ROCKET: 6, GREN: 7, BOMB: 8, ACID: 9, ORB: 10 };
D.PT = T;
const PR = D.projs = [];
for (let i = 0; i < 360; i++) PR.push({ on: false, t: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, r: 0, dmg: 0, rot: 0, a: 0, b: 0, hx: 0, hy: 0 });
let prCur = 0;
function newProj(t, x, y, vx, vy, life, r, dmg) {
  for (let n = 0; n < PR.length; n++) {
    const p = PR[prCur = (prCur + 1) % PR.length];
    if (!p.on) { p.on = true; p.t = t; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.r = r || 0; p.dmg = dmg || 0; p.rot = 0; p.a = 0; p.b = 0; return p; }
  }
  return null;
}
const beams = D.beams = [];
for (let i = 0; i < 6; i++) beams.push({ on: false, x1: 0, y1: 0, x2: 0, y2: 0, life: 0, max: 0.3 });
const strikes = D.strikes = [];
for (let i = 0; i < 3; i++) strikes.push({ on: false, tx: 0, ty: 0, t: 0, state: 0, dir: 1, px: 0, py: 0, i: 0, beep: 0, vx: 0 });
const holes = D.holes;
for (let i = 0; i < 2; i++) holes.push({ on: false, x: 0, y: 0, t: 0, dur: 3.9, R: 0, pull: 1500, q: false, dmgT: 0, spin: 0 });

D.resetWeapons = function () {
  for (const p of PR) p.on = false;
  for (const b of beams) b.on = false;
  for (const s of strikes) s.on = false;
  for (const h of holes) h.on = false;
  cdT.fill(0); gCd = 0; P.charge = 0; P.spin = 0; S.weapon = 0;
  D.loop('hole', false); D.loop('mini', false); D.loop('flame', false);
};
D.selectWeapon = function (i) {
  i = ((i % NW) + NW) % NW;
  if (i !== S.weapon) { S.weapon = i; P.charge = 0; input.fireBuf = 0; D.sfx('click', 0.6); D.hud.weapon(); }
};

/* ---------- helpers ---------- */
let mx = 0, my = 0;
function muzzle(w) { mx = P.x + P.ax * w.muzzle; my = P.y - 21 + P.ay * w.muzzle; }
function kick(w, sh) {
  P.vx -= P.ax * w.recoil; if (!P.onGround) P.vy -= P.ay * w.recoil * 0.6;
  P.recoilT = 1; S.trauma = Math.min(1, S.trauma + (D.reduceMotion ? sh * 0.25 : sh));
}
function shell() { fx.shell(mx - P.ax * 12, my - P.ay * 12, -P.face * rand(40, 140) + P.vx * 0.3, -rand(160, 320)); }
function bullet(t, ang, speed, dmg, r, life) {
  return newProj(t, mx, my, Math.cos(ang) * speed, Math.sin(ang) * speed, life, r, dmg);
}

/* ---------- firing ---------- */
function fireWeapon() {
  const w = WEAPONS[S.weapon], a0 = Math.atan2(P.ay, P.ax);
  muzzle(w);
  switch (w.id) {
    case 'pistol':
      bullet(T.BUL, a0 + rand(-0.02, 0.02), 1600, 24, 7, 0.8); fx.muzzle(mx, my, a0, 30, false); shell(); D.sfx('pistol'); break;
    case 'smg':
      bullet(T.MG, a0 + rand(-0.06, 0.06), 1500, 10, 5, 0.8); fx.muzzle(mx, my, a0, 24, false); shell(); D.sfx('smg', 0.8); break;
    case 'shotgun':
      for (let i = 0; i < 9; i++) bullet(T.PEL, a0 + rand(-0.15, 0.15), rand(1000, 1300), 10, 4.5, 0.5);
      fx.muzzle(mx, my, a0, 58, true); fx.sparks(mx, my, 10, 520, a0, 0.7); shell(); shell(); D.sfx('shotgun'); break;
    case 'minigun':
      bullet(T.MINI, a0 + rand(-0.05, 0.05), 1800, 12, 5, 0.7); fx.muzzle(mx, my, a0, 30, Math.random() < 0.3); shell(); D.sfx('minigun', 0.7); break;
    case 'flame':
      for (let i = 0; i < 2; i++) { const p = bullet(T.FLAME, a0 + rand(-0.09, 0.09), rand(430, 560), 0, 6, rand(0.4, 0.52)); if (p) p.dmg = 4; }
      break;
    case 'rocket': {
      const p = bullet(T.ROCKET, a0, 420, 130, 78, 3);
      fx.muzzle(mx, my, a0, 46, true);
      for (let i = 0; i < 5; i++) fx.smokePuff(P.x - P.ax * 14 + rand(-6, 6), P.y - 21 - P.ay * 14 + rand(-6, 6), rand(6, 11), -P.ax * rand(60, 180) + rand(-40, 40), -P.ay * rand(60, 180) + rand(-40, 40), 0.9, 0.7);
      D.sfx('rocket'); if (!p) return; break;
    }
    default: break;
  }
  kick(w, w.shake);
}

// Railgun: charge, then instant piercing beam that tunnels through the page and every zombie in line.
function railFire() {
  const w = WEAPONS[5], ang = Math.atan2(P.ay, P.ax), cs = Math.cos(ang), sn = Math.sin(ang);
  muzzle(w);
  const ox = mx, oy = my; let len = 0, carved = 0;
  for (let d = 0; d < 1700; d += 5) {
    const x = ox + cs * d, y = oy + sn * d;
    if (x < -10 || x > L.W + 10 || y > L.H + 10 || y < -600) break;
    len = d;
    if (L.hitsRect(x - 13, y - 13, x + 13, y + 13)) {   // anything solid inside the 26px tunnel section
      if ((carved++ & 1) === 0) fx.debrisBurst(x, y, 14, 14, 380);
      if ((carved & 3) === 0) fx.sparks(x, y, 4, 420);
      if ((carved % 9) === 0) fx.chunks(x, y, 15, 1, 300);
      L.carve(x, y, 13, 3);   // armour takes triple damage from the beam
      if ((carved % 3) === 0) L.scorch(x, y, 13, 0.5, true);
    }
  }
  const ex = ox + cs * len, ey = oy + sn * len;
  L.scorch(ex, ey, 10, 0.4);
  // Drums along the beam, and zombies (pierces all).
  for (let i = 0; i < L.barrels.length; i++) {
    const b = L.barrels[i]; if (!b.alive) continue;
    const t = clamp((b.cx - ox) * cs + (b.cy - oy) * sn, 0, len), dx = ox + cs * t - b.cx, dy = oy + sn * t - b.cy;
    if (Math.abs(dx) < b.w / 2 + 12 && Math.abs(dy) < b.h / 2 + 12) D.damageBarrel(i, 60, 0.05);
  }
  for (const z of D.zombies) {
    if (!z.alive) continue;
    const zx = z.x, zy = z.y - z.h / 2, t = clamp((zx - ox) * cs + (zy - oy) * sn, 0, len), dx = ox + cs * t - zx, dy = oy + sn * t - zy;
    if (dx * dx + dy * dy < (z.h * 0.5 + 12) * (z.h * 0.5 + 12)) D.hurtZombie(z, 130, cs * 900, sn * 600 - 200, 'rail', zx, zy);
  }
  for (const b of beams) if (!b.on) { b.on = true; b.x1 = ox; b.y1 = oy; b.x2 = ex; b.y2 = ey; b.life = b.max = 0.32; break; }
  fx.muzzle(ox, oy, ang, 70, true);
  fx.ring(ox, oy, 60, 0.3, 6, 'rgb(170,220,255)');
  if (len < 1690) { fx.ring(ex, ey, 70, 0.4, 8, 'rgb(170,220,255)'); fx.sparks(ex, ey, 24, 520); fx.embers(ex, ey, 5, 1); }
  const rm = D.reduceMotion;
  S.flash = Math.max(S.flash, rm ? 0.15 : 0.4); S.flashCol = '#cfe6ff';
  if (!rm) { if (D.quality > 0.6) S.chroma = Math.max(S.chroma, 0.9); S.hitstop = Math.max(S.hitstop, 3 / 60); S.zoom = Math.max(S.zoom, 0.03); S.chromaCd = 0.6; S.hitCd = 0.28; }
  kick(w, w.shake);
  D.sfx('rail');
}

function throwGrenade() {
  gCd = 0.9;
  const sx = P.x, sy = P.y - 21, dx = D.aimPoint.x - sx, dy = D.aimPoint.y - sy, d = Math.hypot(dx, dy) || 1;
  const sp = clamp(d * 1.7, 320, 900), up = -Math.min(160, d * 0.25);
  const p = newProj(T.GREN, sx + P.ax * 14, sy + P.ay * 14, dx / d * sp + P.vx * 0.4, dy / d * sp + up + P.vy * 0.3, 1.6, 66, 110);
  if (p) { p.b = 0; D.sfx('throw'); }
}
D.throwGrenade = function () { if (gCd <= 0 && !P.dead && S.mode === 'play') throwGrenade(); };

D.spawnAcid = function (x, y, vx, vy) { newProj(T.ACID, x, y, vx, vy, 3, 10, 12); };

function callStrike() {
  for (const s of strikes) if (!s.on) {
    s.on = true; s.tx = D.aimPoint.x; s.ty = D.aimPoint.y; s.t = 1.3; s.state = 0; s.i = 0; s.beep = 0;
    fx.flare(s.tx, s.ty, 1.6); fx.ring(s.tx, s.ty, 50, 0.6, 5, 'rgb(255,80,120)');
    return;
  }
}
function launchOrb() {
  const w = WEAPONS[8], a0 = Math.atan2(P.ay, P.ax);
  muzzle(w);
  const dist = Math.hypot(D.aimPoint.x - mx, D.aimPoint.y - my);
  const p = newProj(T.ORB, mx, my, Math.cos(a0) * 700, Math.sin(a0) * 700, clamp(dist, 60, 900) / 700, 0, 0);
  if (p) { fx.muzzle(mx, my, a0, 40, false); D.sfx('holeopen', 0.6); kick(w, w.shake); }
}
function openHole(x, y) {
  for (const h of holes) if (!h.on) {
    h.on = true; h.x = x; h.y = y; h.t = 0; h.q = false; h.R = 0; h.dmgT = 0; h.spin = 0; h.rip = 0;
    fx.ring(x, y, 120, 0.5, 6, 'rgb(190,140,255)'); D.sfx('holeopen', 1); return;
  }
}

/* ---------- per-frame update ---------- */
D.updateWeapons = function (dt) {
  for (let i = 0; i < NW; i++) cdT[i] = Math.max(-0.05, cdT[i] - dt);
  gCd = Math.max(-0.05, gCd - dt);
  const alive = !P.dead, held = alive && input.firing, w = WEAPONS[S.weapon];
  if (S.weapon === 3 && held) P.spin = Math.min(1, P.spin + dt / 0.95); else P.spin = Math.max(0, P.spin - dt / 1.3);
  P.spinAng += P.spin * dt * 45;
  D.loop('mini', alive && P.spin > 0.03, P.spin);
  D.loop('flame', held && S.weapon === 4);
  if (alive) {
    if (S.weapon === 3) {
      if (held && P.spin > 0.14 && cdT[3] <= 0) { fireWeapon(); cdT[3] += D.lerp(0.2, 0.033, P.spin * P.spin) + 0.0; if (cdT[3] < 0) cdT[3] = 0.02; }
    } else if (w.auto) {
      if (held && cdT[S.weapon] <= 0) { if (S.weapon === 4 && cdT[4] < -0.04) D.sfx('flamestart', 0.7); fireWeapon(); cdT[S.weapon] = w.cd; }
    } else if (input.fireBuf > 0) {
      input.fireBuf -= dt;
      if (cdT[S.weapon] <= 0 && P.charge <= 0) {
        input.fireBuf = 0; cdT[S.weapon] = w.cd;
        if (w.id === 'rail') { P.charge = 0.36; D.sfx('railcharge'); } else if (w.id === 'air') { callStrike(); } else if (w.id === 'hole') launchOrb(); else fireWeapon();
      }
    }
    if (P.charge > 0) {
      P.charge -= dt;
      if (Math.random() < 0.6) fx.sparks(P.x + P.ax * 40, P.y - 21 + P.ay * 40, 1, 160);
      if (P.charge <= 0) { P.charge = 0; railFire(); }
    }
    if (input.grenadeBuf > 0) { input.grenadeBuf -= dt; if (gCd <= 0) { input.grenadeBuf = 0; throwGrenade(); } }
  }
  updateProjs(dt); updateStrikes(dt); updateHoles(dt);
  for (const b of beams) if (b.on && (b.life -= dt) <= 0) b.on = false;
};

let hitZ = null;
// Moves a projectile along its path in ~2px steps. Returns 0 (free), 1 (hit page at p.hx,p.hy) or 2 (hit zombie hitZ).
function sweep(p, dt) {
  const dx = p.vx * dt, dy = p.vy * dt, steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
  let hit = false, hx = 0, hy = 0, lx = p.x, ly = p.y;
  for (let s = 1; s <= steps; s++) {
    const tx = p.x + dx * s / steps, ty = p.y + dy * s / steps;
    if (L.solidPx(tx, ty)) { hit = true; hx = tx; hy = ty; break; }
    lx = tx; ly = ty;
  }
  hitZ = D.segZombie(p.x, p.y, hit ? hx : lx, hit ? hy : ly);
  if (hitZ) { p.x = D.zhit.x; p.y = D.zhit.y; return 2; }
  p.x = hit ? lx : p.x + dx; p.y = hit ? ly : p.y + dy;
  if (hit) { p.hx = hx; p.hy = hy; return 1; }
  return 0;
}

function updateProjs(dt) {
  for (let i = 0; i < PR.length; i++) {
    const p = PR[i]; if (!p.on) continue;
    p.life -= dt;
    switch (p.t) {
      case T.GREN: {
        p.vy += 1100 * dt;
        const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy) * dt / 2)), sdt = dt / steps;
        for (let s = 0; s < steps; s++) {
          const nx = p.x + p.vx * sdt; if (L.solidPx(nx, p.y)) { p.vx *= -0.45; if (Math.abs(p.vx) > 40) D.sfx('tick', 0.5); } else p.x = nx;
          const ny = p.y + p.vy * sdt; if (L.solidPx(p.x, ny)) { p.vy *= -0.4; p.vx *= 0.8; } else p.y = ny;
        }
        p.rot += p.vx * dt * 0.05;
        if (p.life <= 0) { D.boom(p.x, p.y, p.r, { dmg: p.dmg, selfDmg: 30 }); p.on = false; }
        break;
      }
      case T.BOMB: {
        p.vy += 900 * dt; p.y += p.vy * dt; p.rot = Math.atan2(p.vy, p.vx * 0.2 + 0.001);
        if (p.y >= p.b || (p.y >= p.a && L.solidPx(p.x, p.y + 4))) { D.boom(p.x, p.y, p.r, { dmg: p.dmg, selfDmg: 25 }); p.on = false; }
        else if (Math.random() < 0.5) fx.smokePuff(p.x, p.y - 8, rand(2, 4), 0, -20, 0.4, 0.4);
        if (p.y > L.H + 200) p.on = false;
        break;
      }
      case T.ACID: {
        p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (Math.random() < 0.4) fx.blood(p.x, p.y, 1, '#B6F03C', 0, -1, 40);
        let done = false;
        if (!P.dead && Math.abs(p.x - P.x) < 8 && p.y > P.y - P.h && p.y < P.y + 2) { D.hurtPlayer(p.dmg, Math.sign(p.vx) * 200, -160); done = true; }
        else if (L.solidPx(p.x, p.y)) done = true;
        if (done) {
          fx.blood(p.x, p.y, 10, '#B6F03C', 0, -1, 260); L.stain(p.x, p.y, 7, '#9BD82C', 0.6); D.pop(p.x, p.y, 10, { barrelDmg: 0 }); D.sfx('splat', 0.8); p.on = false;
        } else if (p.life <= 0) p.on = false;
        break;
      }
      case T.ORB: {
        const step = Math.hypot(p.vx, p.vy) * dt;
        let hit = false; const n = Math.max(1, Math.ceil(step / 3));
        for (let s = 0; s < n; s++) { p.x += p.vx * dt / n; p.y += p.vy * dt / n; if (L.solidPx(p.x, p.y)) { hit = true; break; } }
        if (Math.random() < 0.8) fx.sparks(p.x, p.y, 1, 90);
        if (hit || p.life <= 0) { openHole(p.x, p.y); p.on = false; }
        break;
      }
      case T.FLAME: {
        p.vx *= 1 - 1.6 * dt; p.vy = p.vy * (1 - 1.6 * dt) - 50 * dt; p.a++;
        const r = sweep(p, dt);
        if ((p.a & 1) === 0) fx.streamFlame(p.x, p.y, p.vx, p.vy, p.life > 0.25);
        if (r === 2) { hitZ.burn = 3.2; D.hurtZombie(hitZ, p.dmg, p.vx * 0.05, -20, 'fire'); p.on = false; }
        else if (r === 1) { D.fire.igniteArea(p.hx, p.hy, 10, 0.85); fx.streamFlame(p.x, p.y, -p.vx * 0.3, -40, true); if (Math.random() < 0.3) fx.embers(p.x, p.y, 1, 0.6); p.on = false; }
        else if (p.life <= 0) p.on = false;
        break;
      }
      case T.ROCKET: {
        const k = 1 + dt * 1.3; p.vx *= k; p.vy *= k;
        fx.smokePuff(p.x, p.y, rand(4, 7), rand(-20, 20), rand(-20, 20), 0.75, 0.65);
        if (Math.random() < 0.7) fx.flame(p.x - p.vx * 0.012, p.y - p.vy * 0.012);
        const r = sweep(p, dt);
        if (r === 1) { D.boom(p.hx, p.hy, p.r, { dmg: p.dmg, selfDmg: 38 }); p.on = false; }
        else if (r === 2) { D.boom(p.x, p.y, p.r, { dmg: p.dmg, selfDmg: 38 }); p.on = false; }
        else if (p.life <= 0) p.on = false;
        break;
      }
      default: {   // bullets, minigun rounds, shotgun pellets
        const r = sweep(p, dt);
        if (r === 2) {
          D.hurtZombie(hitZ, p.dmg, p.vx * 0.09, p.vy * 0.04 - 40, 'bullet', p.x, p.y);
          fx.sparks(p.x, p.y, 2, 200); p.on = false;
        } else if (r === 1) { D.pop(p.hx, p.hy, p.r, { ignite: p.t === T.MINI ? 0.12 : 0 }); p.on = false; }
        else if (p.life <= 0) p.on = false;
        break;
      }
    }
    if (p.on && (p.x < -100 || p.x > L.W + 100 || p.y > L.H + 100 || p.y < -900)) p.on = false;
  }
}

function updateStrikes(dt) {
  for (const s of strikes) {
    if (!s.on) continue;
    if (s.state === 0) {
      s.t -= dt; s.beep -= dt;
      if (s.beep <= 0) { s.beep = 0.42; D.sfx('beacon', 0.6); }
      if (s.t <= 0) {
        s.state = 1; s.dir = Math.random() < 0.5 ? 1 : -1; s.py = Math.min(S.camY + 70, s.ty - 230);
        s.px = s.tx - s.dir * (S.VW * 0.6 + 420); s.vx = s.dir * 1150; s.i = 0; D.sfx('plane', 0.9);
      }
    } else {
      s.px += s.vx * dt;
      const N = 9;
      while (s.i < N) {
        const bx = s.tx - s.dir * 260 + s.dir * s.i * (520 / (N - 1));
        if ((s.px - bx) * s.dir < 0) break;
        const armY = Math.min(Math.max(s.py + 40, s.ty - 170), s.ty - 20);
        const b = newProj(T.BOMB, bx, s.py + 8, 0, 60, 6, 60, 105); if (b) { b.a = armY; b.b = s.ty; }
        if (s.i === 0) D.sfx('whistle', 0.9);
        s.i++;
      }
      if (Math.random() < 0.8) fx.smokePuff(s.px - s.dir * 44, s.py + 2, rand(5, 9), rand(-10, 10), rand(-10, 10), 0.9, 0.45);
      if ((s.px - s.tx) * s.dir > S.VW * 0.6 + 500) s.on = false;
    }
  }
}

function updateHoles(dt) {
  let any = false;
  for (const h of holes) {
    if (!h.on) continue;
    any = true;
    h.t += dt; h.spin += dt * (2 + h.t * 2);
    const u = h.t / h.dur, grow = Math.min(1, h.t / 0.5), collapse = u > 0.92 ? 1 - (u - 0.92) / 0.08 : 1;
    h.R = 220 * grow * (0.35 + 0.65 * collapse);
    // Tear the page out in a growing, ragged disc. Pieces are sampled from the newly opened ring first, so
    // they fly in as debris and tumbling chunks while the gravity field drags them to the core.
    const cur = (24 + 150 * Math.min(1, h.t / (h.dur * 0.78))) * 0.8;
    if (u < 0.92) {
      for (let k = 0; k < (D.reduceMotion ? 10 : 24); k++) {
        const a = Math.random() * TAU, d = D.lerp(h.rip, cur + 10, Math.random()), x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d;
        if (x < 0 || y < 0 || x >= L.W || y >= L.H || !L.solidPx(x, y)) continue;
        fx.debrisBurst(x, y, 6, 4, 30);
        if (Math.random() < 0.1) fx.chunks(x, y, 11, 1, 40);
      }
      L.carve(h.x, h.y, cur);
      for (let k = 0; k < 6; k++) { const a = Math.random() * TAU; L.carve(h.x + Math.cos(a) * cur, h.y + Math.sin(a) * cur, rand(6, 16)); }
      L.stain(h.x, h.y, cur + 6, '#2b1748', 0.045);   // the void slowly stains the paper underneath
      h.rip = cur;
    }
    // Pull zombies and the player.
    h.dmgT -= dt; const dmgTick = h.dmgT <= 0; if (dmgTick) h.dmgT = 0.12;
    for (const z of D.zombies) {
      if (!z.alive) continue;
      const dx = h.x - z.x, dy = h.y - (z.y - z.h / 2), d = Math.hypot(dx, dy) || 1;
      if (d < h.R * 1.2) {
        const f = (1 - d / (h.R * 1.2)) * 1400;
        z.vx += dx / d * f * dt; z.vy += dy / d * f * dt - 900 * dt * (1 - d / h.R) * 0.5; z.stun = Math.max(z.stun, 0.15);
        if (f > 500) z.onGround = false;
        if (dmgTick && d < 60) D.hurtZombie(z, 22, 0, 0, 'hole');
      }
    }
    if (!P.dead) {
      const dx = h.x - P.x, dy = h.y - (P.y - 16), d = Math.hypot(dx, dy) || 1;
      if (d < h.R * 1.1) { const f = (1 - d / (h.R * 1.1)) * 950; P.vx += dx / d * f * dt; P.vy += dy / d * f * dt; if (f > 400) P.onGround = false; }
      if (d < 34 && dmgTick) D.hurtPlayer(6, 0, 0, true);
    }
    if (!h.q && u >= 0.92) {   // final implosion, then the blast
      h.q = true; D.sfx('holeend', 1); fx.ring(h.x, h.y, 260, 0.3, 4, 'rgb(220,200,255)');
      D.queueBoom(h.x, h.y, 120, { dmg: 220, selfDmg: 30, ignite: 0.9 }, 0.3);
    }
    if (h.t >= h.dur) h.on = false;
  }
  let prog = 0; for (let i = 0; i < holes.length; i++) if (holes[i].on) prog = Math.max(prog, holes[i].t / holes[i].dur);
  D.loop('hole', any, prog);
}
})(window.DD);
