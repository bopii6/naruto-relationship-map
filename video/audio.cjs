/*
 * 90 秒声轨 v2：120 BPM 太鼓推进 + 低音 ostinato + 弦乐铺底 + 和风旋律。
 * 目标不是“燃到吵”，而是有推进感、有段落起伏，能托住画面。
 *
 * 输出 out/audio_raw.wav，再用 ffmpeg 做压缩 / 响度处理，得到 out/audio.wav。
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SR = 44100;
const DUR = 90;
const N = SR * DUR;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const stem = () => [new Float32Array(N), new Float32Array(N)];
const DRONE = stem();
const PERC = stem();
const MUSIC = stem();
const FX = stem();

let _seed = 0x9e3779b9;
function rnd() {
  _seed |= 0;
  _seed = _seed + 0x6D2B79F5 | 0;
  let t = Math.imul(_seed ^ _seed >>> 15, 1 | _seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

function put(st, i, v, pan = 0) {
  if (i < 0 || i >= N) return;
  if (pan === 0) {
    st[0][i] += v * 0.70710678;
    st[1][i] += v * 0.70710678;
  } else {
    const a = (pan + 1) * Math.PI / 4;
    st[0][i] += v * Math.cos(a);
    st[1][i] += v * Math.sin(a);
  }
}

/* ── 低频 drone ─────────────────────────────────────────────────── */
function drone(notes, t0, t1, amp) {
  const i0 = Math.floor(t0 * SR), i1 = Math.min(N, Math.floor(t1 * SR));
  notes.forEach((f, k) => {
    let ph = 0, ph2 = 0;
    const det = 1 + (k % 2 ? 0.0016 : -0.0016);
    for (let i = i0; i < i1; i++) {
      const t = i / SR;
      const env = smooth(t0, t0 + 3, t) * (1 - smooth(t1 - 3, t1, t));
      const lfo = 0.78 + 0.22 * Math.sin(TAU * 0.055 * t + k * 1.7);
      ph += f * det / SR; ph -= Math.floor(ph);
      ph2 += f * 2.004 / SR; ph2 -= Math.floor(ph2);
      const v = amp * env * lfo * (Math.sin(TAU * ph) + 0.28 * Math.sin(TAU * ph2));
      put(DRONE, i, v, (k % 2 ? 0.2 : -0.2));
    }
  });
}

drone([55, 82.5, 110, 164.8], 0, 27, 0.025);
drone([55, 82.5, 110, 130.8], 22, 66, 0.022);
drone([55, 82.5, 110, 146.8], 60, 90, 0.020);
drone([36.7], 0, 90, 0.016);

/* ── 空气噪底 ───────────────────────────────────────────────────── */
(function air() {
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const w = rnd() * 2 - 1;
    lp += 0.055 * (w - lp);
    const env = smooth(0, 3.5, t) * (1 - smooth(87, 90, t));
    put(DRONE, i, lp * 0.012 * env * (0.7 + 0.3 * Math.sin(TAU * 0.04 * t)), Math.sin(t * 0.1) * 0.3);
  }
})();

/* ── 太鼓 / 締太鼓 / 军鼓 ────────────────────────────────────────── */
function taiko(t0, amp, pan = 0, pitch = 1) {
  const dur = 0.9;
  const i0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let j = 0; j < dur * SR; j++) {
    const t = j / SR;
    const f = (44 + 58 * Math.exp(-t * 10)) * pitch;
    ph += TAU * f / SR;
    const env = Math.exp(-t * 5.1) * (1 - Math.exp(-t * 130));
    const click = (rnd() * 2 - 1) * Math.exp(-t * 80) * 0.32;
    const sub = Math.sin(TAU * 38 * pitch * t) * Math.exp(-t * 2.4) * 0.38;
    put(PERC, i0 + j, (Math.sin(ph) * env + click + sub) * amp, pan);
  }
}

function shime(t0, amp, pan = 0) {
  const dur = 0.16;
  const i0 = Math.floor(t0 * SR);
  for (let j = 0; j < dur * SR; j++) {
    const t = j / SR;
    const env = Math.exp(-t * 45) * (1 - Math.exp(-t * 400));
    const v = (Math.sin(TAU * 1360 * t) * 0.7 + (rnd() * 2 - 1) * 0.3) * env * amp;
    put(PERC, i0 + j, v, pan);
  }
}

function snareRoll(t0, t1, a0, a1) {
  for (let t = t0; t < t1; t += 0.0625) {
    const u = (t - t0) / (t1 - t0);
    const accent = Math.round((t - t0) / 0.25) % 4 === 0 ? 1.25 : 1;
    const amp = lerp(a0, a1, u) * accent;
    const i0 = Math.floor(t * SR);
    for (let j = 0; j < 0.055 * SR; j++) {
      const tt = j / SR;
      const env = Math.exp(-tt * 58);
      const v = ((rnd() * 2 - 1) * 0.8 + Math.sin(TAU * 190 * tt) * 0.25) * env * amp;
      put(PERC, i0 + j, v, 0);
    }
  }
}

function fill(t0, t1, amp) {
  for (let t = t0; t < t1; t += 0.125) {
    const u = (t - t0) / (t1 - t0);
    taiko(t, amp * (0.35 + 0.65 * u), (u - .5) * 0.5, 1.15);
  }
}

/* ── 低音 ostinato ──────────────────────────────────────────────── */
function bassNote(t0, freq, dur, amp, pan = 0) {
  const i0 = Math.floor(t0 * SR);
  let ph = 0, lp = 0;
  for (let j = 0; j < dur * SR; j++) {
    const t = j / SR;
    ph += freq / SR; ph -= Math.floor(ph);
    const saw = 2 * ph - 1;
    lp += 0.065 * (saw - lp);
    const env = Math.exp(-t * 7.2) * (1 - Math.exp(-t * 320));
    const click = (rnd() * 2 - 1) * Math.exp(-t * 220) * 0.22;
    const v = (lp * 0.82 + Math.sin(TAU * freq * t) * 0.30 + click) * env * amp;
    put(MUSIC, i0 + j, v, pan);
  }
}

/* ── 弦乐铺底 ───────────────────────────────────────────────────── */
function padChord(t0, dur, freqs, amp) {
  const i0 = Math.floor(t0 * SR);
  const phases = [];
  for (let i = 0; i < freqs.length * 2; i++) phases.push(0);
  let lp = 0;
  for (let j = 0; j < dur * SR; j++) {
    const t = j / SR;
    let sum = 0;
    let k = 0;
    for (const f of freqs) {
      for (const det of [0.997, 1.003]) {
        phases[k] += f * det / SR;
        phases[k] -= Math.floor(phases[k]);
        sum += 2 * phases[k] - 1;
        k++;
      }
    }
    lp += 0.085 * (sum - lp);
    const env = smooth(0, 0.22, t) * (1 - smooth(dur - 0.35, dur, t));
    put(MUSIC, i0 + j, lp * env * amp, 0);
  }
}

/* ── 和风旋律：笛 / 拨弦 / 铜管 ─────────────────────────────────── */
function flute(t0, dur, freq, amp, pan = 0) {
  const i0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let j = 0; j < dur * SR; j++) {
    const t = j / SR;
    const vib = 1 + 0.006 * Math.sin(TAU * 5.2 * t + freq * 0.01);
    ph += freq * vib / SR;
    const env = smooth(0, 0.1, t) * (1 - smooth(dur - 0.18, dur, t));
    const breath = (rnd() * 2 - 1) * 0.055;
    const v = (Math.sin(TAU * ph) + 0.18 * Math.sin(TAU * ph * 2) + breath) * env * amp;
    put(MUSIC, i0 + j, v, pan);
  }
}

function pluck(t0, freq, amp, pan = 0, dur = 0.7) {
  const len = Math.max(2, Math.floor(SR / freq));
  const buf = new Float32Array(len);
  for (let i = 0; i < len; i++) buf[i] = rnd() * 2 - 1;
  let idx = 0;
  const i0 = Math.floor(t0 * SR);
  for (let j = 0; j < dur * SR; j++) {
    const cur = buf[idx];
    const nxt = buf[(idx + 1) % len];
    buf[idx] = (cur + nxt) * 0.5 * 0.996;
    idx = (idx + 1) % len;
    const env = Math.exp(-j / SR * 3.2);
    put(MUSIC, i0 + j, cur * env * amp, pan);
  }
}

function brassStab(t0, amp) {
  const notes = [220, 261.63, 329.63, 440];
  const i0 = Math.floor(t0 * SR);
  const dur = 0.75;
  const phases = notes.map(() => 0);
  let lp = 0;
  for (let j = 0; j < dur * SR; j++) {
    const t = j / SR;
    let sum = 0;
    for (let k = 0; k < notes.length; k++) {
      phases[k] += notes[k] / SR; phases[k] -= Math.floor(phases[k]);
      sum += 2 * phases[k] - 1;
    }
    lp += 0.18 * (sum - lp);
    const env = (1 - Math.exp(-t * 180)) * Math.exp(-t * 4.2);
    put(MUSIC, i0 + j, lp * env * amp, 0);
  }
}

/* ── 冲击 / 风声 / 钟 / gong ────────────────────────────────────── */
function impact(t0, amp) {
  const i0 = Math.floor(t0 * SR);
  let ph = 0;
  for (let j = 0; j < 1.6 * SR; j++) {
    const t = j / SR;
    const f = 46 - 12 * Math.min(t, 1);
    ph += TAU * f / SR;
    const env = Math.exp(-t * 2.4);
    const thump = Math.sin(ph) * env;
    const noise = (rnd() * 2 - 1) * Math.exp(-t * 18) * 0.28;
    put(PERC, i0 + j, (thump + noise) * amp, 0);
  }
}

function riser(t0, dur, amp) {
  const i0 = Math.floor(t0 * SR);
  let lp = 0;
  for (let j = 0; j < dur * SR; j++) {
    const u = j / (dur * SR);
    const t = j / SR;
    const w = rnd() * 2 - 1;
    lp += (0.03 + 0.22 * u) * (w - lp);
    const sweep = Math.sin(TAU * (170 + 1250 * u * u) * t) * 0.35;
    const env = Math.pow(u, 2.1) * (1 - smooth(0.94, 1, u));
    put(FX, i0 + j, (lp * 0.8 + sweep) * env * amp, Math.sin(u * 4) * 0.25);
  }
}

function bell(t0, freq, amp, pan = 0) {
  const parts = [
    [1, 1.0, 1.5], [2.01, 0.34, 1.0], [3.92, 0.16, 0.7], [5.43, 0.08, 0.5]
  ];
  const i0 = Math.floor(t0 * SR);
  for (let j = 0; j < 2.2 * SR; j++) {
    const t = j / SR;
    let v = 0;
    for (const [r, a, d] of parts) v += Math.sin(TAU * freq * r * t) * a * Math.exp(-t / d);
    v *= (1 - Math.exp(-t * 120)) * amp;
    put(FX, i0 + j, v, pan);
  }
}

function gong(t0, amp) {
  const i0 = Math.floor(t0 * SR);
  for (let j = 0; j < 4.2 * SR; j++) {
    const t = j / SR;
    const env = Math.exp(-t * 1.0) * (1 - Math.exp(-t * 50));
    const v = (
      Math.sin(TAU * 110 * t) * 0.5 +
      Math.sin(TAU * 164.8 * t) * 0.3 +
      Math.sin(TAU * 220 * t) * 0.18 +
      Math.sin(TAU * 329.6 * t) * 0.08
    ) * env * amp;
    put(MUSIC, i0 + j, v, 0);
  }
}

/* ══════════════════════════════════════════════════════════════════
   编曲
   ══════════════════════════════════════════════════════════════════ */
const PROG = [
  { root: 55, notes: [55, 65.4, 82.4, 110] },     // Am
  { root: 43.65, notes: [43.65, 55, 65.4, 87.3] }, // F
  { root: 65.4, notes: [65.4, 82.4, 98, 130.8] },  // C
  { root: 49, notes: [49, 61.7, 73.4, 98] }        // G
];

function level(t) {
  if (t < 8) return 0;
  if (t < 24) return 0.42;
  if (t < 42) return 0.70;
  if (t < 62) return 0.58;
  if (t < 78) return 0.88;
  return 1.0;
}

/* 段落重音 */
[0.55, 4.2, 7.45, 24, 42, 62, 78, 86.05].forEach((t, i) => impact(t, i < 2 ? 0.24 : 0.42));

/* 太鼓 groove：8s 进入，120 BPM，2 秒一小节 */
for (let bar = 8; bar < 86; bar += 2) {
  const lv = level(bar);
  const accent = (bar % 8 === 0) ? 1.25 : 1;
  taiko(bar, 0.17 * lv * accent);
  taiko(bar + 1.0, 0.125 * lv);
  if (lv > 0.5) {
    taiko(bar + 0.5, 0.060 * lv);
    taiko(bar + 1.5, 0.075 * lv);
    shime(bar + 0.5, 0.022 * lv);
    shime(bar + 1.5, 0.018 * lv);
  }
  if (lv > 0.8) {
    taiko(bar + 0.75, 0.055 * lv);
    taiko(bar + 1.25, 0.050 * lv);
    shime(bar + 0.75, 0.016 * lv);
  }
  if (bar >= 62 && bar < 78) {
    taiko(bar + 0.25, 0.070 * lv, -0.2);
    taiko(bar + 1.75, 0.060 * lv, 0.2);
  }
}

/* 转场前的加花 / 年表段的滚奏 */
fill(22.5, 24, 0.10);
fill(40.5, 42, 0.12);
fill(60.5, 62, 0.12);
fill(76.0, 78, 0.14);
snareRoll(78, 85.8, 0.012, 0.070);
for (let t = 78; t < 85.8; t += 0.25) {
  const u = (t - 78) / 7.8;
  taiko(t, 0.045 + 0.095 * u, (u - .5) * 0.3, 1.12);
}

/* 低音 ostinato */
const BASS_PAT = [1, 1, 2, 1, 1.5, 1, 2, 1.5];
let bi = 0;
for (let t = 8; t < 86; t += 0.25, bi++) {
  const bar = Math.floor(bi / 8);
  const k = bi % 8;
  const ch = PROG[bar % 4];
  const lv = level(t);
  bassNote(t, ch.root * BASS_PAT[k], 0.22, 0.022 + 0.026 * lv);
}

/* 弦乐 */
for (let t = 8; t < 86; t += 2) {
  const ch = PROG[Math.floor((t - 8) / 2) % 4];
  padChord(t, 1.98, ch.notes, 0.006 + 0.007 * level(t));
}
padChord(86, 3.8, [55, 65.4, 82.4, 110], 0.018);

/* 铜管重音 */
[24, 42, 62, 78, 86].forEach(t => brassStab(t, 0.055));

/* 旋律：结构段的上行短句 */
[24, 32, 40].forEach((t0, idx) => {
  let t = t0;
  const phrase = idx === 2
    ? [[440, .28], [523.25, .28], [659.25, .28], [880, .5]]
    : [[440, .28], [523.25, .28], [659.25, .28], [783.99, .5]];
  for (const [f, d] of phrase) {
    flute(t, d, f, 0.022, (f > 600 ? 0.25 : -0.25));
    t += d;
  }
});

/* 旋律：聚焦段的四个落点 */
[[46.5, 440], [50.3, 523.25], [54.1, 659.25], [57.9, 783.99]].forEach(([t, f], i) => {
  flute(t, 1.25, f, 0.030, i % 2 ? 0.25 : -0.25);
});

/* 旋律：情感段的低音长音 */
[[62.5, 220], [66.5, 261.63], [70.5, 329.63], [74.5, 392]].forEach(([t, f]) => {
  flute(t, 2.6, f, 0.018, 0);
});

/* 旋律：年表段的上升琶音 */
[[78.5, 440], [80.5, 523.25], [82.5, 659.25], [84.5, 880]].forEach(([t, f]) => {
  flute(t, 0.85, f, 0.026, 0.15);
});

/* 拨弦点缀 */
[10, 18, 26, 34, 44, 52, 64, 72, 80].forEach((t, i) => {
  pluck(t, i % 2 ? 523.25 : 440, 0.016, i % 2 ? 0.35 : -0.35, 0.6);
});

/* 钟声：保留原来的情绪落点，但降到伴奏层 */
[[46.5, 659.3], [50.3, 784], [54.1, 880], [57.9, 1174.7]].forEach(([t, f], i) => {
  bell(t, f, 0.016, i % 2 ? 0.25 : -0.25);
});
[[66.5, 587.3], [70, 698.5], [73, 880], [76, 1046.5]].forEach(([t, f], i) => {
  bell(t, f, 0.012, i % 2 ? -0.3 : 0.3);
});
[[80.2, 523.3], [82, 659.3], [84, 784]].forEach(([t, f]) => {
  bell(t, f, 0.010, 0);
});

/* 转场风声 */
riser(5.8, 1.7, 0.14);
riser(22.8, 1.2, 0.12);
riser(40.8, 1.2, 0.13);
riser(60.8, 1.2, 0.13);
riser(76.2, 1.6, 0.16);

/* 收尾 */
gong(86.05, 0.17);

/* ══════════════════════════════════════════════════════════════════
   混音
   ══════════════════════════════════════════════════════════════════ */
const L = new Float32Array(N);
const R = new Float32Array(N);
let peak = 0;

for (let i = 0; i < N; i++) {
  const t = i / SR;
  /* 120 BPM 的轻微“抽吸”，让弦乐和低音跟着太鼓走 */
  const pump = (t >= 8 && t < 86) ? 1 - 0.15 * Math.exp(-((t % 0.5) / 0.09)) : 1;
  const l = DRONE[0][i] * 0.78 + PERC[0][i] * 0.95 + MUSIC[0][i] * pump * 0.90 + FX[0][i] * 0.72;
  const r = DRONE[1][i] * 0.78 + PERC[1][i] * 0.95 + MUSIC[1][i] * pump * 0.90 + FX[1][i] * 0.72;
  L[i] = l; R[i] = r;
  const a = Math.max(Math.abs(l), Math.abs(r));
  if (a > peak) peak = a;
}

const gain = 0.90 / (peak || 1);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fade = smooth(0, 1.2, t) * (1 - smooth(88.0, 90, t));
  L[i] = Math.tanh(L[i] * gain * 1.08) * fade;
  R[i] = Math.tanh(R[i] * gain * 1.08) * fade;
}

/* ── 写 WAV ─────────────────────────────────────────────────────── */
const outDir = path.join(__dirname, 'out');
fs.mkdirSync(outDir, { recursive: true });
const rawPath = path.join(outDir, 'audio_raw.wav');
const wav = Buffer.alloc(44 + N * 4);
wav.write('RIFF', 0);
wav.writeUInt32LE(36 + N * 4, 4);
wav.write('WAVE', 8);
wav.write('fmt ', 12);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(SR, 24);
wav.writeUInt32LE(SR * 4, 28);
wav.writeUInt16LE(4, 32);
wav.writeUInt16LE(16, 34);
wav.write('data', 36);
wav.writeUInt32LE(N * 4, 40);

let off = 44;
for (let i = 0; i < N; i++) {
  wav.writeInt16LE(Math.round(clamp(L[i], -1, 1) * 32767), off); off += 2;
  wav.writeInt16LE(Math.round(clamp(R[i], -1, 1) * 32767), off); off += 2;
}
fs.writeFileSync(rawPath, wav);
console.log('wrote', rawPath, (wav.length / 1048576).toFixed(1) + ' MB');

const finalPath = path.join(outDir, 'audio.wav');
const ff = spawnSync('ffmpeg', [
  '-y', '-i', rawPath,
  '-af', 'highpass=f=28,lowpass=f=14000,acompressor=threshold=0.10:ratio=2.5:attack=10:release=180,loudnorm=I=-14:TP=-1.0:LRA=9',
  '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le',
  finalPath
], { stdio: 'inherit' });
if (ff.status !== 0) throw new Error('ffmpeg audio processing failed');
console.log('wrote', finalPath);
