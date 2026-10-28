// Game controls: keyboard, mouse (pointer lock, or drag-to-look when the browser refuses), gamepad.
// UI keys (T, M, H, R, Esc) are handled in ui/ui.js.
import { input, cam, state, isPlaying } from '../core/world.js';
import { tuning } from '../core/tuning.js';
import { clamp } from '../core/util.js';
import { canvas } from '../core/render.js';
import { pause, beginPlay } from '../ui/ui.js';

const keys = new Set();
let pointerLocked = false, dragLook = false, dragging = false, suppressPauseUntil = 0, mouseDash = false, mouseFire = false, keyFire = false;
const pad = { prev: {} };
const MOVE_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'Space', 'ShiftLeft', 'ShiftRight', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

export function releaseAll() { keys.clear(); mouseDash = mouseFire = keyFire = false; }
export const isPointerLocked = () => pointerLocked;
// let go of the mouse without the pause screen popping up
export function releasePointer() {
  suppressPauseUntil = performance.now() + 400;
  if (document.pointerLockElement) document.exitPointerLock();
}

window.addEventListener('keydown', (e) => {
  const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (inField) return;
  if (MOVE_CODES.has(e.code)) e.preventDefault();
  if (!isPlaying()) return;
  keys.add(e.code);
  if (e.code === 'Space' && !e.repeat) input.jumpQueued = true;
  if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) input.dashQueued = true;
  if (e.code === 'KeyF' && !e.repeat) { input.fireQueued = true; keyFire = true; }
});
window.addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyF') keyFire = false; });
window.addEventListener('blur', () => { releaseAll(); if (state.mode === 'play' && !state.tuneOpen) pause(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('mousedown', (e) => {
  if (!isPlaying()) return;
  if (e.button === 2) { input.dashQueued = true; mouseDash = true; }
  if (e.button === 0) {
    if (pointerLocked) { input.fireQueued = true; mouseFire = true; }
    else { dragging = true; if (!dragLook) lockPointer(); }
  }
});
window.addEventListener('mouseup', (e) => { if (e.button === 2) mouseDash = false; if (e.button === 0) { dragging = false; mouseFire = false; } });
let lookIgnoreUntil = 0;
window.addEventListener('mousemove', (e) => {
  if (!isPlaying()) return;
  if (!pointerLocked && !(dragLook && dragging)) return;
  // Chrome can report one huge jump right after the mouse is captured; skip it
  if (performance.now() < lookIgnoreUntil || Math.abs(e.movementX) > 250 || Math.abs(e.movementY) > 250) return;
  const s = 0.0024 * tuning.lookSens;
  cam.yaw -= e.movementX * s;
  cam.pitch = clamp(cam.pitch - e.movementY * s * (tuning.invertY ? -1 : 1), -1.15, 0.75);
});
export function lockPointer() {
  if (dragLook) return;
  try {
    const r = canvas.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => { dragLook = true; });
  } catch { dragLook = true; }
}
document.addEventListener('pointerlockerror', () => { dragLook = true; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (pointerLocked) { dragLook = false; lookIgnoreUntil = performance.now() + 120; }
  else { mouseFire = false; if (state.mode === 'play' && !state.tuneOpen && performance.now() > suppressPauseUntil) pause(); }
});
canvas.addEventListener('click', () => { if (state.mode === 'play' && !pointerLocked && !dragLook) lockPointer(); });

function readPad() {
  let pads = [];
  try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : []; } catch { return null; }
  const gp = pads.find(Boolean);
  if (!gp) return null;
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82);
  const held = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
  const edge = (i) => { const now = held(i), was = !!pad.prev[i]; pad.prev[i] = now; return now && !was; };
  const aP = edge(0), bP = edge(1), rbP = edge(5), xP = edge(2), rtP = edge(7), startP = edge(9), backP = edge(8);
  return { lx: dz(gp.axes[0] || 0), ly: dz(gp.axes[1] || 0), rx: dz(gp.axes[2] || 0), ry: dz(gp.axes[3] || 0), jump: held(0), dash: held(1) || held(5), fire: held(2) || held(7), aP, dashP: bP || rbP, fireP: xP || rtP, startP, backP };
}
// once per frame: turn keys, mouse buttons and the gamepad into input.* for the simulation
export function gatherInput(dt) {
  const gp = readPad();
  if (gp) {
    const restartFrom = state.mode === 'clear' || state.mode === 'over';
    if (gp.startP) { if (state.mode === 'play') pause(); else beginPlay(restartFrom); }
    else if (gp.aP && state.mode !== 'play') beginPlay(restartFrom);
    if (gp.backP) beginPlay(true);
  }
  if (!isPlaying()) { input.moveX = input.moveY = 0; input.jumpHeld = input.dashHeld = input.fireHeld = false; return; }
  let mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  let my = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let jumpHeld = keys.has('Space'), dashHeld = keys.has('ShiftLeft') || keys.has('ShiftRight') || mouseDash, fireHeld = mouseFire || keyFire;
  const ls = 2.4 * tuning.lookSens;
  if (keys.has('ArrowLeft')) cam.yaw += ls * dt;
  if (keys.has('ArrowRight')) cam.yaw -= ls * dt;
  if (keys.has('ArrowUp')) cam.pitch = clamp(cam.pitch + ls * 0.7 * dt, -1.15, 0.75);
  if (keys.has('ArrowDown')) cam.pitch = clamp(cam.pitch - ls * 0.7 * dt, -1.15, 0.75);
  if (gp) {
    if (Math.abs(gp.lx) > 0 || Math.abs(gp.ly) > 0) { mx = gp.lx; my = -gp.ly; }
    cam.yaw -= gp.rx * 3.0 * tuning.lookSens * dt;
    cam.pitch = clamp(cam.pitch - gp.ry * 2.2 * tuning.lookSens * dt * (tuning.invertY ? -1 : 1), -1.15, 0.75);
    jumpHeld = jumpHeld || gp.jump; dashHeld = dashHeld || gp.dash; fireHeld = fireHeld || gp.fire;
    if (gp.aP) input.jumpQueued = true;
    if (gp.dashP) input.dashQueued = true;
    if (gp.fireP) input.fireQueued = true;
  }
  input.moveX = mx; input.moveY = my; input.jumpHeld = jumpHeld; input.dashHeld = dashHeld; input.fireHeld = fireHeld;
}
