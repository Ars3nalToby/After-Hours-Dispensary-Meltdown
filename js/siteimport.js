/* siteimport.js: turns a screenshot (plus optional element boxes from the render server) into a level.
 *
 *   air    = pixels that match the page background (they stay walkable and show the background)
 *   solid  = everything else (text, images, buttons, cards) plus the filled rectangles of reported boxes,
 *            so paragraphs, buttons and images behave as platforms instead of porous glyph dust
 *   site canvas = the solid pixels only; bg canvas = the screenshot with solid pixels painted out, so a
 *            destroyed area shows a clean page background underneath, not a ghost copy of the content.
 * Boxes also pick special blocks: big images become high-HP armour, buttons and iframes (ads) become explosive.
 * Nothing from the target site is ever executed here: the input is a picture and a list of numbers. */
(function (D) {
'use strict';
const S = D.S;
const AIR_THRESHOLD = 30;   // summed per-channel difference below which a pixel counts as background

function hexToRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
const rgbToHex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');

function loadImage(src) {
  return new Promise((ok, fail) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => fail(new Error('Could not read that image.')); im.src = src; });
}

// Most common colour (5-bit buckets), plus shares for each candidate air colour.
function findBackgrounds(px, W, H, hint) {
  const counts = new Uint32Array(32768); let total = 0;
  for (let i = 0; i < px.length; i += 8) { const v = px[i]; counts[((v & 255) >> 3 << 10) | (((v >> 8) & 255) >> 3 << 5) | (((v >> 16) & 255) >> 3)]++; total++; }
  let best = 0; for (let i = 1; i < 32768; i++) if (counts[i] > counts[best]) best = i;
  const mode = [((best >> 10) << 3) | 4, (((best >> 5) & 31) << 3) | 4, ((best & 31) << 3) | 4];
  const air = [mode];
  // Page margins: if the left/right edge strips are mostly one other colour, that is a second background (body behind a centred wrapper).
  for (const x0 of [0, W - Math.max(4, W * 0.02 | 0)]) {
    const sc = new Map(); let n = 0;
    for (let y = 0; y < H; y += 3) for (let x = x0; x < x0 + Math.max(4, W * 0.02 | 0); x += 2) { const v = px[y * W + x], k = (v & 0xf8f8f8) >>> 0; sc.set(k, (sc.get(k) || 0) + 1); n++; }
    let bk = 0, bn = 0; for (const [k, c] of sc) if (c > bn) { bn = c; bk = k; }
    const c = [bk & 255, (bk >> 8) & 255, (bk >> 16) & 255];
    if (bn > n * 0.7 && !air.some(a => Math.abs(a[0] - c[0]) + Math.abs(a[1] - c[1]) + Math.abs(a[2] - c[2]) < AIR_THRESHOLD)) air.push(c);
  }
  const h = hexToRgb(hint);
  if (h && !air.some(a => Math.abs(a[0] - h[0]) + Math.abs(a[1] - h[1]) + Math.abs(a[2] - h[2]) < AIR_THRESHOLD)) air.push(h);   // page's declared background; harmless if unused
  return air.slice(0, 3);
}

// boxes: [{x,y,w,h,k,t}] in screenshot pixels. Returns blocks in level pixels.
function pickBlocks(boxes, sc, W, H) {
  const hard = [], boom = [];
  const R = b => ({ x: b.x * sc, y: b.y * sc, w: b.w * sc, h: b.h * sc, k: b.k, t: b.t });
  const list = boxes.map(R);
  const area = b => b.w * b.h, pageA = W * H;
  const imgs = list.filter(b => (b.k === 'image' || b.k === 'media') && b.t !== 'iframe' && b.t !== 'embed' && b.t !== 'object' && b.w >= 80 && b.h >= 60 && area(b) < 0.35 * pageA).sort((a, b) => area(b) - area(a));
  for (const b of imgs) { if (hard.length >= 60) break; if (!hard.some(o => overlap(o, b) > 0.6 * Math.min(area(o), area(b)))) hard.push(b); }
  const cands = list.filter(b => (b.k === 'button' && b.w >= 50 && b.h >= 22 && b.w <= 420 && b.h <= 130) || ((b.t === 'iframe' || b.t === 'embed') && b.w >= 80 && b.h >= 40 && area(b) < 0.25 * pageA)).sort((a, b) => b.y - a.y);
  for (const b of cands) {
    if (boom.length >= 16) break;
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (hard.some(o => overlap(o, b) > 0) || boom.some(o => Math.hypot(o.x + o.w / 2 - cx, o.y + o.h / 2 - cy) < 150)) continue;
    boom.push(b);
  }
  return { hard, boom };
}
function overlap(a, b) { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); return w > 0 && h > 0 ? w * h : 0; }

/* opts: { image: dataURL or object URL, boxes?: [], bg?: '#rrggbb', name, url } */
D.importScreenshot = async function (opts) {
  const img = await loadImage(opts.image);
  const nw = img.naturalWidth, nh = img.naturalHeight;
  if (nw < 200 || nh < 200) throw new Error('That image is too small to use as a level.');
  const maxH = D.isTouch ? 4200 : 5600;
  let sc = Math.min(2, Math.max(360, Math.min(1100, S.VW)) / nw);
  let W = Math.round(nw * sc), H = Math.round(nh * sc);
  if (H > maxH) H = maxH;
  const full = document.createElement('canvas'); full.width = W; full.height = H;
  const g = full.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, W, H);
  const data = g.getImageData(0, 0, W, H), px = new Uint32Array(data.data.buffer), n = W * H;
  await new Promise(r => setTimeout(r, 0));   // let the loading message paint

  const air = findBackgrounds(px, W, H, opts.bg), a0 = air[0], a1 = air[1] || air[0], a2 = air[2] || air[0];
  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const v = px[i], r = v & 255, gg = (v >> 8) & 255, b = (v >> 16) & 255;
    if ((Math.abs(r - a0[0]) + Math.abs(gg - a0[1]) + Math.abs(b - a0[2]) >= AIR_THRESHOLD) &&
        (Math.abs(r - a1[0]) + Math.abs(gg - a1[1]) + Math.abs(b - a1[2]) >= AIR_THRESHOLD) &&
        (Math.abs(r - a2[0]) + Math.abs(gg - a2[1]) + Math.abs(b - a2[2]) >= AIR_THRESHOLD)) solid[i] = 1;
  }
  // Reported boxes become filled platforms (skip anything that would swallow most of the page).
  const boxes = Array.isArray(opts.boxes) ? opts.boxes : [];
  for (const b of boxes) {
    if (b.w * b.h > 0.6 * nw * nh) continue;
    const x0 = Math.max(0, Math.floor(b.x * sc)), x1 = Math.min(W, Math.ceil((b.x + b.w) * sc)), y0 = Math.max(0, Math.floor(b.y * sc)), y1 = Math.min(H, Math.ceil((b.y + b.h) * sc));
    for (let y = y0; y < y1; y++) solid.fill(1, y * W + x0, y * W + x1);
  }

  // Compose the two layers. The bg layer paints solid pixels (and a 1px halo, to hide anti-aliasing ghosts) with the page background.
  const site = document.createElement('canvas'); site.width = W; site.height = H;
  const bgc = document.createElement('canvas'); bgc.width = W; bgc.height = H;
  const sOut = new ImageData(W, H), bOut = new ImageData(W, H), s32 = new Uint32Array(sOut.data.buffer), b32 = new Uint32Array(bOut.data.buffer);
  const fillCol = (0xff000000 | (a0[2] << 16) | (a0[1] << 8) | a0[0]) >>> 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (solid[i]) { s32[i] = (px[i] | 0xff000000) >>> 0; b32[i] = fillCol; }
    else {
      const halo = (x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < H - 1 && solid[i + W]);
      b32[i] = halo ? fillCol : (px[i] | 0xff000000) >>> 0;
    }
  }
  site.getContext('2d').putImageData(sOut, 0, 0); bgc.getContext('2d').putImageData(bOut, 0, 0);

  // Special blocks from the boxes.
  const { hard, boom } = pickBlocks(boxes.filter(b => b.w * b.h <= 0.6 * nw * nh), sc, W, H);
  const sg = site.getContext('2d');
  for (const b of boom) D.drawHazard(sg, b.x, b.y, b.w, b.h);
  const blocks = hard.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, type: 'hard' })).concat(boom.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, type: 'explosive' })));
  return { canvas: site, barrels: [], opts: { bgCanvas: bgc, bgColor: rgbToHex(a0), blocks: blocks, name: opts.name || 'this site', url: opts.url || '' }, stats: { W, H, hard: hard.length, explosive: boom.length } };
};
})(window.DD);
