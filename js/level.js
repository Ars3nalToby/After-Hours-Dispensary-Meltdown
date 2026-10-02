/* level.js: the destructible page.
 *   site  - canvas with the page content (transparent where destroyed)
 *   bg    - opaque paper canvas underneath; scorch marks and soot stay painted here
 *   grid  - 1 byte per CELLxCELL block: 1 = solid. All collision uses this grid.
 *   pix   - the ORIGINAL page pixels (never modified), so debris keeps true colours
 *           without any getImageData calls at explosion time.
 * Transparent (air) areas of the page are walkable, only content is solid. */
(function (D) {
'use strict';
const CELL = D.CELL, FC = D.FC, TAU = D.TAU;
const L = D.L = {
  W: 0, H: 0, GW: 0, GH: 0, FW: 0, FH: 0, grid: null, pix: null, site: null, bg: null,
  solidTotal: 1, solidNow: 1, barrels: [], hard: [], name: '', url: '', siteId: 'megasave', flam: null, barGrid: null, src: null, srcBarrels: null,
};
let sctx = null, bctx = null, grid = null, pix = null, W = 0, H = 0, GW = 0, GH = 0, blkMap = null;

/* ---------- building ---------- */
L.build = function (vw, siteId) {
  const site = D.siteById(siteId || L.siteId || 'megasave'), w = Math.max(360, Math.min(1100, vw));
  const tmp = document.createElement('canvas'); tmp.width = w; tmp.height = 7000;
  const barrels = [], blocks = [];
  const reg = {
    barrel(x, y, bw, bh) { barrels.push({ x: x, y: y, w: bw, h: bh }); },
    explosive(x, y, bw, bh) { blocks.push({ x: x, y: y, w: bw, h: bh, type: 'explosive' }); },
    hard(x, y, bw, bh) { blocks.push({ x: x, y: y, w: bw, h: bh, type: 'hard' }); },
  };
  const h = Math.ceil(site.build(tmp.getContext('2d'), w, reg));
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  src.getContext('2d').drawImage(tmp, 0, 0);
  L.siteId = site.id;
  L.fromCanvas(src, barrels, { blocks: blocks, bgColor: site.bg, name: site.name, url: site.url || 'megasave-chemist.example/sale' });
};

// Builds a playable level from any canvas (built-in art now, screenshots in Phase 2).
L.fromCanvas = function (src, barrels, opts) {
  opts = opts || {};
  L.src = src; L.srcBarrels = barrels || []; L.srcOpts = opts;
  L.name = opts.name || 'this site'; L.url = opts.url || '';
  W = L.W = src.width; H = L.H = src.height;
  L.site = document.createElement('canvas'); L.site.width = W; L.site.height = H;
  sctx = L.site.getContext('2d');   // stays GPU-backed: we draw and erase on it every frame, but never read it back
  sctx.drawImage(src, 0, 0);
  L.bg = document.createElement('canvas'); L.bg.width = W; L.bg.height = H;
  bctx = L.bg.getContext('2d');
  if (opts.bgCanvas) bctx.drawImage(opts.bgCanvas, 0, 0, W, H); else { bctx.fillStyle = opts.bgColor || D.C.paper; bctx.fillRect(0, 0, W, H); }

  const rc = document.createElement('canvas'); rc.width = W; rc.height = H;   // one-off readback copy for the original pixels
  const rg = rc.getContext('2d', { willReadFrequently: true }); rg.drawImage(src, 0, 0);
  const img = rg.getImageData(0, 0, W, H);
  pix = L.pix = new Uint32Array(img.data.buffer);
  GW = L.GW = Math.ceil(W / CELL); GH = L.GH = Math.ceil(H / CELL);
  grid = L.grid = new Uint8Array(GW * GH);
  for (let y = 0; y < H; y++) {
    const gy = ((y / CELL) | 0) * GW, row = y * W;
    for (let x = 0; x < W; x++) if ((pix[row + x] >>> 24) > 60) grid[gy + ((x / CELL) | 0)] = 1;
  }
  let n = 0; for (let i = 0; i < grid.length; i++) n += grid[i];
  L.solidTotal = Math.max(1, n); L.solidNow = n;

  // Flammability per fire cell from the original colour: ink and text burn well, white card stock less, saturated fills in between.
  const FW = L.FW = Math.ceil(W / FC), FH = L.FH = Math.ceil(H / FC);
  const flam = L.flam = new Uint8Array(FW * FH);
  for (let fy = 0; fy < FH; fy++) for (let fx = 0; fx < FW; fx++) {
    let cnt = 0, r = 0, g = 0, b = 0;
    for (let y = fy * FC; y < Math.min(H, fy * FC + FC); y++) for (let x = fx * FC; x < Math.min(W, fx * FC + FC); x++) {
      const v = pix[y * W + x]; if ((v >>> 24) > 60) { cnt++; r += v & 255; g += (v >> 8) & 255; b += (v >> 16) & 255; }
    }
    if (!cnt) continue;
    r /= cnt; g /= cnt; b /= cnt;
    const lum = 0.3 * r + 0.59 * g + 0.11 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
    flam[fy * FW + fx] = lum < 80 ? 235 : sat > 90 ? 125 : lum > 215 ? 95 : 150;
  }

  L.barrels = (barrels || []).map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2, hp: 34, alive: true, r: 72, rect: false }));
  // Special blocks. Explosive ones behave like drums (any size, blast radius from size); hard ones soak up damage, then shatter.
  L.hard = []; blkMap = new Uint16Array(GW * GH);
  for (const bl of (opts.blocks || [])) {
    const x = Math.max(0, Math.floor(bl.x)), y = Math.max(0, Math.floor(bl.y)), w = Math.min(W - x, Math.floor(bl.w)), h = Math.min(H - y, Math.floor(bl.h));
    if (w < 8 || h < 8) continue;
    if (bl.type === 'explosive') {
      L.barrels.push({ x: x, y: y, w: w, h: h, cx: x + w / 2, cy: y + h / 2, hp: 34, alive: true, r: Math.max(55, Math.min(105, Math.min(w, h) * 0.6 + 20)), rect: true });
    } else if (L.hard.length < 250) {
      const hp = Math.max(70, Math.min(420, Math.sqrt(w * h) * 1.3)), id = L.hard.length + 1;
      L.hard.push({ id: id, x: x, y: y, w: w, h: h, hp: hp, max: hp, alive: true, q: 0 });
      for (let gy = Math.floor(y / CELL); gy <= Math.floor((y + h - 1) / CELL); gy++) for (let gx = Math.floor(x / CELL); gx <= Math.floor((x + w - 1) / CELL); gx++)
        if (grid[gy * GW + gx] && !blkMap[gy * GW + gx]) blkMap[gy * GW + gx] = id;
      for (let fy = Math.floor(y / FC); fy <= Math.floor((y + h - 1) / FC); fy++) for (let fx = Math.floor(x / FC); fx <= Math.floor((x + w - 1) / FC); fx++) flam[fy * FW + fx] = 0;   // armour does not burn
    }
  }
  L.barGrid = new Uint8Array(FW * FH);
  L.barrels.forEach((b, i) => {
    for (let fy = Math.floor(b.y / FC); fy <= Math.floor((b.y + b.h) / FC); fy++) for (let fx = Math.floor(b.x / FC); fx <= Math.floor((b.x + b.w) / FC); fx++)
      if (fx >= 0 && fy >= 0 && fx < FW && fy < FH && i < 255) L.barGrid[fy * FW + fx] = i + 1;
  });
  for (const c of chunkPool) c.used = false;
};
L.reset = function () { L.fromCanvas(L.src, L.srcBarrels, L.srcOpts); };

/* ---------- collision ---------- */
function solidCell(gx, gy) {
  if (gx < 0 || gx >= GW || gy >= GH) return 1;   // world sides and floor are walls
  if (gy < 0) return 0;
  return grid[gy * GW + gx];
}
function solidPx(x, y) { return solidCell(Math.floor(x / CELL), Math.floor(y / CELL)); }
function hitsRect(l, t, r, b) {
  const gx0 = Math.floor(l / CELL), gx1 = Math.floor((r - 0.001) / CELL), gy0 = Math.floor(t / CELL), gy1 = Math.floor((b - 0.001) / CELL);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) if (solidCell(gx, gy)) return true;
  return false;
}
L.solidCell = solidCell; L.solidPx = solidPx; L.hitsRect = hitsRect;
// Entities stand with their feet at (x, y): box is [x-w/2, x+w/2] by [y-h, y].
L.entHits = (e, x, y) => hitsRect(x - e.w / 2, y - e.h, x + e.w / 2, y);

// Move 1px at a time. On a blocked step while grounded, try to climb up to e.stepH px (stairs and rubble).
L.moveX = function (e, dx) {
  const s = Math.sign(dx); let rem = Math.abs(dx), blocked = false;
  while (rem > 0) {
    const st = Math.min(1, rem), nx = e.x + s * st;
    if (!L.entHits(e, nx, e.y)) e.x = nx;
    else {
      let up = 1, ok = false;
      if (e.onGround) for (; up <= e.stepH; up++) if (!L.entHits(e, nx, e.y - up)) { ok = true; break; }
      if (ok) { e.x = nx; e.y -= up; } else { e.vx = 0; blocked = true; break; }
    }
    rem -= st;
  }
  return blocked;
};
// Returns the downward speed on landing (0 if not landing).
L.moveY = function (e, dy) {
  e.onGround = false;
  const s = Math.sign(dy); let rem = Math.abs(dy), hit = 0;
  while (rem > 0) {
    const st = Math.min(1, rem), ny = e.y + s * st;
    if (!L.entHits(e, e.x, ny)) e.y = ny;
    else { if (s > 0) { e.onGround = true; hit = e.vy; } e.vy = 0; break; }
    rem -= st;
  }
  return hit;
};
// Standing floor search used for spawns: y of the floor surface nearest to nearY in column x, or -1.
L.findFloor = function (x, nearY, headroom) {
  const gx = Math.floor(x / CELL); let best = -1, bd = 1e9;
  const need = Math.ceil(headroom / CELL);
  for (let gy = 0; gy < GH - 1; gy++) {
    if (solidCell(gx, gy) && !solidCell(gx, gy - 1)) {
      let free = true; for (let k = 1; k <= need; k++) if (solidCell(gx, gy - k)) { free = false; break; }
      if (free) { const fy = gy * CELL, d = Math.abs(fy - nearY); if (d < bd) { bd = d; best = fy; } }
    }
  }
  return best;
};

/* ---------- destruction ---------- */
// Removes page pixels in a circle. Returns the number of grid cells cleared.
// Hard blocks inside the circle are not cleared; they take (r * power) damage instead and shatter when it runs out.
L.carve = function (x, y, r, power) {
  let near = null;
  const hards = L.hard;
  for (let i = 0; i < hards.length; i++) {
    const b = hards[i]; if (!b.alive || x + r < b.x || x - r > b.x + b.w || y + r < b.y || y - r > b.y + b.h) continue;
    const nx = x < b.x ? b.x : x > b.x + b.w ? b.x + b.w : x, ny = y < b.y ? b.y : y > b.y + b.h ? b.y + b.h : y;
    if ((nx - x) * (nx - x) + (ny - y) * (ny - y) <= r * r) (near || (near = [])).push(b);
  }
  if (near) { sctx.save(); sctx.beginPath(); sctx.rect(0, 0, W, H); for (const b of near) sctx.rect(b.x, b.y, b.w, b.h); sctx.clip('evenodd'); }   // keep armour pixels on the canvas
  sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = '#000';
  sctx.beginPath(); sctx.arc(x, y, r, 0, TAU); sctx.fill();
  sctx.globalCompositeOperation = 'source-over';
  if (near) sctx.restore();
  const gx0 = Math.max(0, Math.floor((x - r) / CELL)), gx1 = Math.min(GW - 1, Math.floor((x + r) / CELL));
  const gy0 = Math.max(0, Math.floor((y - r) / CELL)), gy1 = Math.min(GH - 1, Math.floor((y + r) / CELL));
  const r2 = (r + 1) * (r + 1); let n = 0;
  for (let gy = gy0; gy <= gy1; gy++) {
    const cy = gy * CELL + CELL / 2 - y, row = gy * GW;
    for (let gx = gx0; gx <= gx1; gx++) {
      const cx = gx * CELL + CELL / 2 - x;
      if (cx * cx + cy * cy <= r2 && grid[row + gx] && !(near && blkMap[row + gx])) { grid[row + gx] = 0; n++; }
    }
  }
  L.solidNow -= n;
  if (near) for (const b of near) {
    b.hp -= r * (power || 1);
    if (b.hp <= 0) L.breakBlock(b); else if (D.onBlockHit) D.onBlockHit(b, x, y);
  }
  return n;
};
// Shatter a hard block: effects first (while its pixels still exist), then remove it.
L.breakBlock = function (b) {
  if (!b.alive) return;
  if (D.onBlockBreak) D.onBlockBreak(b);
  b.alive = false;
  let n = 0;
  for (let gy = Math.floor(b.y / CELL); gy <= Math.floor((b.y + b.h - 1) / CELL); gy++) for (let gx = Math.floor(b.x / CELL); gx <= Math.floor((b.x + b.w - 1) / CELL); gx++) {
    const i = gy * GW + gx; if (blkMap[i] === b.id) { blkMap[i] = 0; if (grid[i]) { grid[i] = 0; n++; } }
  }
  L.solidNow -= n;
  sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = '#000'; sctx.fillRect(b.x, b.y, b.w, b.h); sctx.globalCompositeOperation = 'source-over';
  scorchRect(b);
};
function scorchRect(b) { bctx.fillStyle = 'rgba(45,32,28,0.1)'; bctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4); }
// Dark cracks fanning out from an impact, clipped to the block, drawn on the surviving pixels.
L.crack = function (b, x, y) {
  sctx.save(); sctx.beginPath(); sctx.rect(b.x, b.y, b.w, b.h); sctx.clip(); sctx.globalCompositeOperation = 'source-atop';
  sctx.strokeStyle = 'rgba(20,12,14,0.8)'; sctx.lineWidth = 1.6; sctx.lineJoin = 'round';
  const cx = Math.max(b.x, Math.min(b.x + b.w, x)), cy = Math.max(b.y, Math.min(b.y + b.h, y));
  for (let i = 0; i < 4; i++) {
    let a = Math.random() * TAU, px = cx, py = cy; sctx.beginPath(); sctx.moveTo(px, py);
    for (let s = 0; s < 6; s++) { a += (Math.random() - 0.5) * 1.1; const l = 6 + Math.random() * 12; px += Math.cos(a) * l; py += Math.sin(a) * l; sctx.lineTo(px, py); }
    sctx.stroke();
  }
  sctx.restore();
};
// Clear a whole rectangle (explosive blocks go up as a unit).
L.carveRect = function (x, y, w, h) {
  sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = '#000'; sctx.fillRect(x, y, w, h); sctx.globalCompositeOperation = 'source-over';
  let n = 0;
  for (let gy = Math.max(0, Math.floor(y / CELL)); gy <= Math.min(GH - 1, Math.floor((y + h) / CELL)); gy++) for (let gx = Math.max(0, Math.floor(x / CELL)); gx <= Math.min(GW - 1, Math.floor((x + w) / CELL)); gx++) {
    const i = gy * GW + gx; if (grid[i] && !blkMap[i]) { grid[i] = 0; n++; }
  }
  L.solidNow -= n; return n;
};
L.pixAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : pix[(y | 0) * W + (x | 0)];

// Scorch mark that stays on the page: dark ring on surviving content, soot halo on the paper.
L.scorch = function (x, y, r, a, edge) {
  sctx.globalCompositeOperation = 'source-atop';
  let g = sctx.createRadialGradient(x, y, r * 0.75, x, y, r * 1.7);
  g.addColorStop(0, 'rgba(30,20,18,' + (0.5 * a).toFixed(2) + ')'); g.addColorStop(1, 'rgba(30,20,18,0)');
  sctx.fillStyle = g; sctx.fillRect(x - r * 1.8, y - r * 1.8, r * 3.6, r * 3.6);
  sctx.strokeStyle = 'rgba(20,12,10,' + (0.5 * a).toFixed(2) + ')'; sctx.lineWidth = Math.max(1.5, r * 0.05);
  sctx.beginPath(); sctx.arc(x, y, r + 1, 0, TAU); sctx.stroke();
  sctx.globalCompositeOperation = 'source-over';
  if (edge) return;   // tunnels only darken the surviving edge
  // Paper: sooty ring around the crater rim, lighter inside so the hole still reads as a hole.
  g = bctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.35);
  g.addColorStop(0, 'rgba(45,32,28,0)'); g.addColorStop(0.45, 'rgba(45,32,28,' + (0.05 * a).toFixed(2) + ')');
  g.addColorStop(0.68, 'rgba(45,32,28,' + (0.42 * a).toFixed(2) + ')'); g.addColorStop(0.82, 'rgba(45,32,28,' + (0.2 * a).toFixed(2) + ')'); g.addColorStop(1, 'rgba(45,32,28,0)');
  bctx.fillStyle = g; bctx.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
};
// Coloured splat (zombie goo, acid) on the paper and on remaining content.
L.stain = function (x, y, r, col, a) {
  bctx.globalAlpha = a; bctx.fillStyle = col; bctx.beginPath(); bctx.arc(x, y, r, 0, TAU); bctx.fill(); bctx.globalAlpha = 1;
  sctx.globalCompositeOperation = 'source-atop'; sctx.globalAlpha = a; sctx.fillStyle = col;
  sctx.beginPath(); sctx.arc(x, y, r, 0, TAU); sctx.fill(); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
};
L.charRect = function (x, y, w, h) {   // soft round char, so burning areas don't look like a grid of squares
  sctx.globalCompositeOperation = 'source-atop'; sctx.fillStyle = 'rgba(28,20,18,0.55)';
  sctx.fillRect(x - 0.5, y - 0.5, w + 1, h + 1); sctx.globalCompositeOperation = 'source-over';
};
// True if any collision cell in this fire cell is still solid.
L.fireHas = function (fx, fy) {
  const gx = fx * 2, gy = fy * 2;
  return !!(solidCell(gx, gy) || solidCell(gx + 1, gy) || solidCell(gx, gy + 1) || solidCell(gx + 1, gy + 1)) && gx < GW && gy < GH;
};
// Fully consume a burning fire cell: page pixels vanish, soot stays on the paper.
L.burnCell = function (fx, fy) {
  const gx = fx * 2, gy = fy * 2; let n = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const cx = gx + i, cy = gy + j;
    if (cx < GW && cy < GH && grid[cy * GW + cx]) { grid[cy * GW + cx] = 0; n++; }
  }
  L.solidNow -= n;
  const cx = fx * FC + FC / 2, cy = fy * FC + FC / 2;
  sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = '#000'; sctx.beginPath(); sctx.arc(cx, cy, FC * 0.73, 0, TAU); sctx.fill(); sctx.globalCompositeOperation = 'source-over';
  bctx.fillStyle = 'rgba(40,30,26,0.085)'; bctx.fillRect(fx * FC, fy * FC, FC, FC);   // flat tiles: overlapping round blobs would leave a dotted pattern
  return n;
};

/* ---------- tumbling page pieces ---------- */
// Reusable small canvases hold cut-out slices of the live page (text, product images).
const CH = 56, chunkPool = [];
for (let i = 0; i < 48; i++) { const c = document.createElement('canvas'); c.width = c.height = CH; chunkPool.push({ c: c, g: c.getContext('2d'), used: false }); }
L.chunkPool = chunkPool; L.CHUNK = CH;
// Cut a size x size piece centred on (cx, cy), clipped to the blast circle (bx, by, br). Returns pool index or -1.
L.grabChunk = function (cx, cy, size, bx, by, br) {
  let idx = -1; for (let i = 0; i < chunkPool.length; i++) if (!chunkPool[i].used) { idx = i; break; }
  if (idx < 0) return -1;
  const k = chunkPool[idx], ox = cx - size / 2, oy = cy - size / 2;
  k.g.clearRect(0, 0, CH, CH); k.g.save(); k.g.beginPath(); k.g.arc(bx - ox, by - oy, br, 0, TAU); k.g.clip();
  k.g.drawImage(L.site, ox, oy, size, size, 0, 0, size, size); k.g.restore();
  k.used = true; return idx;
};
L.freeChunk = i => { if (i >= 0) chunkPool[i].used = false; };
})(window.DD);
