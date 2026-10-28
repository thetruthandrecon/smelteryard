// Shared game state: constants, the current level's contents, input, camera angles, run state,
// and the event queue. The simulation pushes events; each lane reacts to them with on().
export const R = 0.4, H = 1.8, EPS = 1e-4, STEP = 1 / 120, MAX_HP = 16;

// the current level, filled by setupLevel() (levels lane)
export const SOLIDS = [], DYN = [], ENTS = [], CAPSULES = [], CHECKPOINTS = [], SIGNS = [], DECO = [], SPIKES = [], CRUSHERS = [];
export const LEVEL = { id: '', name: '', goal: null, cpCount: 0, named: {}, path: [12, -100] };

export const input = { moveX: 0, moveY: 0, jumpHeld: false, dashHeld: false, jumpQueued: false, dashQueued: false, fireHeld: false, fireQueued: false };
export const cam = { yaw: 0, pitch: -0.2 };
export const state = { mode: 'start', cp: 0, time: 0, worldT: 0, timing: false, started: false, cleared: false, falls: 0, kos: 0, kills: 0, shotsFired: 0, spikeHits: 0, lives: 3, noEnemies: false, best: null, tuneOpen: false };
export const isPlaying = () => state.mode === 'play' && !state.tuneOpen;

export const events = [];
const handlers = new Map();
// on('jump', (e) => ...) runs the function for every 'jump' event, once per frame, in the order registered
export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
}
export function dispatchEvents() {
  while (events.length) {
    const e = events.shift();
    const list = handlers.get(e.type);
    if (list) for (const fn of list) fn(e);
  }
}
