let ctx = null;
let master = null;
let noiseBuf = null;
let last = 0;

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.5);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function tone(freq, dur, vol) {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 0.014);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.03);
}

function click(vol) {
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const start = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(start);
  src.stop(start + 0.08);
  void now;
}

export function playTapSound() {
  initAudio();
  if (!ctx || ctx.state !== 'running') return;
  const p = performance.now();
  if (p - last < 26) return;
  last = p;
  const f = 560 + Math.random() * 70;
  tone(f, 0.09, 0.16);
  tone(f / 2, 0.11, 0.1);
  click(0.05 + Math.random() * 0.02);
}

export function playLuckySound() {
  initAudio();
  if (!ctx || ctx.state !== 'running') return;
  tone(560, 0.07, 0.16);
  setTimeout(() => tone(740, 0.1, 0.16), 60);
  click(0.05);
}

export function playBuySound() {
  initAudio();
  if (!ctx || ctx.state !== 'running') return;
  tone(430, 0.08, 0.16);
  setTimeout(() => tone(560, 0.11, 0.16), 75);
  click(0.05);
}