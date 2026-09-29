/* render.js: draws the world, characters, projectiles and screen-space effects.
 * The world is drawn straight to the visible canvas. During a big blast (chromatic split) it is drawn
 * to an offscreen scene canvas first and re-composited per colour channel with a small offset. */
(function (D) {
'use strict';
const S = D.S, L = D.L, P = D.P, C = D.C, fx = D.fx, TAU = D.TAU, T = D.PT;
const gfx = D.gfx = { cv: null, ctx: null, scene: null, sg: null, tmp: null, tg: null, backdrop: '#D9D3C3' };

gfx.init = function (cv) {
  gfx.cv = cv; gfx.ctx = cv.getContext('2d');
  gfx.scene = document.createElement('canvas'); gfx.sg = gfx.scene.getContext('2d');
  gfx.tmp = document.createElement('canvas'); gfx.tg = gfx.tmp.getContext('2d');
};
gfx.resize = function () {
  const w = Math.round(S.VW * S.DPR), h = Math.round(S.VH * S.DPR);
  for (const c of [gfx.cv, gfx.scene, gfx.tmp]) { c.width = w; c.height = h; }
  gfx.cv.style.width = S.VW + 'px'; gfx.cv.style.height = S.VH + 'px';
};

// A purple glow sprite for black holes and the black hole projectile.
const HOLE_GLOW = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(120,70,220,0.85)'); gr.addColorStop(0.3, 'rgba(110,60,210,0.5)'); gr.addColorStop(1, 'rgba(90,40,200,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return c;
})();

function line(g, x1, y1, x2, y2) { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); }

/* ---------- guns (drawn in a frame where +x points along the barrel) ---------- */
function drawGun(g, id, rec) {
  const ink = C.ink;
  g.translate(-rec * 4, 0);
  switch (id) {
    case 0: g.fillStyle = ink; g.fillRect(-1, -3, 12, 4); g.fillRect(0, -1, 3, 6); break;
    case 1: g.fillStyle = ink; g.fillRect(-4, -3, 17, 4); g.fillRect(3, 1, 3, 6); g.fillRect(-2, 1, 3, 5); g.fillRect(13, -2, 4, 2); break;
    case 2: g.fillStyle = '#7A4E2D'; g.fillRect(-9, -2, 8, 4); g.fillRect(8, 0, 7, 3); g.fillStyle = ink; g.fillRect(-1, -3, 24, 3); break;
    case 3: {
      g.fillStyle = '#55556b'; g.fillRect(-8, -6, 17, 12); g.fillStyle = C.teal; g.fillRect(-8, 6, 11, 7);
      g.strokeStyle = '#2a2a3d'; g.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const oy = Math.sin(P.spinAng + i * 2.094) * 3.4; line(g, 9, oy, 33, oy); }
      g.fillStyle = ink; g.fillRect(30, -5, 3, 10); g.fillRect(-2, 6, 4, 5); break;
    }
    case 4:
      g.fillStyle = C.pink; g.beginPath(); g.roundRect ? g.roundRect(-13, -7, 9, 15, 3) : g.rect(-13, -7, 9, 15); g.fill();
      g.fillStyle = ink; g.fillRect(-5, -3, 22, 6); g.fillStyle = '#8A8797'; g.fillRect(17, -2, 11, 4);
      g.fillStyle = Math.random() < 0.5 ? '#FF9F1C' : C.yellow; g.beginPath(); g.arc(29, -1, 2 + Math.random(), 0, TAU); g.fill(); break;
    case 5: {
      g.fillStyle = '#2C2C46'; g.fillRect(-9, -4, 38, 8);
      const hot = P.charge > 0; g.fillStyle = hot ? '#FFFFFF' : '#6FE3FF'; g.fillRect(4, -6, 30, 2); g.fillRect(4, 4, 30, 2);
      g.fillStyle = C.pink; g.fillRect(10, -6, 3, 12); g.fillRect(19, -6, 3, 12); g.fillStyle = ink; g.fillRect(-4, 4, 4, 6); break;
    }
    case 6: g.fillStyle = C.teal; g.fillRect(-13, -6, 36, 8); g.fillStyle = C.pink; g.fillRect(23, -6, 3, 8); g.fillStyle = ink; g.fillRect(-4, -6, 2, 8); g.fillRect(9, -6, 2, 8); g.fillRect(1, 2, 3, 6); break;
    case 7:
      g.fillStyle = ink; g.fillRect(0, -6, 13, 10); g.fillStyle = C.yellow; g.fillRect(2, -4, 8, 4); g.strokeStyle = ink; g.lineWidth = 1.5; line(g, 10, -6, 14, -14);
      g.fillStyle = (S.time * 6 | 0) % 2 ? '#FF3060' : '#5a1020'; g.beginPath(); g.arc(14, -15, 2, 0, TAU); g.fill(); break;
    default:
      g.fillStyle = '#3d2a6b'; g.fillRect(4, -3, 18, 6); g.strokeStyle = '#7B5EA7'; g.lineWidth = 3; g.beginPath(); g.arc(4, 0, 7, 0, TAU); g.stroke();
      g.fillStyle = '#0a0612'; g.beginPath(); g.arc(4, 0, 3.6, 0, TAU); g.fill(); break;
  }
}

function drawStick(g) {
  if (P.dead) return;
  const x = P.x, y = P.y, f = P.face, hipY = y - 12, shY = y - 21, hY = y - 27;
  if (P.inv > 0 && P.hurtT <= 0 && (S.time * 24 | 0) % 2) g.globalAlpha = 0.45;
  g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = C.ink; g.lineWidth = 2.4;
  // Jetpack pack (flame comes from particles).
  g.fillStyle = '#5C5C70'; g.fillRect(x - f * 6 - 3, shY - 1, 5, 10);
  if (P.dashT > 0) { g.globalAlpha *= 0.3; for (let i = 1; i <= 3; i++) { g.strokeStyle = C.teal; line(g, x - P.dashDir * i * 9, hipY, x - P.dashDir * i * 9, shY); } g.globalAlpha = 1; g.strokeStyle = C.ink; }
  let l1x, l1y, l2x, l2y;
  if (P.onGround) {
    const s = Math.sin(P.walkT), amp = Math.min(1, Math.abs(P.vx) / 120) * 6;
    l1x = x + s * amp; l2x = x - s * amp;
    l1y = y - Math.max(0, Math.cos(P.walkT)) * 2 * (amp / 6); l2y = y - Math.max(0, -Math.cos(P.walkT)) * 2 * (amp / 6);
  } else { l1x = x - 4; l2x = x + 5; l1y = y - 4; l2y = y - 2; }
  const hx = x + P.ax * 10, hy = shY + P.ay * 10, id = S.weapon, reach = id === 0 || id === 4 || id === 7 ? 11 : 15;
  // Pale halo behind the skeleton so the player stays readable against smoke and dark page areas.
  g.strokeStyle = 'rgba(255,253,247,.8)'; g.lineWidth = 6;
  line(g, x, hipY, l1x, l1y); line(g, x, hipY, l2x, l2y); line(g, x, hipY, x, shY); line(g, x, shY, hx, hy); line(g, x, shY, x + P.ax * reach, shY + P.ay * reach);
  g.beginPath(); g.arc(x, hY, 6.6, 0, TAU); g.fillStyle = 'rgba(255,253,247,.8)'; g.fill();
  g.strokeStyle = C.ink; g.lineWidth = 2.4;
  line(g, x, hipY, l1x, l1y); line(g, x, hipY, l2x, l2y); line(g, x, hipY, x, shY);
  g.beginPath(); g.arc(x, hY, 4.6, 0, TAU); g.fillStyle = C.paper; g.fill(); g.stroke();
  // Bandana tail so the player reads at a glance against page content.
  g.strokeStyle = C.pink; g.lineWidth = 2.2; line(g, x - f * 4, hY - 1, x - f * 9, hY + 1 + Math.sin(S.time * 14) * 1.5); g.strokeStyle = C.ink; g.lineWidth = 2.4;
  line(g, x, shY, hx, hy); line(g, x, shY, x + P.ax * reach, shY + P.ay * reach);
  g.save(); g.translate(hx, hy); g.rotate(Math.atan2(P.ay, P.ax)); if (P.ax < 0) g.scale(1, -1); drawGun(g, id, P.recoilT); g.restore();
  if (P.charge > 0) {   // railgun charge glow
    g.globalCompositeOperation = 'lighter'; const r = 6 + (0.36 - P.charge) * 40; g.globalAlpha = 0.9;
    g.drawImage(fx.sprites.fire[1], x + P.ax * 40 - r, shY + P.ay * 40 - r, r * 2, r * 2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  if (P.fuel < 0.99) {
    g.fillStyle = 'rgba(27,27,47,.35)'; g.fillRect(x - 10, hY - 12, 20, 3);
    g.fillStyle = P.fuel > 0.25 ? C.teal : C.pink; g.fillRect(x - 10, hY - 12, 20 * P.fuel, 3);
  }
  g.globalAlpha = 1;
}

function drawZombie(g, z) {
  const T2 = D.ZT[z.type], x = z.x, y = z.y, f = z.face, brute = z.type === 3, spit = z.type === 4, hit = z.flash > 0;
  const sc = brute ? 1.45 : 1, hipY = y - 12 * sc, shY = y - 21 * sc, hY = y - 27 * sc;
  if (z.emerge > 0) g.globalAlpha = 1 - z.emerge * 1.2;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const skin = hit ? '#FFFFFF' : T2.skin, shirt = hit ? '#FFFFFF' : T2.shirt, ink = hit ? '#FFFFFF' : C.ink;
  const bob = Math.sin(z.walkT * 2) * 0.8, lean = z.type === 2 ? 4 : 2;
  // legs
  g.strokeStyle = ink; g.lineWidth = brute ? 3.6 : 2.4;
  let l1x, l2x, l1y, l2y;
  if (z.onGround) {
    const s = Math.sin(z.walkT), amp = Math.min(1, Math.abs(z.vx) / 60) * (z.type === 2 ? 8 : 5) * sc;
    l1x = x + s * amp; l2x = x - s * amp; l1y = y - Math.max(0, Math.cos(z.walkT)) * 2; l2y = y - Math.max(0, -Math.cos(z.walkT)) * 2;
  } else { l1x = x - 4; l2x = x + 4; l1y = y - 5; l2y = y - 2; }
  line(g, x, hipY, l1x, l1y); line(g, x, hipY, l2x, l2y);
  // torso (shirt colour), leaning toward its target
  g.strokeStyle = shirt; g.lineWidth = brute ? 8 : spit ? 6 : 3.6;
  line(g, x, hipY, x + f * lean, shY + bob);
  if (spit && !hit) { g.fillStyle = '#B6F03C'; g.beginPath(); g.arc(x + f * 1, hipY - 3, 4.5 + Math.sin(S.time * 6 + z.seed) * 0.6, 0, TAU); g.fill(); }
  // arms reaching out
  g.strokeStyle = skin; g.lineWidth = brute ? 4 : 2.2;
  const arm = (brute ? 15 : 11) + Math.sin(S.time * 5 + z.seed) * 1.2;
  line(g, x + f * lean, shY + bob, x + f * (lean + arm), shY - 2 + bob + Math.sin(S.time * 4 + z.seed) * 2);
  line(g, x + f * lean, shY + bob, x + f * (lean + arm * 0.8), shY + 4 + bob);
  // head
  const hr = brute ? 6.4 : 4.6, hx = x + f * (lean + 1.5);
  g.beginPath(); g.arc(hx, hY + bob, hr, 0, TAU); g.fillStyle = skin; g.fill(); g.strokeStyle = ink; g.lineWidth = brute ? 2.6 : 2; g.stroke();
  if (!hit) { g.fillStyle = C.ink; g.fillRect(hx + f * 1.6 - 1, hY - 1.5 + bob, 2, 2); g.fillRect(hx + f * 1.6 - 1, hY + 1.5 + bob, 3, 1); }
  if (z.burn > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.fillStyle = '#FF7A1A'; g.beginPath(); g.arc(x, y - z.h * 0.5, z.h * 0.5, 0, TAU); g.fill(); g.globalCompositeOperation = 'source-over'; }
  g.globalAlpha = 1;
  if (z.hpShow > 0 && z.hp < z.maxHp) {
    const w = brute ? 30 : 18, by = y - z.h - 12;
    g.fillStyle = 'rgba(27,27,47,.55)'; g.fillRect(x - w / 2, by, w, 3);
    g.fillStyle = z.hp / z.maxHp > 0.35 ? '#7FE04B' : C.pink; g.fillRect(x - w / 2, by, w * Math.max(0, z.hp / z.maxHp), 3);
  }
}

function drawProjectiles(g) {
  const PR = D.projs;
  g.lineCap = 'round';
  for (let i = 0; i < PR.length; i++) {
    const p = PR[i]; if (!p.on) continue;
    switch (p.t) {
      case T.BUL: case T.MG: case T.PEL: case T.MINI: {
        const len = p.t === T.MINI ? 0.032 : p.t === T.BUL ? 0.02 : p.t === T.MG ? 0.016 : 0.01, x0 = p.x - p.vx * len, y0 = p.y - p.vy * len;
        g.strokeStyle = p.t === T.MINI ? '#E8590C' : '#F08C00'; g.lineWidth = p.t === T.PEL ? 2.4 : 3.4; line(g, x0, y0, p.x, p.y);
        g.strokeStyle = '#FFF3C4'; g.lineWidth = p.t === T.PEL ? 1 : 1.6; line(g, x0 * 0.3 + p.x * 0.7, y0 * 0.3 + p.y * 0.7, p.x, p.y);
        break;
      }
      case T.ROCKET: {
        g.save(); g.translate(p.x, p.y); g.rotate(Math.atan2(p.vy, p.vx));
        g.fillStyle = C.teal; g.fillRect(-11, -3, 14, 6); g.fillStyle = C.pink; g.fillRect(3, -3, 5, 6); g.fillStyle = C.ink; g.fillRect(-13, -4, 3, 8);
        g.globalCompositeOperation = 'lighter'; g.drawImage(fx.sprites.fire[2], -34, -12, 26, 24); g.drawImage(fx.sprites.fire[0], -22, -7, 14, 14); g.restore(); g.globalCompositeOperation = 'source-over'; break;
      }
      case T.GREN: {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = '#4A6B3A'; g.beginPath(); g.arc(0, 0, 4.5, 0, TAU); g.fill(); g.fillStyle = C.ink; g.fillRect(-1, -7, 2, 3);
        if (p.life < 0.6 && (p.life * 14 | 0) % 2) { g.fillStyle = '#FF3060'; g.beginPath(); g.arc(0, 0, 2, 0, TAU); g.fill(); } g.restore(); break;
      }
      case T.BOMB: {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot - Math.PI / 2 + Math.PI);
        g.fillStyle = '#2b2b4a'; g.beginPath(); g.ellipse(0, 0, 4.5, 11, 0, 0, TAU); g.fill();
        g.fillStyle = C.pink; g.fillRect(-4.5, -3, 9, 2.5); g.fillStyle = C.ink; g.fillRect(-6, 7, 12, 2); g.fillRect(-1, 9, 2, 5); g.restore(); break;
      }
      case T.ACID: {
        g.fillStyle = '#9BD82C'; g.beginPath(); g.arc(p.x, p.y, 4, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = '#E6FF9A'; g.fillRect(p.x - 1.5, p.y - 2, 2, 2); break;
      }
      case T.ORB: {
        g.drawImage(HOLE_GLOW, p.x - 26, p.y - 26, 52, 52);
        g.fillStyle = '#0a0612'; g.beginPath(); g.arc(p.x, p.y, 6, 0, TAU); g.fill(); g.strokeStyle = '#C9A8FF'; g.lineWidth = 1.6; g.stroke(); break;
      }
      default: break;
    }
  }
}

function drawBeams(g) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const b of D.beams) {
    if (!b.on) continue;
    const t = b.life / b.max, w = 34 * t * t + 5;
    g.strokeStyle = 'rgba(40,110,255,' + (0.35 * t).toFixed(3) + ')'; g.lineWidth = w * 2.8; line(g, b.x1, b.y1, b.x2, b.y2);
    g.strokeStyle = 'rgba(70,170,255,' + (0.8 * t).toFixed(3) + ')'; g.lineWidth = w * 1.5; line(g, b.x1, b.y1, b.x2, b.y2);
    g.strokeStyle = 'rgba(235,250,255,' + t.toFixed(3) + ')'; g.lineWidth = w * 0.7; line(g, b.x1, b.y1, b.x2, b.y2);
    g.globalCompositeOperation = 'lighter'; g.strokeStyle = 'rgba(255,255,255,' + t.toFixed(3) + ')'; g.lineWidth = w * 0.3; line(g, b.x1, b.y1, b.x2, b.y2); g.globalCompositeOperation = 'source-over';
    // crackling arcs along the beam
    const dx = b.x2 - b.x1, dy = b.y2 - b.y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    g.strokeStyle = 'rgba(30,90,230,' + (0.8 * t).toFixed(3) + ')'; g.lineWidth = 1.5;
    for (let a = 0; a < 3; a++) {
      g.beginPath(); g.moveTo(b.x1, b.y1);
      for (let s = 1; s <= 14; s++) { const u = s / 14, o = (Math.random() - 0.5) * 26 * t; g.lineTo(b.x1 + dx * u + nx * o, b.y1 + dy * u + ny * o); }
      g.stroke();
    }
  }
}

function drawPlane(g, x, y, dir) {
  g.save(); g.translate(x, y); g.scale(dir, 1);
  g.fillStyle = '#23233b'; g.beginPath(); g.moveTo(-6, 3); g.lineTo(-38, 22); g.lineTo(-28, 22); g.lineTo(16, 3); g.closePath(); g.fill();   // far wing
  g.beginPath(); g.moveTo(-46, -2); g.lineTo(-60, -17); g.lineTo(-50, -17); g.lineTo(-32, -2); g.closePath(); g.fill();                           // tail fin
  g.fillStyle = '#2f2f52'; g.beginPath(); g.ellipse(0, 0, 54, 9.5, 0, 0, TAU); g.fill();
  g.fillStyle = C.pink; g.fillRect(-30, -3, 44, 3);
  g.fillStyle = C.teal; g.beginPath(); g.ellipse(24, -4, 9, 4.5, 0, Math.PI, TAU); g.fill();
  g.fillStyle = '#3b3b66'; g.beginPath(); g.moveTo(-2, 4); g.lineTo(-34, 24); g.lineTo(-22, 24); g.lineTo(20, 4); g.closePath(); g.fill();   // near wing
  g.globalCompositeOperation = 'lighter'; g.drawImage(fx.sprites.fire[2], -76, -10, 34, 20); g.globalCompositeOperation = 'source-over';
  g.restore();
}
function drawStrikes(g) {
  for (const s of D.strikes) {
    if (!s.on) continue;
    if (s.state === 0) {
      const pulse = 0.5 + 0.5 * Math.sin(S.time * 14);
      g.strokeStyle = 'rgba(232,63,111,' + (0.28 + 0.22 * pulse).toFixed(2) + ')'; g.lineWidth = 7; line(g, s.tx, s.ty, s.tx, S.camY - 40);
      g.strokeStyle = 'rgba(232,63,111,.95)'; g.lineWidth = 1.6; line(g, s.tx, s.ty, s.tx, S.camY - 40);
      g.lineWidth = 2.4; g.beginPath(); g.arc(s.tx, s.ty, 18 + pulse * 8, 0, TAU); g.stroke();
      g.setLineDash([6, 6]); line(g, s.tx - 262, s.ty, s.tx + 262, s.ty); g.setLineDash([]);
      line(g, s.tx - 262, s.ty - 10, s.tx - 262, s.ty + 10); line(g, s.tx + 262, s.ty - 10, s.tx + 262, s.ty + 10);
    } else drawPlane(g, s.px, s.py, s.dir);
  }
}

function drawHoles(g) {
  for (const h of D.holes) {
    if (!h.on) continue;
    const u = h.t / h.dur, grow = Math.min(1, h.t / 0.5), collapse = u > 0.92 ? 1 - (u - 0.92) / 0.08 : 1;
    const vr = (12 + 20 * grow) * (0.25 + 0.75 * collapse);
    g.globalAlpha = 0.85; g.drawImage(HOLE_GLOW, h.x - vr * 4, h.y - vr * 4, vr * 8, vr * 8);
    // swirl streaks spiralling into the core
    g.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a0 = h.spin + i * TAU / 16, r0 = h.R * (0.55 + 0.4 * ((i * 7) % 5) / 5);
      g.strokeStyle = 'rgba(110,60,200,' + (0.22 + 0.12 * ((i * 3) % 4)).toFixed(2) + ')'; g.lineWidth = 2;
      g.beginPath(); g.arc(h.x, h.y, r0, a0, a0 + 0.55 - r0 / h.R * 0.15); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = '#050308'; g.beginPath(); g.arc(h.x, h.y, vr, 0, TAU); g.fill();
    g.strokeStyle = '#D9C2FF'; g.lineWidth = 2.5; g.beginPath(); g.arc(h.x, h.y, vr, 0, TAU); g.stroke();
  }
}

function drawMedkits(g) {
  for (const m of D.medkits) {
    if (!m.on) continue;
    if (m.life < 5 && (m.life * 6 | 0) % 2) continue;
    const bob = Math.sin(S.time * 5 + m.x) * 1.5, x = m.x, y = m.y - 7 + bob;
    g.fillStyle = C.paper; g.strokeStyle = C.ink; g.lineWidth = 1.8; D.roundRect(g, x - 8, y - 6, 16, 13, 3); g.fill(); g.stroke();
    g.fillStyle = C.pink; g.fillRect(x - 1.5, y - 4, 3, 9); g.fillRect(x - 4.5, y - 1.5, 9, 3);
  }
}

function drawChrome(g) {
  const y = -52;
  g.fillStyle = '#ECE8DC'; g.fillRect(0, y, L.W, 52);
  g.fillStyle = '#FFFFFF'; D.roundRect(g, 10, y + 11, L.W - 20, 30, 15); g.fill();
  g.strokeStyle = '#C9C3B3'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#6B6878'; g.font = '13px ' + D.F_BODY; g.fillText('megasave-chemist.example/sale', 26, y + 31);
}

function drawWorld(g) {
  g.setTransform(S.DPR, 0, 0, S.DPR, 0, 0); g.imageSmoothingEnabled = false;
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.fillStyle = gfx.backdrop; g.fillRect(0, 0, S.VW, S.VH);
  const z = 1 + S.zoom, sh = S.trauma * S.trauma * (D.reduceMotion ? 5 : 26);
  g.save();
  g.translate(S.VW / 2, S.VH / 2); g.scale(z, z); g.translate(-S.VW / 2, -S.VH / 2);
  g.translate(Math.round(S.offX - S.camX + (Math.random() - 0.5) * sh), Math.round(-S.camY + (Math.random() - 0.5) * sh));
  fx.setView(S.camX - S.offX, S.camY, S.camX - S.offX + S.VW, S.camY + S.VH);
  if (S.camY < 0) drawChrome(g);
  const top = Math.max(0, Math.floor(S.camY) - 2), bot = Math.min(L.H, Math.ceil(S.camY + S.VH) + 2);
  if (bot > top) { g.drawImage(L.bg, 0, top, L.W, bot - top, 0, top, L.W, bot - top); g.drawImage(L.site, 0, top, L.W, bot - top, 0, top, L.W, bot - top); }
  if (S.dim > 0.01) { g.fillStyle = 'rgba(14,6,24,' + S.dim.toFixed(2) + ')'; g.fillRect(0, top, L.W, bot - top); }   // lets fire read as light against a white page
  fx.drawSolid(g);
  drawMedkits(g);
  for (const zb of D.zombies) if (zb.alive) drawZombie(g, zb);
  drawStick(g);
  drawProjectiles(g);
  drawHoles(g);
  fx.drawSmoke(g);
  drawBeams(g);
  drawStrikes(g);
  fx.drawFire(g);
  fx.drawAdd(g);
  fx.drawText(g);
  g.restore();
}

D.render = function () {
  const ctx = gfx.ctx;
  if (S.chroma > 0.03) {
    drawWorld(gfx.sg);
    const w = gfx.cv.width, h = gfx.cv.height, d = Math.round(S.chroma * 7 * S.DPR), tg = gfx.tg;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const chans = [['#ff0000', d], ['#00ff00', 0], ['#0000ff', -d]];
    for (let i = 0; i < 3; i++) {
      tg.setTransform(1, 0, 0, 1, 0, 0); tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, w, h);
      tg.drawImage(gfx.scene, chans[i][1], 0);
      tg.globalCompositeOperation = 'multiply'; tg.fillStyle = chans[i][0]; tg.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(gfx.tmp, 0, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else drawWorld(ctx);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over';
  if (S.flash > 0.01) { ctx.globalAlpha = Math.min(1, S.flash); ctx.fillStyle = S.flashCol; ctx.fillRect(0, 0, gfx.cv.width, gfx.cv.height); ctx.globalAlpha = 1; }
  // Aim reticle (screen space).
  if (D.pointer.has && S.mode === 'play' && !D.isTouch) {
    ctx.setTransform(S.DPR, 0, 0, S.DPR, 0, 0); const px = D.pointer.x, py = D.pointer.y;
    ctx.strokeStyle = 'rgba(27,27,47,.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.stroke();
    ctx.strokeStyle = '#FFD23F'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(px, py, 9, 0, TAU); ctx.stroke();
    ctx.fillStyle = C.pink; ctx.fillRect(px - 1, py - 1, 2, 2);
  }
};
})(window.DD);
