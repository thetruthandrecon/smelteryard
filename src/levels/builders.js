// Level building blocks and the level registry. A level is a function that calls these helpers.
import { SOLIDS, DYN, ENTS, CAPSULES, CHECKPOINTS, SIGNS, DECO, SPIKES, CRUSHERS, LEVEL } from '../core/world.js';
import { updateHazards } from './hazards.js';

// a static solid box; kind: floor, wall, crate, spike, belt (extra: { belt: [vx, vz] }) or door
export function box(x0, x1, y0, y1, z0, z1, kind = 'floor', extra) {
  const b = { min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], kind, ...extra };
  SOLIDS.push(b);
  return b;
}
// a moving box with half-sizes hw, hh, hd; a platform needs extra.path(t) → [x, y, z] (its centre)
export function dynBox(kind, hw, hh, hd, extra) {
  const b = { min: [0, 0, 0], max: [0, 0, 0], kind, dyn: true, hw, hh, hd, cx: 0, cy: 0, cz: 0, dx: 0, dy: 0, dz: 0, init: false, ...extra };
  SOLIDS.push(b); DYN.push(b);
  return b;
}
// a crusher spanning x -4..4 at z = zc; offset shifts its timing; it slams down to floorY
export const crusher = (zc, offset, floorY) => dynBox('crusher', 4.0, 1.5, 1.0, { zc, offset, yUp: floorY + 3.6, yDown: floorY });
export const capsule = (x, y, z) => CAPSULES.push({ x, y, z, active: true, timer: 0 });
// the first checkpoint of a level is the start
export const checkpoint = (x, y, z) => CHECKPOINTS.push({ x, y, z });
export const sign = (text, x, y, z) => SIGNS.push({ text, x, y, z });

export const LEVELS = {};
export function registerLevel(id, name, define) { LEVELS[id] = { name, define }; }

// empty the world and build level id into it
export function setupLevel(id) {
  for (const a of [SOLIDS, DYN, ENTS, CAPSULES, CHECKPOINTS, SIGNS, DECO, SPIKES, CRUSHERS]) a.length = 0;
  LEVEL.id = id; LEVEL.name = LEVELS[id].name; LEVEL.named = {};
  LEVELS[id].define();
  for (const b of SOLIDS) if (b.kind === 'spike') SPIKES.push(b);
  for (const b of DYN) if (b.kind === 'crusher') CRUSHERS.push(b);
  LEVEL.cpCount = CHECKPOINTS.length - 1;
  updateHazards();
}
