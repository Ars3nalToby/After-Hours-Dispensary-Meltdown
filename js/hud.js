/* hud.js: DOM heads-up display, banners, toasts and the end cards. Values are only written when they change. */
(function (D) {
'use strict';
const S = D.S, P = D.P, L = D.L;
const $ = id => document.getElementById(id);
const MILESTONES = [
  [10, 'Ten percent gone. Still overpriced.'],
  [25, 'Everything must go!'],
  [50, 'Half the site is gone. Head office is calling.'],
  [75, 'Stocktake cancelled.'],
];
let el = {}, wbtns = [], lastPct = -1, milestoneIdx = 0, toastTimer = 0, bannerTimer = 0, comboTimer = 0, hurtTimer = 0, isDirty = true;
const cache = {};
function setText(key, node, v) { if (cache[key] !== v) { cache[key] = v; node.textContent = v; } }
function setW(key, node, frac) { const v = Math.round(frac * 100) / 100; if (cache[key] !== v) { cache[key] = v; node.style.transform = 'scaleX(' + v + ')'; } }

const H = D.hud = {};
H.init = function () {
  for (const id of ['tag', 'pct', 'score', 'kills', 'hpFill', 'hpNum', 'dashFill', 'waveTxt', 'combo', 'weapons', 'toast', 'banner', 'bannerT', 'bannerSub', 'dmg', 'mute', 'reset', 'gren', 'endCard', 'endTitle', 'endLine', 'endStats', 'endAgain', 'endShare', 'endKeep', 'intro', 'start', 'grenBar']) el[id] = $(id);
  D.WEAPONS.forEach((w, i) => {
    const b = document.createElement('button'); b.className = 'wbtn'; b.type = 'button';
    b.innerHTML = '<span class="k">' + (i + 1) + '</span>' + w.name + '<i class="cd"></i>';
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => D.selectWeapon(i));
    el.weapons.appendChild(b); wbtns.push({ btn: b, cd: b.lastChild });
  });
};
H.dirty = () => { isDirty = true; };
H.reset = function () {
  lastPct = -1; milestoneIdx = 0; isDirty = true; H.endShown = false; for (const k in cache) delete cache[k];
  el.endCard.hidden = true; el.banner.classList.remove('show'); el.toast.classList.remove('show');
  H.weapon();
};
H.weapon = function () { wbtns.forEach((w, i) => { w.btn.setAttribute('aria-pressed', String(i === S.weapon)); }); const b = wbtns[S.weapon]; if (b && b.btn.scrollIntoView) { try { b.btn.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) {} } };
H.toast = function (msg) {
  el.toast.textContent = msg; el.toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2000);
};
H.banner = function (t, sub) {
  el.bannerT.textContent = t; el.bannerSub.textContent = sub || ''; el.banner.classList.remove('show'); void el.banner.offsetWidth; el.banner.classList.add('show');
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.banner.classList.remove('show'), 2300);
};
H.hurt = function () {
  el.dmg.classList.remove('on'); void el.dmg.offsetWidth; el.dmg.classList.add('on');
};
H.comboBump = function () {
  el.combo.classList.remove('bump'); void el.combo.offsetWidth; el.combo.classList.add('bump');
};
H.pct = function () { return Math.max(0, Math.min(100, Math.floor((1 - L.solidNow / L.solidTotal) * 100))); };

H.update = function () {
  const pct = H.pct();
  if (pct !== lastPct) {
    setText('pct', el.pct, pct + '%');
    if (pct > lastPct && lastPct >= 0) { el.tag.classList.remove('bump'); void el.tag.offsetWidth; el.tag.classList.add('bump'); }
    lastPct = pct;
    while (milestoneIdx < MILESTONES.length && pct >= MILESTONES[milestoneIdx][0]) { if (S.mode === 'play') H.toast(MILESTONES[milestoneIdx][1]); milestoneIdx++; }
  }
  setText('score', el.score, Math.floor(S.score).toLocaleString('en-US'));
  setText('kills', el.kills, S.kills + (S.kills === 1 ? ' kill' : ' kills'));
  setW('hp', el.hpFill, P.hp / P.maxHp);
  if (cache.hpLow !== (P.hp < 30)) { cache.hpLow = P.hp < 30; el.hpFill.parentNode.classList.toggle('low', cache.hpLow); }
  setText('hpNum', el.hpNum, String(Math.ceil(P.hp)));
  setW('dash', el.dashFill, 1 - Math.max(0, P.dashCd) / 0.95);
  const wv = D.waves;
  setText('wave', el.waveTxt, wv.state === 'break' && wv.n === 0 ? 'Get ready' : wv.state === 'break' ? 'Wave ' + wv.n + ' cleared' : 'Wave ' + wv.n + '  ·  ' + wv.left + ' left');
  if (S.mult > 1) { setText('combo', el.combo, 'x' + S.mult + ' combo'); if (!cache.comboOn) { cache.comboOn = true; el.combo.classList.add('on'); } el.combo.style.setProperty('--t', Math.max(0, S.comboT / 2.8).toFixed(2)); }
  else if (cache.comboOn) { cache.comboOn = false; el.combo.classList.remove('on'); }
  for (let i = 0; i < wbtns.length; i++) {
    const frac = Math.max(0, D.cdT[i]) / D.WEAPONS[i].cd, v = Math.round(frac * 50) / 50;
    if (cache['cd' + i] !== v) { cache['cd' + i] = v; wbtns[i].cd.style.transform = 'scaleX(' + v + ')'; }
  }
  const gv = Math.round(D.grenadeCd() * 50) / 50; if (cache.gren !== gv) { cache.gren = gv; if (el.grenBar) el.grenBar.style.transform = 'scaleX(' + gv + ')'; }
};

/* ---------- end cards ---------- */
H.shareText = function () {
  return 'I destroyed ' + H.pct() + '% of MegaSave and killed ' + S.kills + ' zombies in Discount Demolition 2. Score ' + Math.floor(S.score).toLocaleString('en-US') + '. Beat it: ' + location.href.split('#')[0];
};
H.share = function () {
  const txt = H.shareText();
  const done = () => H.toast('Score copied. Paste it anywhere.');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, () => fallback());
  else fallback();
  function fallback() {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (_) { H.toast('Copy failed. Select the score text by hand.'); } ta.remove();
  }
};
H.showEnd = function (kind) {
  const win = kind === 'win', pct = H.pct();
  let best = S.best; try { best = Math.max(S.best, +localStorage.getItem('dd2-best') || 0); } catch (_) {}
  const isBest = S.score > best; if (isBest) { best = Math.floor(S.score); try { localStorage.setItem('dd2-best', String(best)); } catch (_) {} } S.best = best;
  el.endTitle.textContent = win ? 'Website destroyed' : 'You got eaten';
  el.endLine.textContent = win ? 'MegaSave is ' + pct + '% rubble. Head office has stopped answering.' : 'The zombies took your lunch and your jetpack. MegaSave is ' + pct + '% destroyed.';
  el.endStats.innerHTML = '';
  const rows = [['Score', Math.floor(S.score).toLocaleString('en-US') + (isBest ? ' (new best)' : '')], ['Destroyed', pct + '%'], ['Zombies', String(S.kills)], ['Wave', String(S.wave)], ['Best score', best.toLocaleString('en-US')]];
  for (const r of rows) { const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.firstChild.textContent = r[0]; d.lastChild.textContent = r[1]; el.endStats.appendChild(d); }
  el.endKeep.hidden = !win;
  el.endCard.classList.toggle('win', win); el.endCard.hidden = false; el.endAgain.focus({ preventScroll: true });
};
})(window.DD);
