let ctx = null;
let master = null;
let noiseBuf = null;
let last = 0;
let enabled = localStorage.getItem('coretap_sound') !== '0';

export function setSoundEnabled(v) {
  enabled = !!v;
  localStorage.setItem('coretap_sound', enabled ? '1' : '0');
}

export function isSoundEnabled() {
  return enabled;
}

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
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
  g.gain.exponentialRampToValueAtTime(vol, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.03);
}

function click(vol) {
  const start = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 0.05);
  src.connect(lp);
  lp.connect(g);
  g.connect(master);
  src.start(start);
  src.stop(start + 0.07);
}

export function playTapSound() {
  if (!enabled) return;
  initAudio();
  if (!ctx || ctx.state !== 'running') return;
  const p = performance.now();
  if (p - last < 30) return;
  last = p;
  const f = 520 + Math.random() * 50;
  tone(f, 0.08, 0.11);
  tone(f / 2, 0.1, 0.07);
  click(0.03 + Math.random() * 0.015);
}

export function playLuckySound() {
  if (!enabled) return;
  initAudio();
  if (!ctx || ctx.state !== 'running') return;
  tone(520, 0.07, 0.12);
  setTimeout(() => tone(680, 0.1, 0.12), 60);
  click(0.03);
}

export function playBuySound() {
  if (!enabled) return;
  initAudio();
  if (!ctx || ctx.state !== 'running') return;
  tone(400, 0.08, 0.12);
  setTimeout(() => tone(520, 0.1, 0.12), 75);
  click(0.03);
}