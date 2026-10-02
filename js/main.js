/* main.js: boot, input, game state machine and the frame loop. */
(function (D) {
'use strict';
const S = D.S, L = D.L, P = D.P, keys = D.keys, input = D.input, pointer = D.pointer, fx = D.fx;
const app = document.getElementById('app'), cv = document.getElementById('game');
D.isTouch = !!(window.matchMedia && matchMedia('(pointer:coarse)').matches);

/* ---------- sizing ---------- */
function measure() {
  const r = app.getBoundingClientRect();
  S.VW = Math.max(1, Math.round(r.width)); S.VH = Math.max(1, Math.round(r.height));
  S.DPR = Math.min(2, window.devicePixelRatio || 1);
  D.gfx.resize();
  S.offX = Math.max(0, (S.VW - L.W) / 2);
}
function readBackdrop() { D.gfx.backdrop = getComputedStyle(document.documentElement).getPropertyValue('--backdrop').trim() || '#D9D3C3'; }

/* ---------- game state ---------- */
D.newGame = function (rebuild) {
  if (rebuild || !L.src) L.build(S.VW); else L.reset();
  S.offX = Math.max(0, (S.VW - L.W) / 2);
  Object.assign(S, { mode: "play", trauma: 0, zoom: 0, dim: 0, flash: 0, chroma: 0, hitstop: 0, slow: 1, slowT: 0, score: 0, kills: 0, combo: 0, comboT: 0, mult: 1, wonShown: false, time: 0, wave: 0, cellsScore: 0, deadT: 0, prevSolid: L.solidNow });
  D.fire.reset(); fx.reset(); D.boomReset(); D.resetWeapons(); D.waves.reset(); D.playerReset();
  S.camY = -160; S.camX = 0;
  input.firing = false; input.fireBuf = 0; input.grenadeBuf = 0;
  D.hud.reset();
};

function updateGame(dt) {
  if (S.mode === 'play') {
    D.updatePlayer(dt);
    D.updateWeapons(dt);
    D.updateZombies(dt);
    D.waves.update(dt);
    D.updateMedkits(dt);
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) { S.combo = 0; S.mult = 1; } }
  } else if (S.mode === 'dead') {
    D.updateWeapons(dt); D.updateZombies(dt); D.updateMedkits(dt);
  }
  D.fire.update(dt);
  D.fire.emit(Math.min(22, 2 + (D.fire.count() / 30 | 0)) * D.quality | 0);
  D.boomUpdate(dt);
  fx.update(dt);
  D.loop('crackle', D.fire.count() > 12, Math.min(1, D.fire.count() / 300));

  // Page destruction is worth points too (about 50 per percent).
  const gone = S.prevSolid - L.solidNow; S.prevSolid = L.solidNow;
  if (gone > 0 && S.mode === 'play') { S.cellsScore += gone * 0.05; const whole = Math.floor(S.cellsScore); if (whole) { S.score += whole; S.cellsScore -= whole; } }

  // Camera follows the player, biased down so you see what is below.
  const minY = -160, maxY = Math.max(minY, L.H - S.VH + 60);
  const target = Math.max(minY, Math.min(maxY, P.y - S.VH * 0.58));
  S.camY += (target - S.camY) * Math.min(1, dt * 6);
  S.camX = L.W > S.VW ? Math.max(0, Math.min(L.W - S.VW, P.x - S.VW / 2)) : 0;

  if (S.mode === 'dead') {
    S.deadT += dt;   // dt is already slowed during the death slow-motion
    if (S.deadT > 0.55 && !D.hud.endShown) { D.hud.endShown = true; D.hud.showEnd('dead'); }
  }
  if (S.mode === 'play' && !S.wonShown && D.hud.pct() >= D.WIN_PCT) {
    S.wonShown = true; S.mode = 'won'; D.sfx('win', 1); S.flash = Math.max(S.flash, 0.5); S.flashCol = '#FFD23F'; D.hud.showEnd('win');
  }
}

let last = 0, ema = 0.0167, qT = 0;
function frame(now) {
  const raw = (now - last) / 1000 || 0.0167, real = Math.min(0.033, raw); last = now;
  // Adaptive quality: if frames keep running long, thin out particle counts; recover slowly when fast again.
  ema += (Math.min(raw, 0.1) - ema) * 0.06; qT -= real;
  if (qT <= 0 && S.mode !== 'title') { qT = 0.5; if (ema > 0.024 && D.quality > 0.36) D.quality = Math.max(0.35, D.quality - 0.15); else if (ema < 0.0185 && D.quality < 1) D.quality = Math.min(1, D.quality + 0.05); }
  if (D.testFreeze) { requestAnimationFrame(frame); return; }   // tests step the world by hand
  S.time += real;
  const t0 = performance.now();
  D.screenUpdate(real);
  if (S.mode === 'play' || S.mode === 'dead') {
    if (S.hitstop > 0) S.hitstop -= real;
    else {
      let dt = real;
      if (S.slowT > 0) { S.slowT -= real; dt *= S.slow; if (S.slowT <= 0) S.slow = 1; }
      updateGame(dt);
    }
  } else if (S.mode === 'title') fx.update(real);
  const t1 = performance.now();
  D.render();
  const t2 = performance.now();
  D.hud.update();
  D.perf.upd += t1 - t0; D.perf.ren += t2 - t1; D.perf.n++;
  requestAnimationFrame(frame);
}
D.perf = { upd: 0, ren: 0, n: 0 };   // running totals in ms, for the perf test
D.frame = frame;
// Test hook: advance the simulation by fixed steps regardless of mode, then draw once.
D.debugStep = function (n, dt) {
  const m = S.mode; S.mode = 'play';
  for (let i = 0; i < n; i++) { S.time += dt; D.screenUpdate(dt); if (S.hitstop > 0) S.hitstop -= dt; else updateGame(dt); }
  S.mode = m; D.render(); D.hud.update();
};

/* ---------- input ---------- */
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'down', KeyS: 'down' };
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = KEYMAP[e.code];
  if (k && S.mode !== 'title') e.preventDefault();
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (S.mode !== 'play') return;
  if (k) { if (k === 'jump' && !keys.jump) input.jumpBuf = 0.12; keys[k] = true; }
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') D.tryDash();
  if (e.code === 'KeyG') input.grenadeBuf = 0.2;
  if (e.code === 'KeyR' && !e.repeat) D.newGame(false);
  if (/^Digit[1-9]$/.test(e.code)) D.selectWeapon(+e.code.slice(5) - 1);
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
function releaseAll() { keys.left = keys.right = keys.jump = keys.down = false; input.firing = false; }
addEventListener('blur', releaseAll);

let aimPointerId = null, wheelAcc = 0, wheelAt = 0;
function setPointer(e) { const r = cv.getBoundingClientRect(); pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top; }
cv.addEventListener('pointerdown', e => {
  if (S.mode !== 'play') return;
  e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  setPointer(e); pointer.has = true; D.audio.init();
  if (e.pointerType === 'mouse' && e.button === 2) { input.grenadeBuf = 0.2; return; }
  aimPointerId = e.pointerId; input.firing = true; input.fireBuf = 0.18;
});
cv.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.pointerId === aimPointerId) { setPointer(e); pointer.has = true; } });
const endAim = e => { if (e.pointerId === aimPointerId) { input.firing = false; aimPointerId = null; if (e.pointerType !== 'mouse') pointer.has = false; } };
cv.addEventListener('pointerup', endAim); cv.addEventListener('pointercancel', endAim);
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const t = performance.now(); wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) >= 40 && t - wheelAt > 90) { D.selectWeapon(S.weapon + (wheelAcc > 0 ? 1 : -1)); wheelAcc = 0; wheelAt = t; }
}, { passive: false });

function holdBtn(el, key) {
  if (!el) return;
  const on = e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} D.audio.init(); if (key === 'jump' && !keys.jump) input.jumpBuf = 0.12; keys[key] = true; el.classList.add('down'); };
  const off = () => { keys[key] = false; el.classList.remove('down'); };
  el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
  el.addEventListener('contextmenu', e => e.preventDefault());
}
holdBtn(document.getElementById('bL'), 'left'); holdBtn(document.getElementById('bR'), 'right'); holdBtn(document.getElementById('bJ'), 'jump');
function tapBtn(id, fn) { const el = document.getElementById(id); if (!el) return; el.addEventListener('pointerdown', e => { e.preventDefault(); D.audio.init(); fn(); el.classList.add('down'); }); const off = () => el.classList.remove('down'); el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('contextmenu', e => e.preventDefault()); }
tapBtn('bD', () => D.tryDash()); tapBtn('bG', () => { input.grenadeBuf = 0.2; });

function toggleMute() {
  D.audio.setMuted(!D.audio.muted);
  const b = document.getElementById('mute'); b.textContent = D.audio.muted ? 'Unmute' : 'Mute'; b.setAttribute('aria-pressed', String(D.audio.muted));
}

/* ---------- buttons ---------- */
function bindUI() {
  document.getElementById('mute').addEventListener('click', toggleMute);
  document.getElementById('reset').addEventListener('click', () => { if (S.mode === 'title') return; D.newGame(false); D.hud.toast('Site rebuilt. Full price again.'); });
  document.getElementById('endAgain').addEventListener('click', () => { D.hud.endShown = false; D.newGame(false); });
  document.getElementById('endSites').addEventListener('click', D.openMenu);
  document.getElementById('endShare').addEventListener('click', () => D.hud.share());
  document.getElementById('endKeep').addEventListener('click', () => { document.getElementById('endCard').hidden = true; S.mode = 'play'; });
  const mb = document.getElementById('mute'); mb.textContent = D.audio.muted ? 'Unmute' : 'Mute'; mb.setAttribute('aria-pressed', String(D.audio.muted));
}

/* ---------- boot ---------- */
addEventListener('resize', () => {
  measure();
  if (S.mode === 'title' && L.siteId !== 'imported' && Math.abs(Math.max(360, Math.min(1100, S.VW)) - L.W) > 40) { L.build(S.VW); S.offX = Math.max(0, (S.VW - L.W) / 2); }
});
if (matchMedia) { const mq = matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', readBackdrop); }

async function init() {
  D.gfx.init(cv); D.hud.init(); bindUI(); D.menu.init();
  L.W = 360; measure(); readBackdrop();
  try {
    await Promise.race([
      Promise.all([document.fonts.load('40px "Archivo Black"'), document.fonts.load('12px "Silkscreen"')]),
      new Promise(r => setTimeout(r, 2500)),
    ]);
  } catch (_) {}
  L.build(S.VW); measure();
  D.fire.reset(); D.playerReset(); D.resetWeapons(); D.waves.reset(); S.prevSolid = L.solidNow; S.deadT = 0;
  try { S.best = +localStorage.getItem('dd2-best') || 0; } catch (_) {}
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  document.getElementById('start').focus({ preventScroll: true });
  D.ready = true;
}
init();
})(window.DD);
