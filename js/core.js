/* core.js: shared namespace, constants, helpers and global game state.
 * Every other file attaches itself to window.DD (classic scripts, no build step,
 * so the game also runs when index.html is opened from disk). */
window.DD = {};
(function (D) {
'use strict';

D.TAU = Math.PI * 2;
D.CELL = 3;   // collision grid cell size, in page pixels
D.FC = 6;     // fire cell size (2x2 collision cells)
D.WIN_PCT = 80;
D.reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

D.C = { ink: '#1B1B2F', paper: '#FFFDF7', teal: '#0E6E6E', yellow: '#FFD23F', pink: '#E83F6F', grey: '#8A8797' };
D.F_HEAD = '"Archivo Black", Impact, "Arial Black", sans-serif';
D.F_BODY = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

D.rand = (a, b) => a + Math.random() * (b - a);
D.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
D.lerp = (a, b, t) => a + (b - a) * t;

// 5-bit-per-channel colour string cache: debris keeps (near) original page colours
// without building a new string for every particle.
const rgbCache = new Array(32768);
D.rgb = (r, g, b) => {
  const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
  return rgbCache[k] || (rgbCache[k] = 'rgb(' + ((r & 248) | 4) + ',' + ((g & 248) | 4) + ',' + ((b & 248) | 4) + ')');
};

// Global mutable game state.
D.S = {
  VW: 0, VH: 0, DPR: 1, offX: 0, camX: 0, camY: -160,
  mode: 'title',            // title | play | dead | won
  trauma: 0, zoom: 0, dim: 0, flash: 0, flashCol: '#fff', chroma: 0, chromaCd: 0, hitCd: 0, hitstop: 0, slow: 1, slowT: 0,
  score: 0, kills: 0, combo: 0, comboT: 0, mult: 1, best: 0, wonShown: false, time: 0,
  wave: 0, cellsScore: 0,
};

D.P = {
  x: 0, y: 0, vx: 0, vy: 0, w: 10, h: 32, onGround: false, face: 1, walkT: 0, fuel: 1, thrust: false,
  ax: 1, ay: 0, hp: 100, maxHp: 100, inv: 0, dashT: 0, dashCd: 0, dashDir: 1, hurtT: 0, dead: false,
  spin: 0, spinAng: 0, charge: 0, chargeAng: 0, recoilT: 0, burn: 0, stepH: 7,
};

D.quality = 1;   // 0.35..1 effect-density multiplier; the frame loop lowers it automatically when frames run long
D.holes = [];   // black holes, filled in by weapons.js
D.zombies = [];
D.keys = { left: false, right: false, jump: false, down: false };
D.pointer = { x: 0, y: 0, has: false };
D.input = { firing: false, jumpBuf: 0, fireBuf: 0, grenadeBuf: 0 };

})(window.DD);
