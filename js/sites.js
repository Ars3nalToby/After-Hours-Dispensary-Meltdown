/* sites.js: built-in levels. Each entry draws a fake website with canvas calls (original names, no real logos).
 * build(g, W, reg) returns the page height and may register special blocks:
 *   reg.barrel(x,y,w,h)    red drum that explodes (art is drawn by the site)
 *   reg.explosive(x,y,w,h) any rectangle that blows up when hit (the site should call D.drawHazard on it)
 *   reg.hard(x,y,w,h)      high-HP block: needs lots of damage, then shatters into pieces */
(function (D) {
'use strict';
const C = D.C, TAU = D.TAU, rr = D.roundRect, wrap = D.wrapText, FH = D.F_HEAD, FB = D.F_BODY;

function avatar(g, x, y, r, col, letter) {
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  g.fillStyle = '#fff'; g.font = 'bold ' + Math.round(r * 0.95) + 'px ' + FB; g.textAlign = 'center'; g.fillText(letter, x, y + r * 0.34); g.textAlign = 'left';
}
function picture(g, x, y, w, h, c1, c2, kind) {   // simple illustrated image placeholder
  const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; rr(g, x, y, w, h, 8); g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  g.save(); rr(g, x, y, w, h, 8); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(x + w * 0.78, y + h * 0.28, Math.min(w, h) * 0.12, 0, TAU); g.fill();
  g.fillStyle = 'rgba(27,27,47,0.55)'; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w * 0.3, y + h * 0.45); g.lineTo(x + w * 0.52, y + h * 0.75); g.lineTo(x + w * 0.7, y + h * 0.5); g.lineTo(x + w, y + h); g.closePath(); g.fill();
  if (kind === 'play') { g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.17, 0, TAU); g.fill(); g.fillStyle = C.ink; g.beginPath(); const s = Math.min(w, h) * 0.08; g.moveTo(x + w / 2 - s * 0.6, y + h / 2 - s); g.lineTo(x + w / 2 + s * 1.1, y + h / 2); g.lineTo(x + w / 2 - s * 0.6, y + h / 2 + s); g.fill(); }
  g.restore();
}
function lines(g, x, y, w, n, lh, col) {   // greeked text lines
  g.fillStyle = col || '#9aa3b2';
  for (let i = 0; i < n; i++) { const ww = i === n - 1 ? w * 0.55 : w - (i % 3) * 14; rr(g, x, y + i * lh, ww, lh * 0.5, lh * 0.25); g.fill(); }
}

/* ---------- Chirpr: a social feed ---------- */
function buildChirpr(g, W, reg) {
  const narrow = W < 700, m = narrow ? 10 : 24, feedX = narrow ? m : 230, feedW = narrow ? W - 2 * m : Math.min(560, W - 230 - 290 - 24), people = ['#E83F6F', '#0E6E6E', '#7B5EA7', '#F2A541', '#3BA55C', '#3A7CA5'];
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, 60); g.fillStyle = C.ink; g.fillRect(0, 60, W, 3);
  g.fillStyle = '#3A7CA5'; rr(g, m, 12, 38, 36, 12); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(m + 10, 46); g.lineTo(m + 6, 56); g.lineTo(m + 20, 47); g.fill();
  g.font = '26px ' + FH; g.fillStyle = C.ink; g.fillText('Chirpr', m + 48, 42);
  rr(g, W - m - (narrow ? 130 : 260), 14, narrow ? 130 : 260, 32, 16); g.fillStyle = '#EAF2F8'; g.fill(); g.fillStyle = C.grey; g.font = '14px ' + FB; g.fillText('Search chirps', W - m - (narrow ? 118 : 246), 35);
  let y = 84;
  if (!narrow) {   // left nav
    g.font = 'bold 18px ' + FB;
    ['Home', 'Explore', 'Chirps', 'Messages', 'Saved', 'Profile'].forEach((t, i) => { g.fillStyle = i === 0 ? '#3A7CA5' : C.ink; g.fillText(t, m + 8, y + 26 + i * 48); g.fillRect(m + 8, y + 36 + i * 48, 0, 0); });
    g.fillStyle = '#3A7CA5'; rr(g, m + 4, y + 6 * 48 + 8, 150, 44, 22); g.fill(); g.fillStyle = '#fff'; g.font = 'bold 17px ' + FB; g.textAlign = 'center'; g.fillText('New chirp', m + 79, y + 6 * 48 + 36); g.textAlign = 'left';
  }
  const posts = [
    ['Dana Fry', '@danafry', 'Day 41 of asking the office plant for performance reviews. It has exceeded expectations. Mostly by surviving.', 0],
    ['Gus Pixel', '@guspixel', 'Hot take: every website is just a very slow game of Jenga. Somebody please pull the bottom block.', 1],
    ['MegaCoin', '@megacoin', 'AD. Invest in MegaCoin today. Guaranteed returns* (*of the coin, to us).', 2],
    ['Hana Boom', '@hanaboom', 'My cat opened seventeen browser tabs and closed none of them. We are the same.', 3],
    ['Ollie Static', '@olliestatic', 'Fixed a bug by deleting the feature. Shipping it as "streamlined".', 4],
    ['Priya Lime', '@priyalime', 'Reminder that the cloud is just somebody else\'s computer and it is on fire.', 5],
  ];
  posts.forEach((p, i) => {
    const hasPic = i % 2 === 1, h = (hasPic ? 330 : 172) + (narrow ? 14 : 0);
    g.fillStyle = '#fff'; rr(g, feedX, y, feedW, h, 14); g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
    avatar(g, feedX + 36, y + 38, 22, people[i % 6], p[0][0]);
    g.fillStyle = C.ink; g.font = 'bold 17px ' + FB; g.fillText(p[0], feedX + 68, y + 34); g.fillStyle = C.grey; g.font = '14px ' + FB; g.fillText(p[1] + '  ·  ' + (i + 2) + 'h', feedX + 68, y + 54);
    g.fillStyle = C.ink; g.font = '17px ' + FB; const ty = wrap(g, p[2], feedX + 20, y + 90, feedW - 40, 24, 4);
    if (hasPic) { picture(g, feedX + 20, ty + 4, feedW - 40, 140, ['#8ECAE6', '#F2A541', '#F49AC2'][i % 3], ['#3A7CA5', '#E83F6F', '#7B5EA7'][i % 3]); reg.hard(feedX + 20, ty + 4, feedW - 40, 140); }
    const ay = y + h - 26; g.strokeStyle = C.grey; g.lineWidth = 2;
    ['reply', 'rechirp', 'like'].forEach((t, j) => { const ax = feedX + 24 + j * 90; g.beginPath(); g.arc(ax, ay, 8, 0, TAU); g.stroke(); g.fillStyle = C.grey; g.font = '13px ' + FB; g.fillText(String(12 + i * 7 + j * 3), ax + 16, ay + 4); });
    if (p[3] === 2) { D.drawHazard(g, feedX, y, feedW, h); reg.explosive(feedX, y, feedW, h); }
    y += h + 16;
  });
  if (!narrow) {   // trends column
    const tx = feedX + feedW + 24, tw = W - tx - m;
    if (tw > 160) {
      g.fillStyle = '#fff'; rr(g, tx, 84, tw, 330, 14); g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
      g.fillStyle = C.ink; g.font = '20px ' + FH; g.fillText('Trending', tx + 16, 118);
      ['#nothingbuttabs', '#plantreview', '#mondayagain', '#cloudfire', '#catsonkeyboards'].forEach((t, i) => { g.fillStyle = '#3A7CA5'; g.font = 'bold 16px ' + FB; g.fillText(t, tx + 16, 156 + i * 52); g.fillStyle = C.grey; g.font = '13px ' + FB; g.fillText((9 + i * 3) + 'K chirps', tx + 16, 174 + i * 52); });
      D.drawHazard(g, tx, 440, tw, 120); g.fillStyle = '#fff'; g.fillRect(tx + 6, 446, tw - 12, 108); g.fillStyle = C.ink; g.font = '16px ' + FH; g.fillText('SPONSORED', tx + 14, 474); g.font = '14px ' + FB; wrap(g, 'Premium Air. Breathe the good stuff.', tx + 14, 498, tw - 28, 20, 3); D.drawHazard(g, tx, 440, tw, 120); reg.explosive(tx, 440, tw, 120);
    }
  }
  return y + 20;
}

/* ---------- The Daily Overshare: a news site ---------- */
function buildNews(g, W, reg) {
  const narrow = W < 700, m = narrow ? 12 : 30;
  g.fillStyle = C.ink; g.fillRect(0, 0, W, 28); g.fillStyle = '#fff'; g.font = '12px ' + FB; g.fillText('Thursday  ·  Sunny with a chance of opinions', m, 19);
  g.fillStyle = C.ink; g.font = (narrow ? 34 : 64) + 'px ' + FH; g.textAlign = 'center'; g.fillText('The Daily Overshare', W / 2, narrow ? 80 : 108); g.textAlign = 'left';
  g.fillRect(m, narrow ? 94 : 124, W - 2 * m, 4); g.fillRect(m, narrow ? 102 : 132, W - 2 * m, 1.5);
  let y = narrow ? 112 : 142;
  g.font = 'bold 14px ' + FB; let nx = m; ['World', 'Politics', 'Money', 'Sport', 'Weather', 'Opinion', 'Puzzles'].forEach(t => { g.fillStyle = C.ink; g.fillText(t, nx, y + 20); nx += g.measureText(t).width + 22; });
  y += 40; g.fillStyle = C.pink; g.fillRect(m, y - 6, W - 2 * m, 3);
  // lead story
  const leadW = narrow ? W - 2 * m : Math.floor((W - 2 * m) * 0.62);
  g.fillStyle = C.ink; g.font = (narrow ? 28 : 44) + 'px ' + FH; const hy = wrap(g, 'Local man discovers the internet has no off switch', m, y + (narrow ? 34 : 52), leadW, narrow ? 34 : 50, 3);
  picture(g, m, hy, leadW, narrow ? 190 : 300, '#F2A541', '#E83F6F'); reg.hard(m, hy, leadW, narrow ? 190 : 300);
  g.fillStyle = C.grey; g.font = '13px ' + FB; g.fillText('By Staff Writer  ·  6 min read', m, hy + (narrow ? 212 : 322));
  g.fillStyle = C.ink; g.font = '17px ' + FB; const ly = wrap(g, 'Experts say the situation is "fine" and "not our department". Meanwhile residents have been advised to close some tabs, drink water, and look at a tree.', m, hy + (narrow ? 240 : 352), leadW, 24, 4);
  let end = ly;
  if (!narrow) {   // side column with ad and briefs
    const sx = m + leadW + 24, sw = W - m - sx;
    D.drawHazard(g, sx, y + 4, sw, 250); g.fillStyle = '#FFF3C4'; g.fillRect(sx + 6, y + 10, sw - 12, 238); g.fillStyle = C.ink; g.font = '22px ' + FH; g.fillText('ADVERTISEMENT', sx + 16, y + 44);
    g.font = 'bold 28px ' + FB; wrap(g, 'You will not BELIEVE this one weird mattress', sx + 16, y + 84, sw - 32, 34, 4); D.drawHazard(g, sx, y + 4, sw, 250); reg.explosive(sx, y + 4, sw, 250);
    let by = y + 280; g.fillStyle = C.pink; g.font = '16px ' + FH; g.fillText('In brief', sx, by); by += 14;
    ['Council votes to rename Tuesday.', 'Pigeon union demands crumbs.', 'Stocks rise, then remember.', 'Weather: yes.'].forEach(t => { g.fillStyle = C.ink; g.font = 'bold 15px ' + FB; by = wrap(g, t, sx, by + 18, sw, 20, 2) + 6; g.fillStyle = '#ddd'; g.fillRect(sx, by - 6, sw, 1.5); });
    end = Math.max(end, by);
  }
  y = end + 30; g.fillStyle = C.ink; g.fillRect(m, y, W - 2 * m, 3); y += 24;
  const cols = narrow ? 1 : 3, cw = (W - 2 * m - (cols - 1) * 20) / cols;
  const arts = [['Budget cuts hit snack drawer', '#8ECAE6', '#3A7CA5'], ['Cat elected to council', '#F49AC2', '#7B5EA7'], ['Why your calendar hates you', '#A8DADC', '#0E6E6E'], ['Review: a chair', '#FFD23F', '#F26B38'], ['Robots ask for a raise', '#B5838D', '#6D597A'], ['Seven ways to stand', '#3BA55C', '#0E6E6E']];
  for (let i = 0; i < (narrow ? 4 : 6); i++) {
    const c = i % cols, r = Math.floor(i / cols), ax = m + c * (cw + 20), ay = y + r * 300;
    picture(g, ax, ay, cw, 150, arts[i][1], arts[i][2]); reg.hard(ax, ay, cw, 150);
    g.fillStyle = C.ink; g.font = '22px ' + FH; const ty = wrap(g, arts[i][0], ax, ay + 184, cw, 26, 2); lines(g, ax, ty + 4, cw, 3, 18);
  }
  y += Math.ceil((narrow ? 4 : 6) / cols) * 300 + 10;
  g.fillStyle = C.ink; g.fillRect(0, y, W, 120); g.fillStyle = '#fff'; g.font = '13px ' + FB; g.fillText('© The Daily Overshare. Satire. Any resemblance to real news is a coincidence.', m, y + 40); g.fillStyle = C.yellow; g.font = '16px ' + FH; g.fillText('Subscribe for nothing', m, y + 80);
  return y + 120;
}

/* ---------- Tubeline: a video site ---------- */
function buildTube(g, W, reg) {
  const narrow = W < 700, m = narrow ? 10 : 24;
  g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, 62); g.fillStyle = C.ink; g.fillRect(0, 62, W, 3);
  g.fillStyle = '#D7263D'; rr(g, m, 14, 46, 34, 10); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(m + 18, 22); g.lineTo(m + 32, 31); g.lineTo(m + 18, 40); g.fill();
  g.fillStyle = C.ink; g.font = '26px ' + FH; g.fillText('Tubeline', m + 56, 42);
  rr(g, narrow ? W - 150 : W / 2 - 160, 14, narrow ? 140 : 320, 34, 17); g.fillStyle = '#F3F3F6'; g.fill(); g.lineWidth = 2; g.strokeStyle = C.ink; g.stroke();
  let y = 84;
  const pw = narrow ? W - 2 * m : Math.floor((W - 2 * m) * 0.68), ph = Math.round(pw * 0.5625);
  picture(g, m, y, pw, ph, '#1B1B2F', '#3A7CA5', 'play'); reg.hard(m, y, pw, ph);
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(m + 12, y + ph - 34, pw - 24, 8); g.fillStyle = '#D7263D'; g.fillRect(m + 12, y + ph - 34, (pw - 24) * 0.38, 8);
  D.drawHazard(g, m + pw - 170, y + ph - 90, 158, 46); g.fillStyle = '#fff'; g.fillRect(m + pw - 164, y + ph - 84, 146, 34); g.fillStyle = C.ink; g.font = 'bold 16px ' + FB; g.fillText('Skip ad  ▶', m + pw - 148, y + ph - 61); D.drawHazard(g, m + pw - 170, y + ph - 90, 158, 46); reg.explosive(m + pw - 170, y + ph - 90, 158, 46);
  g.fillStyle = C.ink; g.font = '26px ' + FH; let ty = wrap(g, 'I watched this loading bar for 10 hours (it finished)', m, y + ph + 40, pw, 32, 2);
  g.fillStyle = C.grey; g.font = '14px ' + FB; g.fillText('1.2M views  ·  3 days ago', m, ty + 4);
  avatar(g, m + 20, ty + 40, 20, '#0E6E6E', 'L'); g.fillStyle = C.ink; g.font = 'bold 16px ' + FB; g.fillText('Loading Larry', m + 52, ty + 46);
  rr(g, m + pw - 130, ty + 24, 120, 34, 17); g.fillStyle = C.ink; g.fill(); g.fillStyle = '#fff'; g.font = 'bold 15px ' + FB; g.fillText('Subscribe', m + pw - 106, ty + 46);
  let cy = ty + 90; g.fillStyle = C.ink; g.font = '20px ' + FH; g.fillText('412 comments', m, cy);
  ['first', 'who is still watching in 2031', 'this is my cardio now', 'the comments are better than the video', 'I came here by accident'].forEach((c, i) => { cy += 20; avatar(g, m + 18, cy + 18, 16, ['#E83F6F', '#7B5EA7', '#F2A541', '#3BA55C', '#3A7CA5'][i], String.fromCharCode(65 + i)); g.fillStyle = C.ink; g.font = '15px ' + FB; g.fillText(c, m + 46, cy + 22); cy += 44; });
  let end = cy;
  const sx = m + pw + 20, sw = W - m - sx, sh = narrow ? 0 : 92;
  if (!narrow && sw > 120) { for (let i = 0; i < 7; i++) { const ty2 = y + i * (sh + 18); picture(g, sx, ty2, sw, sh, ['#8ECAE6', '#F49AC2', '#FFD23F', '#A8DADC', '#B5838D', '#3BA55C', '#F2A541'][i], ['#3A7CA5', '#7B5EA7', '#E83F6F', '#0E6E6E', '#6D597A', '#0E6E6E', '#D7263D'][i], 'play'); reg.hard(sx, ty2, sw, sh); } end = Math.max(end, y + 7 * (sh + 18)); }
  y = end + 20; g.fillStyle = C.ink; g.font = '24px ' + FH; g.fillText('Recommended', m, y + 20); y += 40;
  const cols = narrow ? 2 : W >= 900 ? 4 : 3, gap = 14, cw = (W - 2 * m - gap * (cols - 1)) / cols, chh = Math.round(cw * 0.56);
  for (let i = 0; i < cols * 2; i++) {
    const c = i % cols, r = Math.floor(i / cols), x = m + c * (cw + gap), ty3 = y + r * (chh + 74);
    picture(g, x, ty3, cw, chh, ['#8ECAE6', '#FFD23F', '#F49AC2', '#A8DADC', '#B5838D', '#3BA55C', '#F2A541', '#7B5EA7'][i % 8], ['#3A7CA5', '#E83F6F', '#7B5EA7', '#0E6E6E', '#6D597A', '#0E6E6E', '#D7263D', '#1B1B2F'][i % 8], 'play'); reg.hard(x, ty3, cw, chh);
    g.fillStyle = C.ink; g.font = 'bold 15px ' + FB; wrap(g, ['Unboxing a box', 'Sleeping: a tutorial', '10 hours of rain on a laptop', 'Cat vs vacuum, round 9', 'How to be on time (late)', 'Soup, but loud', 'I fixed it (I broke it)', 'The last video'][i % 8], x, ty3 + chh + 22, cw, 19, 2);
    g.fillStyle = C.grey; g.font = '13px ' + FB; g.fillText((i + 2) + 'K views', x, ty3 + chh + 62);
  }
  y += 2 * (chh + 74) + 20;
  g.fillStyle = C.ink; g.fillRect(0, y, W, 90); g.fillStyle = '#fff'; g.font = '13px ' + FB; g.fillText('© Tubeline. A parody video site. No videos were harmed.', m, y + 50);
  return y + 90;
}

D.SITES = [
  { id: 'megasave', name: 'MegaSave', desc: 'Discount chemist', build: (g, W, reg) => D.drawMegaSave(g, W, reg), bg: D.C.paper },
  { id: 'chirpr', name: 'Chirpr', desc: 'Social feed', build: buildChirpr, bg: '#EAF2F8', url: 'chirpr.example/home' },
  { id: 'overshare', name: 'Daily Overshare', desc: 'News site', build: buildNews, bg: '#FFFDF7', url: 'dailyovershare.example' },
  { id: 'tubeline', name: 'Tubeline', desc: 'Video site', build: buildTube, bg: '#F6F6F9', url: 'tubeline.example/watch' },
];
D.siteById = id => D.SITES.find(s => s.id === id) || D.SITES[0];
})(window.DD);
