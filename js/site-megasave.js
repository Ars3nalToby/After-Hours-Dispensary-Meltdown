/* site-megasave.js: the built-in parody pharmacy page (MegaSave), drawn with canvas calls.
 * Ported from the prototype, plus red flammable drums that explode when hit.
 * drawMegaSave(g, W, reg) returns the page height and calls reg.barrel(x, y, w, h) for each drum. */
(function (D) {
'use strict';
const C = D.C, TAU = D.TAU, F_HEAD = D.F_HEAD, F_BODY = D.F_BODY;
let reg = null;

const PRODUCTS1 = [
  { name: 'Omega fish oil 1000mg 400 capsules', price: 19.99, rrp: 45.99, kind: 'bottle', color: '#F2A541', label: 'OMEGA' },
  { name: 'Vitamin C 1000mg 150 tablets', price: 12.49, rrp: 29.99, kind: 'tub', color: '#F26B38', label: 'VIT C' },
  { name: 'Magnesium sleep formula 120 capsules', price: 17.99, rrp: 39.95, kind: 'bottle', color: '#7B5EA7', label: 'Mg' },
  { name: 'Daily probiotic 30 capsules', price: 24.99, rrp: 54.99, kind: 'box', color: '#3BA55C', label: 'PRO' },
  { name: 'Sunscreen SPF50+ lotion 400mL', price: 14.99, rrp: 24.99, kind: 'tube', color: '#FFB627', label: 'SPF50+' },
  { name: 'Marine collagen powder 300g', price: 29.99, rrp: 64.99, kind: 'tub', color: '#F49AC2', label: 'COLLAGEN' },
  { name: 'Hand sanitiser 5L drum (flammable)', price: 21.99, rrp: 44.99, kind: 'drum', color: '#D7263D', label: '' },
  { name: 'Hydrating face serum 30mL', price: 22.99, rrp: 49.99, kind: 'dropper', color: '#8ECAE6', label: 'SERUM' },
];
const PRODUCTS2 = [
  { name: 'Day and night cold and flu 24 tablets', price: 8.99, rrp: 16.99, kind: 'box', color: '#E63946', label: 'DAY/NIGHT' },
  { name: 'Sensitive baby wipes 240 pack', price: 6.49, rrp: 12.99, kind: 'box', color: '#A8DADC', label: 'WIPES' },
  { name: 'Aerosol body spray 12 pack (flammable)', price: 15.99, rrp: 31.99, kind: 'drum', color: '#D7263D', label: '' },
  { name: 'Whey protein bars 12 pack', price: 18.99, rrp: 39.99, kind: 'box', color: '#6D597A', label: 'PROTEIN' },
];

function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
D.roundRect = rr;
D.wrapText = (g, t, x, y, w, lh, n) => wrapText(g, t, x, y, w, lh, n);
function wrapText(g, text, x, y, maxW, lh, maxLines) {
  maxLines = maxLines || 99;
  const words = text.split(' '); let line = '', n = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + ' ' + words[i] : words[i];
    if (g.measureText(test).width > maxW && line) {
      g.fillText(line, x, y); y += lh; n++;
      if (n >= maxLines - 1) {
        const rest = words.slice(i).join(' '); line = rest;
        while (g.measureText(line + '…').width > maxW && line.length > 1) line = line.slice(0, -1);
        if (line !== rest) line += '…';
        g.fillText(line, x, y); return y + lh;
      }
      line = words[i];
    } else line = test;
  }
  if (line) { g.fillText(line, x, y); y += lh; }
  return y;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.min(255, Math.max(0, Math.round(v * k)));
  return 'rgb(' + f(n >> 16) + ',' + f((n >> 8) & 255) + ',' + f(n & 255) + ')';
}
function starburst(g, cx, cy, r, n, color) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = i * Math.PI / n - Math.PI / 2, rad = i % 2 ? r * 0.72 : r; g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  g.closePath(); g.fillStyle = color; g.fill(); g.strokeStyle = C.ink; g.lineWidth = 3; g.stroke();
}
function drawCart(g, x, y) {
  g.strokeStyle = C.ink; g.lineWidth = 3; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 6, y + 4); g.lineTo(x + 11, y + 24); g.lineTo(x + 30, y + 24); g.lineTo(x + 33, y + 10); g.lineTo(x + 8, y + 10); g.stroke();
  g.fillStyle = C.ink; g.beginPath(); g.arc(x + 13, y + 30, 3, 0, TAU); g.fill(); g.beginPath(); g.arc(x + 28, y + 30, 3, 0, TAU); g.fill();
  g.fillStyle = C.yellow; g.beginPath(); g.arc(x + 33, y + 2, 8, 0, TAU); g.fill(); g.lineWidth = 2; g.stroke();
  g.fillStyle = C.ink; g.font = 'bold 11px ' + F_BODY; g.textAlign = 'center'; g.fillText('3', x + 33, y + 6); g.textAlign = 'left';
}

// Red flammable drum with a yellow flame plate. Registers itself as an explosive block.
function drawDrum(g, x, y, w, h) {
  g.lineWidth = 2.5; g.strokeStyle = C.ink; g.lineJoin = 'round';
  g.fillStyle = '#D7263D'; rr(g, x, y, w, h, w * 0.18); g.fill(); g.stroke();
  g.fillStyle = '#9E1B2D';
  g.fillRect(x + 1, y + h * 0.15, w - 2, h * 0.07); g.fillRect(x + 1, y + h * 0.78, w - 2, h * 0.07);
  g.lineWidth = 1.5; g.strokeRect(x + 1, y + h * 0.15, w - 2, h * 0.07); g.strokeRect(x + 1, y + h * 0.78, w - 2, h * 0.07);
  g.fillStyle = C.yellow; rr(g, x + w * 0.14, y + h * 0.3, w * 0.72, h * 0.4, 4); g.fill(); g.lineWidth = 1.8; g.stroke();
  const cx = x + w / 2, cy = y + h * 0.5, s = Math.min(w, h) * 0.2;
  g.fillStyle = C.ink; g.beginPath();
  g.moveTo(cx, cy - s * 1.5); g.bezierCurveTo(cx + s * 1.3, cy - s * 0.4, cx + s * 1.1, cy + s * 1.1, cx, cy + s * 1.3);
  g.bezierCurveTo(cx - s * 1.1, cy + s * 1.1, cx - s * 1.2, cy, cx - s * 0.3, cy - s * 0.5);
  g.bezierCurveTo(cx - s * 0.2, cy - s * 0.9, cx - s * 0.1, cy - s * 1.2, cx, cy - s * 1.5); g.fill();
  if (reg) reg.barrel(x, y, w, h);
}

function drawProduct(g, kind, cx, cy, s, color, label) {
  g.lineWidth = 2; g.strokeStyle = C.ink;
  const fs = Math.max(8, Math.round(s * 0.085));
  const lbl = (x, y, w, h) => {
    g.fillStyle = '#FFFFFF'; g.fillRect(x, y, w, h); g.lineWidth = 1.2; g.strokeRect(x, y, w, h); g.lineWidth = 2;
    g.fillStyle = C.ink; g.font = 'bold ' + fs + 'px ' + F_BODY; g.textAlign = 'center';
    let t = label; while (g.measureText(t).width > w - 4 && t.length > 2) t = t.slice(0, -1);
    g.fillText(t, x + w / 2, y + h / 2 + fs * 0.36); g.textAlign = 'left';
  };
  if (kind === 'drum') { const dw = s * 0.5, dh = s * 0.74; drawDrum(g, cx - dw / 2, cy - dh / 2 + s * 0.04, dw, dh); }
  else if (kind === 'bottle') {
    const bw = s * 0.42, bh = s * 0.66, x = cx - bw / 2, y = cy - bh / 2 + s * 0.1;
    g.fillStyle = shade(color, 0.55); g.fillRect(cx - bw * 0.3, y - s * 0.15, bw * 0.6, s * 0.16); g.strokeRect(cx - bw * 0.3, y - s * 0.15, bw * 0.6, s * 0.16);
    g.fillStyle = color; rr(g, x, y, bw, bh, bw * 0.2); g.fill(); g.stroke(); lbl(x + 4, y + bh * 0.3, bw - 8, bh * 0.38);
  } else if (kind === 'tub') {
    const tw = s * 0.64, th = s * 0.5, x = cx - tw / 2, y = cy - th / 2 + s * 0.08;
    g.fillStyle = color; rr(g, x, y, tw, th, 6); g.fill(); g.stroke();
    g.fillStyle = shade(color, 0.6); rr(g, x - 4, y - s * 0.12, tw + 8, s * 0.13, 4); g.fill(); g.stroke(); lbl(x + 6, y + th * 0.28, tw - 12, th * 0.44);
  } else if (kind === 'box') {
    const bw = s * 0.5, bh = s * 0.64, d = s * 0.12, x = cx - bw / 2 - d / 2, y = cy - bh / 2 + d / 2;
    g.fillStyle = shade(color, 1.25); g.beginPath(); g.moveTo(x, y); g.lineTo(x + d, y - d); g.lineTo(x + bw + d, y - d); g.lineTo(x + bw, y); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = shade(color, 0.7); g.beginPath(); g.moveTo(x + bw, y); g.lineTo(x + bw + d, y - d); g.lineTo(x + bw + d, y + bh - d); g.lineTo(x + bw, y + bh); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = color; g.fillRect(x, y, bw, bh); g.strokeRect(x, y, bw, bh); lbl(x + 4, y + bh * 0.34, bw - 8, bh * 0.3);
  } else if (kind === 'tube') {
    const tw = s * 0.44, top = cy - s * 0.38, bot = cy + s * 0.24;
    g.fillStyle = color; g.beginPath(); g.moveTo(cx - tw / 2, top); g.lineTo(cx + tw / 2, top); g.lineTo(cx + tw * 0.3, bot); g.lineTo(cx - tw * 0.3, bot); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = shade(color, 0.6); g.fillRect(cx - tw / 2 - 2, top - 4, tw + 4, 6); g.strokeRect(cx - tw / 2 - 2, top - 4, tw + 4, 6);
    g.fillStyle = C.ink; g.fillRect(cx - tw * 0.22, bot, tw * 0.44, s * 0.12); lbl(cx - tw * 0.33, cy - s * 0.18, tw * 0.66, s * 0.2);
  } else {
    const bw = s * 0.36, bh = s * 0.44, x = cx - bw / 2, y = cy - bh / 2 + s * 0.16;
    g.fillStyle = color; rr(g, x, y, bw, bh, bw * 0.18); g.fill(); g.stroke();
    g.fillStyle = C.ink; g.fillRect(cx - bw * 0.22, y - s * 0.1, bw * 0.44, s * 0.1);
    g.beginPath(); g.ellipse(cx, y - s * 0.18, bw * 0.2, s * 0.1, 0, 0, TAU); g.fill(); lbl(x + 3, y + bh * 0.3, bw - 6, bh * 0.4);
  }
}
function drawCard(g, p, x, y, w, h, narrow) {
  g.fillStyle = '#FFFFFF'; rr(g, x, y, w, h, 10); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2; g.stroke();
  const imgH = narrow ? 118 : 136;
  drawProduct(g, p.kind, x + w / 2, y + 14 + imgH / 2, Math.min(w * 0.7, imgH - 8), p.color, p.label);
  const pct = Math.round((1 - p.price / p.rrp) * 100);
  g.fillStyle = C.yellow; rr(g, x + 8, y + 8, 50, 22, 6); g.fill(); g.lineWidth = 1.5; g.stroke();
  g.fillStyle = C.ink; g.font = '13px ' + F_HEAD; g.textAlign = 'center'; g.fillText('-' + pct + '%', x + 33, y + 24); g.textAlign = 'left';
  const ty = y + 14 + imgH + 18;
  g.fillStyle = C.ink; g.font = 'bold ' + (narrow ? 13 : 14) + 'px ' + F_BODY; wrapText(g, p.name, x + 10, ty, w - 20, 17, 2);
  const py = ty + 40;
  g.fillStyle = C.grey; g.font = (narrow ? 12 : 13) + 'px ' + F_BODY;
  const rrp = 'RRP $' + p.rrp.toFixed(2); g.fillText(rrp, x + 10, py); g.fillRect(x + 10, py - 4, g.measureText(rrp).width, 1.5);
  g.fillStyle = C.pink; g.font = (narrow ? 24 : 28) + 'px ' + F_HEAD; g.fillText('$' + p.price.toFixed(2), x + 10, py + 30);
  const by = y + h - 44;
  g.fillStyle = C.teal; rr(g, x + 10, by, w - 20, 32, 16); g.fill();
  g.fillStyle = C.paper; g.font = 'bold 13px ' + F_BODY; g.textAlign = 'center'; g.fillText('Add to cart', x + w / 2, by + 21); g.textAlign = 'left';
}
function heading(g, text, m, y, narrow) {
  g.fillStyle = C.ink; g.font = (narrow ? 22 : 28) + 'px ' + F_HEAD; g.fillText(text, m, y + 26);
  g.fillStyle = C.pink; g.fillRect(m, y + 36, 64, 5);
  return y + 58;
}
function productGrid(g, items, m, y, W, narrow) {
  const cols = W >= 780 ? 4 : W >= 540 ? 3 : 2, gap = narrow ? 10 : 18;
  const cw = (W - 2 * m - gap * (cols - 1)) / cols, ch = narrow ? 290 : 310;
  items.forEach((p, i) => drawCard(g, p, m + (i % cols) * (cw + gap), y + Math.floor(i / cols) * (ch + gap), cw, ch, narrow));
  return y + Math.ceil(items.length / cols) * (ch + gap) - gap;
}

// Hazard overlay for explosive blocks: yellow/ink striped frame plus a flame badge. Used by built-in sites and screenshot imports.
D.drawHazard = function (g, x, y, w, h) {
  g.save();
  g.fillStyle = 'rgba(232,63,111,0.12)'; g.fillRect(x, y, w, h);
  g.lineWidth = 4; g.strokeStyle = C.ink; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  g.setLineDash([9, 9]); g.strokeStyle = C.yellow; g.strokeRect(x + 2, y + 2, w - 4, h - 4); g.setLineDash([]);
  const bx = x + w - 15, by = y + 15;
  g.fillStyle = '#D7263D'; g.strokeStyle = C.ink; g.lineWidth = 2; g.beginPath(); g.arc(bx, by, 12, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = C.yellow; g.beginPath(); g.moveTo(bx, by - 8); g.bezierCurveTo(bx + 7, by - 2, bx + 6, by + 6, bx, by + 7);
  g.bezierCurveTo(bx - 6, by + 6, bx - 7, by, bx - 2, by - 3); g.bezierCurveTo(bx - 1, by - 5, bx, by - 6, bx, by - 8); g.fill();
  g.restore();
};

D.drawMegaSave = function (g, W, registry) {
  reg = registry;
  const narrow = W < 600, m = narrow ? 12 : 28;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';

  g.fillStyle = C.teal; g.fillRect(0, 0, W, 30);
  g.fillStyle = C.yellow; g.font = '12px ' + F_HEAD; g.textAlign = 'center';
  g.fillText(narrow ? 'Free delivery over $99' : 'Free delivery over $99      We beat any price*      Open till late', W / 2, 20);
  g.textAlign = 'left';
  let y = 46;

  const logoW = narrow ? 168 : 220, logoH = narrow ? 52 : 62;
  g.fillStyle = C.pink; rr(g, m, y, logoW, logoH, 10); g.fill();
  g.fillStyle = C.paper; g.font = (narrow ? 24 : 30) + 'px ' + F_HEAD; g.fillText('MegaSave', m + 12, y + (narrow ? 30 : 36));
  g.font = 'bold ' + (narrow ? 11 : 13) + 'px ' + F_BODY; g.fillText('discount chemist', m + 13, y + logoH - 10);
  const cartX = W - m - 42; drawCart(g, cartX, y + 12);
  let sx, sy, sw;
  if (narrow) { sx = m; sy = y + logoH + 12; sw = W - 2 * m; } else { sx = m + logoW + 24; sy = y + 11; sw = cartX - sx - 24; }
  g.fillStyle = '#FFFFFF'; rr(g, sx, sy, sw, 40, 20); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 2.5; g.stroke();
  g.fillStyle = C.grey; g.font = '14px ' + F_BODY; g.fillText('Search 12,000 products…', sx + 18, sy + 25);
  g.strokeStyle = C.ink; g.lineWidth = 2.5; g.beginPath(); g.arc(sx + sw - 24, sy + 18, 7, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(sx + sw - 19, sy + 23); g.lineTo(sx + sw - 13, sy + 29); g.stroke();
  y = narrow ? sy + 40 + 12 : y + logoH + 12;

  const nav = ['Vitamins', 'Beauty', 'Baby', 'Cold & flu', 'Skincare', 'Fragrance', 'Sports nutrition', 'Clearance'];
  g.font = 'bold ' + (narrow ? 13 : 15) + 'px ' + F_BODY;
  let nx = m, ny = y + 18;
  for (const n of nav) {
    const w = g.measureText(n).width;
    if (nx + w > W - m) { nx = m; ny += 24; }
    g.fillStyle = n === 'Clearance' ? C.pink : C.ink; g.fillText(n, nx, ny);
    nx += w + (narrow ? 16 : 24);
  }
  y = ny + 12; g.fillStyle = C.yellow; g.fillRect(0, y, W, 6); y += 24;

  const hh = narrow ? 210 : 270;
  g.fillStyle = C.yellow; rr(g, m, y, W - 2 * m, hh, 14); g.fill(); g.lineWidth = 3; g.strokeStyle = C.ink; g.stroke();
  g.fillStyle = C.ink; g.font = (narrow ? 56 : 92) + 'px ' + F_HEAD; g.fillText('SALE', m + 20, y + (narrow ? 72 : 108));
  g.font = (narrow ? 22 : 34) + 'px ' + F_HEAD; g.fillText('Up to 70% off*', m + 22, y + (narrow ? 108 : 158));
  g.font = (narrow ? 13 : 16) + 'px ' + F_BODY; g.fillText('Everything must go. Some of it already has.', m + 22, y + (narrow ? 134 : 192));
  const bh = narrow ? 34 : 42, bw = narrow ? 130 : 160;
  g.fillStyle = C.ink; rr(g, m + 22, y + hh - bh - (narrow ? 18 : 24), bw, bh, bh / 2); g.fill();
  g.fillStyle = C.yellow; g.font = 'bold ' + (narrow ? 14 : 16) + 'px ' + F_BODY; g.textAlign = 'center';
  g.fillText('Shop the sale', m + 22 + bw / 2, y + hh - (narrow ? 18 : 24) - bh / 2 + 5);
  g.fillStyle = C.ink; g.font = '11px ' + F_BODY; g.textAlign = 'right'; g.fillText('*on things nobody buys', W - m - 16, y + hh - 14);
  g.textAlign = 'left';
  const stx = W - m - (narrow ? 62 : 110), sty = y + (narrow ? 64 : 100), str = narrow ? 50 : 82;
  starburst(g, stx, sty, str, 14, C.pink);
  g.save(); g.translate(stx, sty); g.rotate(-0.18); g.fillStyle = C.paper; g.font = (narrow ? 16 : 26) + 'px ' + F_HEAD; g.textAlign = 'center';
  g.fillText('SAVE!', 0, narrow ? 6 : 9); g.restore();
  y += hh + 30;

  y = heading(g, 'Hot deals this week', m, y, narrow);
  y = productGrid(g, PRODUCTS1, m, y, W, narrow);

  y += 30;
  const ph = narrow ? 204 : 190;
  g.fillStyle = C.teal; rr(g, m, y, W - 2 * m, ph, 14); g.fill();
  g.fillStyle = C.paper; g.font = (narrow ? 20 : 28) + 'px ' + F_HEAD;
  let ty = wrapText(g, 'Scripts ready in 15 minutes*', m + 20, y + (narrow ? 38 : 50), W - 2 * m - 40, narrow ? 26 : 34);
  g.fillStyle = '#CFEDEC'; g.font = (narrow ? 13 : 15) + 'px ' + F_BODY;
  ty = wrapText(g, '*Pharmacist minutes. Roughly 40 human ones. Please do not ask at minute 16.', m + 20, ty + 2, W - 2 * m - 40, narrow ? 18 : 20);
  g.fillStyle = C.yellow; rr(g, m + 20, ty + 4, 150, 36, 18); g.fill();
  g.fillStyle = C.ink; g.font = 'bold 14px ' + F_BODY; g.textAlign = 'center'; g.fillText('Upload a script', m + 95, ty + 27); g.textAlign = 'left';
  // Stock room: a stack of drums sits on the right side of the banner.
  if (W >= 600) {
    const dw = 46, dh = 66, baseY = y + ph - 14 - dh;
    for (let i = 0; i < 3; i++) drawDrum(g, W - m - 30 - (i + 1) * (dw + 10), baseY, dw, dh);
    drawDrum(g, W - m - 30 - 2 * (dw + 10) + 8, baseY - dh - 4, dw, dh);
  }
  y = Math.max(y + ph, ty + 60);

  y += 30;
  y = heading(g, 'Clearance bin', m, y, narrow);
  y = productGrid(g, PRODUCTS2, m, y, W, narrow);

  y += 40;
  const fh = narrow ? 230 : 200;
  g.fillStyle = C.ink; g.fillRect(0, y, W, fh);
  const cols = [['Shop', 'Vitamins', 'Beauty', 'Baby', 'Clearance'], ['Help', 'Track my order', 'Returns', 'Store finder'], ['About', 'Careers', 'Our pharmacists', 'Not a real shop']];
  const colW = narrow ? (W - 2 * m) / 3 : 190;
  cols.forEach((c, i) => {
    const x = m + i * colW;
    g.fillStyle = C.yellow; g.font = (narrow ? 13 : 15) + 'px ' + F_HEAD; g.fillText(c[0], x, y + 36);
    g.fillStyle = C.paper; g.font = (narrow ? 12 : 13) + 'px ' + F_BODY;
    c.slice(1).forEach((t, j) => g.fillText(t, x, y + 62 + j * 22));
  });
  g.fillStyle = C.grey; g.font = '11px ' + F_BODY;
  wrapText(g, '© MegaSave Discount Chemist. A parody. No real pharmacies were harmed.', m, y + fh - 24, W - 2 * m, 14);
  if (W >= 780) { drawDrum(g, W - m - 150, y + 14, 46, 66); drawDrum(g, W - m - 94, y + 14, 46, 66); }
  reg = null;
  return y + fh;
};
})(window.DD);
