/* player.js: the stickman. Run, jump, jetpack, drop through with S, dash, take damage, die. */
(function (D) {
'use strict';
const S = D.S, L = D.L, P = D.P, fx = D.fx, keys = D.keys, input = D.input, pointer = D.pointer, rand = D.rand;
const SHOULDER = 21;

D.playerReset = function () {
  Object.assign(P, { x: L.W * 0.5, y: -2, vx: 0, vy: 0, onGround: false, face: 1, fuel: 1, thrust: false, hp: P.maxHp, inv: 0, dashT: 0, dashCd: 0, hurtT: 0, dead: false, spin: 0, charge: 0, recoilT: 0, burn: 0, dropT: 0 });
};

D.aim = function () {
  const sx = P.x, sy = P.y - SHOULDER;
  let ax, ay;
  if (pointer.has) { ax = pointer.x - S.offX + S.camX; ay = pointer.y + S.camY; } else { ax = sx + P.face * 100; ay = sy; }
  D.aimPoint.x = ax; D.aimPoint.y = ay;
  const dx = ax - sx, dy = ay - sy, d = Math.hypot(dx, dy) || 1;
  P.ax = dx / d; P.ay = dy / d;
  if (Math.abs(dx) > 2) P.face = dx >= 0 ? 1 : -1;
};
D.aimPoint = { x: 0, y: 0 };

D.tryDash = function () {
  if (P.dead || P.dashCd > 0 || S.mode !== 'play') return;
  const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) || P.face;
  P.dashDir = dir; P.dashT = 0.17; P.dashCd = 0.95; P.inv = Math.max(P.inv, 0.3);
  fx.dust(P.x, P.y, 5, 6); D.sfx('dash', 0.8);
};

D.hurtPlayer = function (dmg, kx, ky, self) {
  if (P.dead || (P.inv > 0 && !self)) return;
  P.hp -= dmg; P.inv = self ? Math.max(P.inv, 0.15) : 0.5; P.hurtT = 0.25;
  if (kx || ky) { P.vx += kx; P.vy += ky; P.onGround = false; }
  S.combo = Math.floor(S.combo / 2); if (S.combo < 3) S.mult = 1;
  S.trauma = Math.min(1, S.trauma + 0.3);
  if (!D.reduceMotion) S.hitstop = Math.max(S.hitstop, 2 / 60);
  fx.blood(P.x, P.y - 18, 6, '#E83F6F', -Math.sign(kx || 1), -0.4, 240);
  D.sfx('hurt', 0.9); D.hud.hurt();
  if (P.hp <= 0) { P.hp = 0; D.playerDie(); }
};
D.healPlayer = function (n) { P.hp = Math.min(P.maxHp, P.hp + n); D.hud.dirty(); };

D.playerDie = function () {
  P.dead = true; S.mode = 'dead'; S.slow = 0.25; S.slowT = 1.5;
  const cx = P.x, cy = P.y - 16;
  fx.gibs(cx, cy, 10, D.C.ink, P.vx * 0.3, P.vy * 0.3, 10);
  fx.gibs(cx, cy, 3, D.C.paper, 0, -80, 8);
  fx.blood(cx, cy, 20, '#E83F6F', 0, -1, 320);
  S.flash = Math.max(S.flash, 0.5); S.flashCol = '#ff4060'; S.trauma = 1;
  D.loop('mini', false); D.loop('flame', false);
  D.sfx('over', 1); D.hud.dirty();
};

D.updatePlayer = function (dt) {
  if (P.dead) return;
  let guard = 0; while (L.entHits(P, P.x, P.y) && guard++ < 20) P.y -= 2;
  P.inv -= dt; P.hurtT -= dt; P.dashCd -= dt; P.recoilT = Math.max(0, P.recoilT - dt * 9);
  const move = (keys.left ? -1 : 0) + (keys.right ? 1 : 0);
  if (!pointer.has && move) P.face = move;

  if (P.dashT > 0) {
    P.dashT -= dt; P.vx = P.dashDir * 620; P.vy *= 0.85;
    P.vy += 1500 * dt * 0.2;
    if (Math.random() < 0.7) fx.dust(P.x - P.dashDir * 6, P.y - rand(2, 26), 1, 2);
  } else {
    P.vx += (move * 175 - P.vx) * Math.min(1, dt * (P.onGround ? 14 : 3.2));
    P.vy += 1500 * dt;
  }
  if (input.jumpBuf > 0) {
    input.jumpBuf -= dt;
    if (P.onGround) { P.vy = -470; P.onGround = false; input.jumpBuf = 0; D.sfx('jump', 0.8); }
  }
  // Jetpack: hold jump in the air.
  P.thrust = false;
  if (keys.jump && !P.onGround && P.vy > -260 && P.fuel > 0 && P.dashT <= 0) {
    P.vy -= 3300 * dt; if (P.vy < -330) P.vy = -330;
    P.fuel = Math.max(0, P.fuel - dt * 0.42); P.thrust = true;
    fx.jet(P.x - P.face * 7 + rand(-1.5, 1.5), P.y - 10);
  }
  if (P.onGround) P.fuel = Math.min(1, P.fuel + dt * 0.7);
  P.vy = Math.min(P.vy, 900);

  // S: drop through thin floors by carving a hole under the feet (quick, small).
  if (P.dropT > 0) P.dropT -= dt;
  if (keys.down && P.onGround && P.dropT <= 0) {
    P.dropT = 0.3;
    D.pop(P.x, P.y + 4, 9, { barrelDmg: 0 }); P.y += 3; P.onGround = false;
  }

  L.moveX(P, P.vx * dt);
  const landV = L.moveY(P, P.vy * dt);
  if (landV > 520) { fx.dust(P.x, P.y, 4, 6); if (landV > 760) S.trauma = Math.min(1, S.trauma + 0.06); }
  if (P.y < -220) { P.y = -220; if (P.vy < 0) P.vy = 0; }
  if (P.onGround && Math.abs(P.vx) > 20) P.walkT += dt * Math.abs(P.vx) * 0.075;

  // Fire hurts.
  if (D.fire.burningAt(P.x, P.y - 8) && P.dashT <= 0) P.burn = 1.2;
  if (P.burn > 0) {
    P.burn -= dt;
    if (Math.random() < dt * 18) fx.flame(P.x + rand(-4, 4), P.y - rand(4, 30));
    P.burnTick = (P.burnTick || 0) - dt;
    if (P.burnTick <= 0) { P.burnTick = 0.45; D.hurtPlayer(3, 0, 0, true); }
  }
  D.aim();
};
})(window.DD);
