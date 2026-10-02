'use strict';
/* extract.js: runs inside the rendered page (read-only DOM queries) and reports where things are.
 * The page's own scripts could lie, so sanitize() re-validates every field on the server before it
 * is sent to a player. Kinds: text, image, media, button, input, block. */

// Serialised and evaluated in the page. Must be self-contained.
function inPage() {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'HEAD', 'TEMPLATE', 'OPTION', 'PATH', 'G', 'USE', 'DEFS', 'BR', 'HR', 'TITLE', 'BASE', 'AREA', 'MAP', 'SOURCE', 'TRACK']);
  const body = document.body;
  if (!body) return { boxes: [], docW: innerWidth, docH: innerHeight, bodyBg: '', htmlBg: '', title: '' };
  const docH = Math.max(document.documentElement.scrollHeight, body.scrollHeight, 1);
  const docW = innerWidth;
  const alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; const p = m[1].split(',').map(parseFloat); return p.length > 3 ? p[3] : 1; };
  const bodyBg = getComputedStyle(body).backgroundColor, htmlBg = getComputedStyle(document.documentElement).backgroundColor;
  const boxes = [], range = document.createRange();
  let seen = 0;
  const els = body.getElementsByTagName('*');
  for (let i = 0; i < els.length && seen < 9000; i++) {
    const el = els[i]; seen++;
    if (SKIP.has(el.tagName.toUpperCase())) continue;
    const tag = el.tagName.toLowerCase(), cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.05 || r.width < 4 || r.height < 4 || r.right <= 0 || r.left >= docW || r.bottom + scrollY <= 0) continue;
    let k = null, x = r.left + scrollX, y = r.top + scrollY, w = r.width, h = r.height;
    const bg = alpha(cs.backgroundColor) > 0.5;
    if (tag === 'img' || tag === 'picture' || tag === 'canvas' || (tag === 'svg' && w >= 24 && h >= 24)) k = 'image';
    else if (tag === 'video' || tag === 'iframe' || tag === 'embed' || tag === 'object') k = 'media';
    else if (tag === 'button' || el.getAttribute('role') === 'button' || (tag === 'input' && /^(submit|button|reset)$/i.test(el.type)) || (tag === 'a' && bg && w >= 40 && h >= 20 && h <= 120)) k = 'button';
    else if (tag === 'input' || tag === 'select' || tag === 'textarea') k = 'input';
    else if (cs.backgroundImage !== 'none' && w >= 60 && h >= 40 && w * h < 0.8 * docW * docH) k = 'image';
    else if (bg && w >= 80 && h >= 40 && w * h < 0.55 * docW * docH && cs.backgroundColor !== getComputedStyle(body).backgroundColor) k = 'block';
    else {
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const c of el.childNodes) {
        if (c.nodeType !== 3 || !c.textContent.trim()) continue;
        range.selectNodeContents(c);
        for (const q of range.getClientRects()) { if (q.width < 2 || q.height < 4) continue; x0 = Math.min(x0, q.left); y0 = Math.min(y0, q.top); x1 = Math.max(x1, q.right); y1 = Math.max(y1, q.bottom); }
      }
      if (x1 > x0 && y1 > y0 && y1 - y0 >= 6) { k = 'text'; x = x0 + scrollX; y = y0 + scrollY; w = x1 - x0; h = y1 - y0; }
    }
    if (k) boxes.push({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), k: k, t: tag });
  }
  return { boxes, docW, docH, bodyBg, htmlBg, title: (document.title || '').slice(0, 200) };
}

const KINDS = new Set(['text', 'image', 'media', 'button', 'input', 'block']);
const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : null;
const cssColor = s => { const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(String(s || '')); return (m && (m[4] === undefined || +m[4] > 0.5)) ? '#' + [m[1], m[2], m[3]].map(v => Math.min(255, +v).toString(16).padStart(2, '0')).join('') : null; };

// Clamp everything to the screenshot and strip anything unexpected.
function sanitize(raw, width, height, maxBoxes = 1600) {
  const out = { boxes: [], bg: null, title: '' };
  if (!raw || typeof raw !== 'object') return out;
  out.bg = cssColor(raw.bodyBg) || cssColor(raw.htmlBg);
  out.title = String(raw.title || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').trim().slice(0, 120);
  const list = Array.isArray(raw.boxes) ? raw.boxes.slice(0, 6000) : [];
  for (const b of list) {
    if (!b || typeof b !== 'object' || !KINDS.has(b.k)) continue;
    let x = num(b.x, -1e5, 1e5), y = num(b.y, -1e5, 1e5), w = num(b.w, 0, 1e5), h = num(b.h, 0, 1e5);
    if (x === null || y === null || w === null || h === null) continue;
    const x1 = Math.min(width, x + w), y1 = Math.min(height, y + h); x = Math.max(0, x); y = Math.max(0, y);
    if (x1 - x < 4 || y1 - y < 4) continue;
    out.boxes.push({ x: Math.round(x), y: Math.round(y), w: Math.round(x1 - x), h: Math.round(y1 - y), k: b.k, t: /^[a-z0-9]{1,12}$/.test(b.t) ? b.t : '' });
  }
  if (out.boxes.length > maxBoxes) {   // keep the biggest, they matter most for platforms
    out.boxes.sort((a, b) => b.w * b.h - a.w * a.h); out.boxes.length = maxBoxes;
    out.boxes.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  return out;
}
module.exports = { inPage, sanitize, cssColor };
