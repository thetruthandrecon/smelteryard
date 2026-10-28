// Collision: the player is a box (radius R, height H) moved one axis at a time against SOLIDS.
// Also ray tests used by shots, enemies and the camera.
import { SOLIDS, R, H, EPS } from '../core/world.js';
import { p } from './player.js';

export function overlapsBox(x, y, z, b, r, y0 = 0, y1 = H) {
  return x - r < b.max[0] && x + r > b.min[0] && y + y0 < b.max[1] && y + y1 > b.min[1] && z - r < b.max[2] && z + r > b.min[2];
}
// the last box moveAxis ran into (the player's footing after a vertical move)
export const hit = { box: null };
// move the player along one axis (0 x, 1 y, 2 z); returns 1 or -1 if it hit something, else 0
export function moveAxis(axis, d) {
  if (d === 0) return 0;
  if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
  let res = 0;
  for (const b of SOLIDS) {
    if (!overlapsBox(p.x, p.y, p.z, b, R)) continue;
    if (axis === 0) p.x = d > 0 ? b.min[0] - R - EPS : b.max[0] + R + EPS;
    else if (axis === 2) p.z = d > 0 ? b.min[2] - R - EPS : b.max[2] + R + EPS;
    else p.y = d > 0 ? b.min[1] - H - EPS : b.max[1];
    res = d > 0 ? 1 : -1;
    hit.box = b;
  }
  return res;
}
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
// the wall the player is touching, preferring the one they are pushing into
export function probeWall(wx, wz) {
  let best = null, bestScore = -Infinity;
  for (const [dx, dz] of DIRS) {
    const tx = p.x + dx * 0.08, tz = p.z + dz * 0.08;
    for (const b of SOLIDS) {
      if (b.kind === 'crusher' || b.kind === 'spike') continue;
      if (!overlapsBox(tx, p.y, tz, b, R, 0.35, H - 0.15)) continue;
      const score = dx * wx + dz * wz;
      if (score > bestScore) { bestScore = score; best = { nx: -dx, nz: -dz, push: score }; }
      break;
    }
  }
  return best;
}
// where along the segment o → o+d (0..1) it enters the box grown by pad; Infinity if it misses
export function rayBox(ox, oy, oz, dx, dy, dz, mn, mx, pad) {
  let tmin = 0, tmax = 1;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    const lo = mn[a] - pad, hi = mx[a] + pad;
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return Infinity; continue; }
    let t1 = (lo - o[a]) / d[a], t2 = (hi - o[a]) / d[a];
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}
export function segSolids(ox, oy, oz, dx, dy, dz, pad = 0) {
  let t = Infinity;
  for (const b of SOLIDS) { const h = rayBox(ox, oy, oz, dx, dy, dz, b.min, b.max, pad); if (h < t) t = h; }
  return t;
}
export function lineOfSight(ax, ay, az, bx, by, bz) { return segSolids(ax, ay, az, bx - ax, by - ay, bz - az, 0) >= 1; }
// the highest surface under a point, or -Infinity over the void
export function groundBelow(x, y, z) {
  let top = -Infinity;
  for (const b of SOLIDS) if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.max[1] <= y + 0.05 && b.max[1] > top) top = b.max[1];
  return top;
}
// push the player out of a moving box along the shortest way out
export function pushOut(b) {
  const opts = [
    [b.max[0] - (p.x - R), 0, 1], [(p.x + R) - b.min[0], 0, -1],
    [b.max[1] - p.y, 1, 1], [(p.y + H) - b.min[1], 1, -1],
    [b.max[2] - (p.z - R), 2, 1], [(p.z + R) - b.min[2], 2, -1],
  ];
  opts.sort((a, c) => a[0] - c[0]);
  const [depth, axis, sign] = opts[0];
  if (axis === 0) p.x += sign * (depth + EPS);
  else if (axis === 2) p.z += sign * (depth + EPS);
  else { p.y += sign * (depth + EPS); if (sign > 0) { p.vy = Math.max(p.vy, 0); p.grounded = true; p.ground = b; } else p.vy = Math.min(p.vy, 0); }
}
