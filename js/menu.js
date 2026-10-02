/* menu.js: the site picker on the title card. Built-in levels, "wreck a real website" (render server) and screenshot upload. */
(function (D) {
'use strict';
const S = D.S, L = D.L;
const $ = id => document.getElementById(id);
const M = D.menu = { selected: 'megasave', busy: false, serverOk: false, abort: null };
let el = {};

function msg(text, kind) { el.msg.textContent = text || ''; el.msg.className = 'msg' + (kind ? ' ' + kind : ''); }
function setBusy(b, text) {
  M.busy = b;
  for (const n of [el.urlInput, el.urlGo, el.start, el.shot]) n.disabled = b || (n === el.urlInput || n === el.urlGo ? !M.serverOk : false);
  el.sites.classList.toggle('busy', b); el.cancel.hidden = !b;
  if (b) msg(text, 'load'); 
}
function renderTiles() {
  el.sites.innerHTML = '';
  for (const s of D.SITES) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'site'; b.setAttribute('role', 'radio'); b.dataset.id = s.id;
    b.innerHTML = '<b></b><span></span>'; b.firstChild.textContent = s.name; b.lastChild.textContent = s.desc;
    b.addEventListener('click', () => select(s.id));
    el.sites.appendChild(b);
  }
  select(M.selected);
}
function select(id) {
  M.selected = id;
  for (const b of el.sites.children) b.setAttribute('aria-checked', String(b.dataset.id === id));
}

// Begin play on a built-in site.
D.startSite = function (id) {
  L.build(S.VW, id); S.offX = Math.max(0, (S.VW - L.W) / 2);
  begin();
};
D.startImported = function (lvl) {
  L.fromCanvas(lvl.canvas, lvl.barrels, lvl.opts); L.siteId = 'imported'; S.offX = Math.max(0, (S.VW - L.W) / 2);
  begin();
};
function begin() {
  $('intro').hidden = true; D.audio.init(); D.newGame(false); D.sfx('wave', 0.6); msg('');
}
D.openMenu = function () {
  if (M.busy) return;
  S.mode = 'title'; S.slow = 1; S.hitstop = 0; D.input.firing = false;
  D.keys.left = D.keys.right = D.keys.jump = D.keys.down = false;
  for (const l of ['mini', 'flame', 'hole', 'crackle']) D.loop(l, false);
  $('endCard').hidden = true; $('intro').hidden = false; el.start.focus({ preventScroll: true });
};

function friendly(code, text) {
  if (text) return text;
  return code === 'rate_limited' ? 'Too many requests. Wait a moment.' : 'Something went wrong.';
}
async function wreckUrl(raw) {
  if (M.busy) return;
  raw = (raw || '').trim();
  if (!raw) { msg('Paste a web address first.', 'err'); el.urlInput.focus(); return; }
  setBusy(true, 'Rendering the site. This can take up to 30 seconds.');
  M.abort = new AbortController(); const timer = setTimeout(() => M.abort.abort(), 50000);
  try {
    let r;
    try { r = await fetch('/api/render', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: raw }), signal: M.abort.signal }); }
    catch (e) { throw new Error(e && e.name === 'AbortError' ? 'Cancelled or timed out.' : 'Could not reach the render server. Try a built-in site or upload a screenshot.'); }
    let j = null; try { j = await r.json(); } catch (_) {}
    if (!r.ok || !j || !j.ok) {
      const ra = r.headers.get('retry-after');
      throw new Error(friendly(j && j.error, (j && j.message) || ('The server answered with an error (' + r.status + ').')) + (r.status === 503 && ra ? '' : ''));
    }
    msg('Building the level…', 'load');
    const lvl = await D.importScreenshot({ image: j.image, boxes: j.boxes, bg: j.bg, name: j.host || 'this site', url: (j.url || '').replace(/^https?:\/\//, '').slice(0, 80) });
    setBusy(false); D.startImported(lvl);
    if (j.truncated) D.hud.toast('Long page: only the top part is in the level.');
  } catch (e) { setBusy(false); msg(e.message || 'Could not load that site.', 'err'); }
  finally { clearTimeout(timer); M.abort = null; }
}
async function wreckFile(file) {
  if (M.busy || !file) return;
  if (!/^image\//.test(file.type)) { msg('Pick an image file (PNG, JPEG or WebP).', 'err'); return; }
  if (file.size > 15 * 1024 * 1024) { msg('That image is over 15 MB. Try a smaller one.', 'err'); return; }
  setBusy(true, 'Building the level…');
  const url = URL.createObjectURL(file);
  try {
    const lvl = await D.importScreenshot({ image: url, name: (file.name || 'screenshot').replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'screenshot', url: '' });
    setBusy(false); D.startImported(lvl);
  } catch (e) { setBusy(false); msg(e.message || 'Could not read that image.', 'err'); }
  finally { URL.revokeObjectURL(url); el.shotInput.value = ''; }
}

M.init = function () {
  for (const id of ['sites', 'start', 'urlForm', 'urlInput', 'urlGo', 'shotInput', 'shot', 'siteMsg', 'cancel', 'changeSite']) el[id] = $(id);
  el.msg = el.siteMsg;
  renderTiles();
  el.urlForm.addEventListener('submit', e => { e.preventDefault(); wreckUrl(el.urlInput.value); });
  el.shotInput.addEventListener('change', () => wreckFile(el.shotInput.files[0]));
  el.shot.addEventListener('click', () => el.shotInput.click());
  el.cancel.addEventListener('click', () => { if (M.abort) M.abort.abort(); });
  el.start.addEventListener('click', () => { if (!M.busy) D.startSite(M.selected); });
  el.changeSite.addEventListener('click', D.openMenu);
  // Drag a screenshot onto the card.
  addEventListener('dragover', e => { if ($('intro').hidden) return; e.preventDefault(); });
  addEventListener('drop', e => { if ($('intro').hidden) return; e.preventDefault(); const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) wreckFile(f); });
  // Is the render server there? (Not on file:// or plain static hosting.)
  M.serverOk = false; el.urlInput.disabled = el.urlGo.disabled = true;
  if (location.protocol !== 'file:') {
    fetch('/api/health').then(r => r.ok ? r.json() : null).then(j => {
      M.serverOk = !!(j && j.ok); if (!M.busy) el.urlInput.disabled = el.urlGo.disabled = !M.serverOk;
      el.urlForm.classList.toggle('off', !M.serverOk);
      if (!M.serverOk) el.urlInput.placeholder = 'Server needed';
    }).catch(() => { el.urlForm.classList.add('off'); el.urlInput.placeholder = 'Server needed'; });
  } else { el.urlForm.classList.add('off'); el.urlInput.placeholder = 'Server needed'; }
};
})(window.DD);
