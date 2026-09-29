/* audio.js: all sound is synthesised with Web Audio (no files).
 * Booms are layered: a bright noise crack, a filtered noise body, a sine thump,
 * a sub drop and a long rumble tail, all through a compressor and a small reverb. */
(function (D) {
'use strict';
let AC = null, master = null, bus = null, verb = null, noiseBuf = null, muted = false;
const lastAt = {};
try { muted = localStorage.getItem('dd2-muted') === '1'; } catch (_) {}

function init() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = muted ? 0 : 0.9;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.22;
    bus = AC.createGain(); bus.gain.value = 1;
    bus.connect(comp); comp.connect(master); master.connect(AC.destination);
    const nl = AC.sampleRate * 2; noiseBuf = AC.createBuffer(1, nl, AC.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
    // Reverb tail: exponentially decaying stereo noise.
    const il = (AC.sampleRate * 1.5) | 0, ir = AC.createBuffer(2, il, AC.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < il; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / il, 3.2); }
    verb = AC.createConvolver(); verb.buffer = ir;
    const vg = AC.createGain(); vg.gain.value = 0.4; verb.connect(vg); vg.connect(comp);
  } catch (_) { AC = null; }
}

function route(g, wet) {
  g.connect(bus);
  if (wet) { const w = AC.createGain(); w.gain.value = wet; g.connect(w); w.connect(verb); }
}
function tone(type, f0, f1, dur, vol, o) {
  o = o || {};
  const t = AC.currentTime + (o.delay || 0), osc = AC.createOscillator(), g = AC.createGain();
  osc.type = type; osc.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (o.atk || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let out = osc;
  if (o.lp) { const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); out = f; }
  out.connect(g); route(g, o.wet); osc.start(t); osc.stop(t + dur + 0.03);
}
function noise(dur, ftype, f0, f1, vol, o) {
  o = o || {};
  const t = AC.currentTime + (o.delay || 0), s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = ftype; f.Q.value = o.q || 0.8;
  f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + (o.atk || 0.003));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); route(g, o.wet); s.start(t, Math.random() * Math.max(0, 2 - dur - 0.05)); s.stop(t + dur + 0.02);
}

function boom(size, v) {
  const s = Math.max(0.35, Math.min(2.4, size));
  noise(0.09, 'highpass', 3000, 1200, 0.5 * v);                                       // crack
  noise(0.5 + 0.45 * s, 'lowpass', 2600, 110, 0.75 * v, { wet: 0.25, q: 0.6 });        // body
  tone('sine', 130 / Math.sqrt(s), 26, 0.55 + 0.35 * s, 1.0 * v, { atk: 0.002 });       // thump
  if (s > 0.8) tone('sine', 62, 22, 1.1 + 0.3 * s, 0.7 * v, { delay: 0.03 });          // sub drop
  noise(1.0 + 0.8 * s, 'lowpass', 340, 55, 0.4 * v, { delay: 0.06, wet: 0.5, q: 0.4 });  // rumble tail
  if (s > 1.3) noise(0.35, 'bandpass', 1400, 200, 0.4 * v, { delay: 0.12 });            // debris rain
}

const SFX = {
  pistol: v => { noise(0.1, 'bandpass', 2800, 900, 0.5 * v, { q: 1 }); tone('square', 540, 90, 0.09, 0.1 * v); tone('sine', 160, 55, 0.13, 0.5 * v); },
  smg: v => { noise(0.06, 'bandpass', 3400, 1200, 0.36 * v, { q: 1 }); tone('square', 720, 120, 0.05, 0.08 * v); tone('sine', 180, 70, 0.07, 0.32 * v); },
  shotgun: v => {
    noise(0.3, 'lowpass', 4200, 260, 0.85 * v, { wet: 0.15 }); noise(0.05, 'highpass', 3000, 1500, 0.5 * v);
    tone('sine', 120, 32, 0.3, 1.0 * v); tone('sawtooth', 320, 60, 0.12, 0.2 * v, { lp: 1500 });
    tone('square', 900, 300, 0.04, 0.07 * v, { delay: 0.33 }); tone('square', 700, 260, 0.05, 0.07 * v, { delay: 0.43 });
  },
  minigun: v => { noise(0.045, 'bandpass', 2400, 800, 0.3 * v, { q: 1 }); tone('sine', 140, 60, 0.05, 0.26 * v); },
  flamestart: v => { noise(0.2, 'lowpass', 1200, 300, 0.3 * v); },
  railcharge: v => { tone('sawtooth', 160, 2600, 0.36, 0.16 * v, { lp: 5000 }); tone('sine', 320, 3400, 0.36, 0.12 * v); },
  rail: v => {
    noise(0.6, 'bandpass', 7000, 180, 0.8 * v, { q: 0.7, wet: 0.3 }); tone('sawtooth', 2600, 50, 0.5, 0.4 * v, { lp: 6000 });
    tone('sine', 95, 24, 0.9, 1.0 * v); noise(0.08, 'highpass', 4000, 2000, 0.6 * v);
  },
  rocket: v => { noise(0.55, 'bandpass', 500, 2200, 0.5 * v, { q: 0.6, atk: 0.06 }); tone('sine', 210, 55, 0.3, 0.55 * v); noise(0.1, 'highpass', 2500, 1200, 0.3 * v); },
  throw: v => { tone('triangle', 300, 520, 0.09, 0.09 * v); noise(0.08, 'bandpass', 900, 1800, 0.12 * v); },
  tick: v => { noise(0.03, 'highpass', 3500, 2500, 0.12 * v); },
  pop: v => { noise(0.07, 'lowpass', 2000, 380, 0.22 * v); tone('sine', 210, 80, 0.07, 0.16 * v); },
  whistle: v => { tone('sine', 2000, 520, 1.0, 0.07 * v); tone('triangle', 1500, 400, 1.0, 0.04 * v); },
  plane: v => { noise(2.2, 'lowpass', 500, 260, 0.35 * v, { atk: 0.5, q: 0.5 }); tone('sawtooth', 76, 58, 2.2, 0.22 * v, { atk: 0.5, lp: 400 }); },
  beacon: v => { tone('square', 1250, 1250, 0.06, 0.09 * v); },
  holeopen: v => { tone('sawtooth', 320, 36, 0.7, 0.35 * v, { lp: 1200 }); noise(0.6, 'lowpass', 1600, 100, 0.3 * v); },
  holeend: v => { tone('sine', 50, 1100, 0.32, 0.5 * v); tone('sawtooth', 80, 700, 0.32, 0.2 * v, { lp: 3000 }); },
  groan: (v, p) => { const f = 95 + (p || 0) * 22; tone('sawtooth', f, f * 0.7, 0.55, 0.075 * v, { lp: 520, atk: 0.06 }); tone('sawtooth', f * 1.02, f * 0.72, 0.55, 0.05 * v, { lp: 480, atk: 0.06 }); },
  zhit: v => { noise(0.1, 'lowpass', 1500, 200, 0.32 * v); tone('sine', 115, 48, 0.11, 0.4 * v); },
  zdie: v => { noise(0.28, 'lowpass', 1900, 180, 0.5 * v); tone('sine', 92, 28, 0.32, 0.55 * v); tone('sawtooth', 200, 60, 0.22, 0.1 * v, { lp: 700 }); },
  hurt: v => { tone('sawtooth', 270, 75, 0.28, 0.28 * v, { lp: 900 }); noise(0.14, 'lowpass', 1400, 200, 0.4 * v); tone('sine', 100, 40, 0.18, 0.5 * v); },
  pickup: v => { tone('sine', 660, 660, 0.1, 0.2 * v); tone('sine', 990, 990, 0.16, 0.2 * v, { delay: 0.08 }); },
  jump: v => { tone('square', 260, 520, 0.08, 0.025 * v); },
  dash: v => { noise(0.2, 'bandpass', 600, 2600, 0.28 * v, { q: 0.7 }); },
  wave: v => { tone('square', 110, 110, 0.55, 0.13 * v, { lp: 500 }); tone('square', 165, 165, 0.55, 0.09 * v, { lp: 500, delay: 0.18 }); tone('sine', 55, 55, 0.8, 0.5 * v); },
  over: v => { tone('sawtooth', 300, 70, 1.1, 0.2 * v, { lp: 900 }); tone('sine', 80, 25, 1.4, 0.7 * v); noise(0.9, 'lowpass', 900, 80, 0.3 * v); },
  win: v => { [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.3, 0.16 * v, { delay: i * 0.11, wet: 0.3 })); },
  spit: v => { tone('sine', 950, 300, 0.16, 0.14 * v); noise(0.1, 'bandpass', 1800, 700, 0.15 * v); },
  splat: v => { noise(0.14, 'bandpass', 1600, 500, 0.28 * v); tone('sine', 140, 60, 0.1, 0.2 * v); },
  combo: (v, p) => { tone('triangle', 440 + (p || 0) * 55, 440 + (p || 0) * 55, 0.09, 0.09 * v); },
  click: v => { tone('square', 800, 500, 0.04, 0.06 * v); },
  smash: v => { boom(0.5, 0.6 * v); noise(0.2, 'bandpass', 900, 300, 0.4 * v); },
};
// Minimum gap between repeats, in seconds, so machine guns and blast chains don't stack into mush.
const GAP = { pop: 0.035, tick: 0.03, zhit: 0.04, splat: 0.05, groan: 0.25, smash: 0.15, smg: 0.04, minigun: 0.03, boom: 0.02, spit: 0.1, combo: 0.06, hurt: 0.15 };

D.sfx = function (name, vol, p) {
  if (!AC || muted) return;
  const now = AC.currentTime, gap = GAP[name] || 0;
  if (gap && now - (lastAt[name] || 0) < gap) return;
  lastAt[name] = now;
  vol = vol === undefined ? 1 : vol; if (vol < 0.03) return;
  if (name === 'boom') boom(p === undefined ? 1 : p, vol);
  else if (SFX[name]) SFX[name](vol, p);
};

/* Continuous loops (minigun whir, flames, black hole drone, crackle). */
const loops = {};
function makeLoop(id) {
  const g = AC.createGain(); g.gain.value = 0; g.connect(bus);
  const L = { g, on: false, nodes: [] };
  if (id === 'mini') {
    const o = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 900;
    o.connect(f); o2.connect(f); f.connect(g); o.start(); o2.start(); L.nodes = [o, o2]; L.f = f;
  } else if (id === 'flame' || id === 'crackle') {
    const s = AC.createBufferSource(), f = AC.createBiquadFilter();
    s.buffer = noiseBuf; s.loop = true; f.type = 'bandpass'; f.frequency.value = id === 'flame' ? 520 : 2400; f.Q.value = id === 'flame' ? 0.7 : 1.4;
    s.connect(f); f.connect(g); s.start(); L.nodes = [s]; L.f = f;
    if (id === 'crackle') { // random gating for a crackle feel
      const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.type = 'square'; lfo.frequency.value = 13; lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(g.gain); lfo.start(); L.nodes.push(lfo);
    }
  } else if (id === 'hole') {
    const o = AC.createOscillator(), o2 = AC.createOscillator(), f = AC.createBiquadFilter();
    o.type = 'sawtooth'; o2.type = 'sine'; f.type = 'lowpass'; f.frequency.value = 400;
    o.connect(f); o2.connect(f); f.connect(g); o.start(); o2.start(); L.nodes = [o, o2]; L.f = f;
  }
  return L;
}
D.loop = function (id, on, p) {
  if (!AC) return;
  let L = loops[id];
  if (!L) { if (!on) return; L = loops[id] = makeLoop(id); }
  const t = AC.currentTime;
  if (!on || muted) { if (L.on) { L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0, t, 0.05); L.on = false; } return; }
  L.on = true; p = p === undefined ? 1 : p;
  if (id === 'mini') {
    L.nodes[0].frequency.setTargetAtTime(38 + p * 240, t, 0.05); L.nodes[1].frequency.setTargetAtTime(76 + p * 480, t, 0.05);
    L.f.frequency.setTargetAtTime(500 + p * 1600, t, 0.05); L.g.gain.setTargetAtTime(0.03 + p * 0.06, t, 0.05);
  } else if (id === 'flame') { L.g.gain.setTargetAtTime(0.32, t, 0.04); L.f.frequency.setTargetAtTime(480 + Math.random() * 200, t, 0.03); }
  else if (id === 'crackle') { L.g.gain.setTargetAtTime(Math.min(0.09, 0.09 * p), t, 0.2); }
  else if (id === 'hole') {
    L.nodes[0].frequency.setTargetAtTime(38 + p * 110, t, 0.1); L.nodes[1].frequency.setTargetAtTime(27 + p * 60, t, 0.1);
    L.f.frequency.setTargetAtTime(220 + p * 900, t, 0.1); L.g.gain.setTargetAtTime(0.32, t, 0.1);
  }
};

D.audio = {
  init,
  get muted() { return muted; },
  setMuted(m) {
    muted = !!m; try { localStorage.setItem('dd2-muted', m ? '1' : '0'); } catch (_) {}
    if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, AC.currentTime, 0.02);
    if (muted) for (const id in loops) D.loop(id, false);
  },
  time() { return AC ? AC.currentTime : 0; },
};
})(window.DD);
