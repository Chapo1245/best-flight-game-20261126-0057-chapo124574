// audio.js — synthesized sound: engine hum, wind, chimes, alarms. No audio files.
// One job: make noise from the plane state, and stay silent until the player acts.

export function createAudio() {
  return {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    muted: false,
    enabled: false,
  };
}

// Called from the first user gesture (key/click). Browsers forbid audio before that.
export function ensureAudio(a) {
  if (a.ctx || a.muted) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    a.ctx = new AC();
    a.enabled = true;
    // Engine: two detuned saws through a low-pass, gain follows throttle.
    a.engineOsc = a.ctx.createOscillator();
    a.engineOsc.type = 'sawtooth';
    a.engineOsc.frequency.value = 62;
    const osc2 = a.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = 93;
    const filter = a.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    a.engineGain = a.ctx.createGain();
    a.engineGain.gain.value = 0.0;
    a.engineOsc.connect(filter);
    osc2.connect(filter);
    filter.connect(a.engineGain);
    a.engineGain.connect(a.ctx.destination);
    a.engineOsc.start();
    osc2.start();
    a.engineOsc2 = osc2;
    // Wind: looped noise buffer through a band-pass.
    const len = a.ctx.sampleRate * 2;
    const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    a.windSrc = a.ctx.createBufferSource();
    a.windSrc.buffer = buf;
    a.windSrc.loop = true;
    const bp = a.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    a.windGain = a.ctx.createGain();
    a.windGain.gain.value = 0.0;
    a.windSrc.connect(bp);
    bp.connect(a.windGain);
    a.windGain.connect(a.ctx.destination);
    a.windSrc.start();
  } catch (e) {
    a.enabled = false;
  }
}

export function updateAudio(a, plane, dt) {
  if (!a.enabled || !a.ctx) return;
  if (a.ctx.state === 'suspended') void a.ctx.resume();
  const t = a.ctx.currentTime;
  const rpm = 46 + plane.throttle * 58 + (plane.stalled ? -14 : 0);
  a.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
  if (a.engineOsc2) a.engineOsc2.frequency.setTargetAtTime(rpm * 1.5, t, 0.08);
  const target = plane.engineOut ? 0 : 0.028 + plane.throttle * 0.05;
  a.engineGain.gain.setTargetAtTime(target, t, 0.1);
  const wind = Math.min(0.09, Math.max(0, (plane.speedKt - 70) / 1600));
  a.windGain.gain.setTargetAtTime(wind, t, 0.15);
  void dt;
}

function beep(a, freq, dur, type, gain, when = 0) {
  if (!a.enabled || !a.ctx || a.muted) return;
  const t = a.ctx.currentTime + when;
  const o = a.ctx.createOscillator();
  o.type = type || 'sine';
  o.frequency.value = freq;
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain || 0.12, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(a.ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

export function playRingChime(a) {
  beep(a, 880, 0.18, 'sine', 0.14);
  beep(a, 1318, 0.28, 'sine', 0.12, 0.09);
}

export function playCheckpointChime(a) {
  beep(a, 659, 0.16, 'triangle', 0.13);
  beep(a, 988, 0.24, 'triangle', 0.11, 0.08);
}

export function playAlarm(a) {
  beep(a, 440, 0.14, 'square', 0.05);
  beep(a, 440, 0.14, 'square', 0.05, 0.18);
}

export function playThud(a) {
  if (!a.enabled || !a.ctx || a.muted) return;
  const t = a.ctx.currentTime;
  const o = a.ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.22, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(a.ctx.destination);
  o.start(t);
  o.stop(t + 0.32);
}

export function playCrash(a) {
  if (!a.enabled || !a.ctx || a.muted) return;
  const t = a.ctx.currentTime;
  const len = a.ctx.sampleRate * 0.7;
  const buf = a.ctx.createBuffer(1, len, a.ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  const g = a.ctx.createGain();
  g.gain.value = 0.3;
  src.connect(g);
  g.connect(a.ctx.destination);
  src.start(t);
}
