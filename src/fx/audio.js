// Procedural sound with WebAudio: building blocks every lane uses to make its own sounds.
import { clamp, store } from '../core/util.js';
import { p } from '../player/player.js';

const MUTE_KEY = 'smelter-yard:muted:v1';
let actx = null, master = null, noiseBuf = null, muted = !!store.get(MUTE_KEY, false);

// browsers only allow audio after a click or key press, so this runs when play starts
export function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    master = actx.createGain(); master.gain.value = 0.32; master.connect(actx.destination);
    noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.5, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}
export const isMuted = () => muted;
export function setMuted(v) { muted = !!v; store.set(MUTE_KEY, muted); if (muted) stopHum(); }
export const audioTime = () => (actx ? actx.currentTime : 0);

// a pitch sweep from f0 to f1 Hz
export function tone(f0, f1, dur, type = 'square', vol = 0.12, delay = 0) {
  if (!actx || muted || vol <= 0.001) return;
  const t = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.03);
}
// filtered noise sweeping from f0 to f1 Hz (whooshes, hisses, impacts)
export function hiss(dur, f0, f1, vol = 0.16, delay = 0) {
  if (!actx || muted || vol <= 0.001) return;
  const t = actx.currentTime + delay, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}
// one continuous hum (the charge-up sound); call every frame while it should play
let hum = null;
export function setHum(freq, vol) {
  if (!actx || muted) { stopHum(); return; }
  if (!hum) {
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sawtooth'; g.gain.value = 0.0001; o.connect(g).connect(master); o.start();
    hum = { o, g };
  }
  const t = actx.currentTime;
  hum.o.frequency.setTargetAtTime(freq, t, 0.03);
  hum.g.gain.setTargetAtTime(vol, t, 0.05);
}
export function stopHum() {
  if (!hum) return;
  try { hum.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.03); hum.o.stop(actx.currentTime + 0.1); } catch { /* already stopped */ }
  hum = null;
}
// volume falloff: 1 at the player, 0 at range metres away
export const near = (x, y, z, range) => clamp(1 - Math.hypot(x - p.x, y - p.y, z - p.z) / range, 0, 1);
