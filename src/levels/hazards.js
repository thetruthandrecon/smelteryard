// Moving level pieces: platforms that follow a path, and crushers on a fixed cycle.
import { DYN, state, events } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';

defineTuning('Hazards', [
  ['platformSpeed', 'Moving platform speed', 1, 0.3, 2, 0.05, '×'],
  ['crusherSpeed', 'Crusher speed', 1, 0.3, 2, 0.05, '×'],
  ['beltSpeed', 'Conveyor belt speed', 1, 0, 2, 0.05, '×'],
]);

// a crusher's cycle: up 1.4 s, shakes 0.5 s as a warning, slams, stays down 0.6 s, rises over 1.16 s
const CRUSH_CYCLE = 3.8;
export function crusherState(c, t) {
  const ph = (((t * tuning.crusherSpeed + c.offset) % CRUSH_CYCLE) + CRUSH_CYCLE) % CRUSH_CYCLE;
  if (ph < 1.4) return { bottom: c.yUp, mode: 'up', ph };
  if (ph < 1.9) return { bottom: c.yUp, mode: 'shake', ph };
  if (ph < 2.04) { const k = (ph - 1.9) / 0.14; return { bottom: c.yUp + (c.yDown - c.yUp) * k * k, mode: 'slam', ph }; }
  if (ph < 2.64) return { bottom: c.yDown, mode: 'down', ph };
  const k = (ph - 2.64) / 1.16;
  return { bottom: c.yDown + (c.yUp - c.yDown) * k, mode: 'rise', ph };
}
// move every platform and crusher to where it is at state.worldT; dx/dy/dz = how far it moved this step
export function updateHazards() {
  for (const b of DYN) {
    let cx, cy, cz;
    if (b.kind === 'platform') [cx, cy, cz] = b.path(state.worldT * tuning.platformSpeed);
    else {
      const s = crusherState(b, state.worldT);
      if (b.mode === 'slam' && s.mode !== 'slam') events.push({ type: 'slam', b });
      b.mode = s.mode; b.ph = s.ph;
      cx = 0; cy = s.bottom + b.hh; cz = b.zc;
    }
    if (b.init) { b.dx = cx - b.cx; b.dy = cy - b.cy; b.dz = cz - b.cz; } else { b.dx = b.dy = b.dz = 0; b.init = true; }
    b.cx = cx; b.cy = cy; b.cz = cz;
    b.min[0] = cx - b.hw; b.min[1] = cy - b.hh; b.min[2] = cz - b.hd;
    b.max[0] = cx + b.hw; b.max[1] = cy + b.hh; b.max[2] = cz + b.hd;
  }
}
export function resetHazards() {
  for (const b of DYN) { b.init = false; b.mode = undefined; }
  updateHazards();
}
