let ctx = null;
let master = null;
let last = 0;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function blip(freq, dur, vol) {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(vol, now + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

export function playTapSound() {
  const now = performance.now();
  if (now - last < 28) return;
  last = now;
  const f = 330 + Math.random() * 40;
  blip(f, 0.09, 0.11);
}

export function playLuckySound() {
  blip(540, 0.07, 0.12);
  setTimeout(() => blip(660, 0.1, 0.12), 55);
}

export function playBuySound() {
  blip(440, 0.08, 0.12);
  setTimeout(() => blip(554, 0.1, 0.12), 75);
}