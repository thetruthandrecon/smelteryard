// The over-the-shoulder camera: follows the player, pulls in when a wall is behind, shakes on impacts.
import { SOLIDS, cam, on } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';
import { damp } from '../core/util.js';
import { camera } from '../core/render.js';
import { rayBox } from './physics.js';
import { p } from './player.js';

defineTuning('Camera', [
  ['lookSens', 'Look sensitivity', 1, 0.2, 3, 0.05, '×'],
  ['camDist', 'Distance', 4.2, 2, 8, 0.1, 'm'],
  ['camHeight', 'Height', 1.6, 0.8, 2.6, 0.05, 'm'],
  ['camShoulder', 'Shoulder offset', 0.65, -1.5, 1.5, 0.05, 'm'],
  ['fov', 'Field of view', 70, 55, 95, 1, '°'],
  ['invertY', 'Invert look up and down', false],
  ['slamShake', 'Boss slam shake', 0.35, 0, 1, 0.05, ''],
]);
camera.fov = tuning.fov; camera.updateProjectionMatrix();

export const camState = { fy: null, dist: tuning.camDist, fov: tuning.fov, shake: 0 };
export const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
// screen shake: raise it to at least v, or set it to exactly v
export function shake(v, set = false) { camState.shake = set ? v : Math.max(camState.shake, v); }
// snap the camera behind the player, looking down the course
export function resetView() { camState.fy = null; cam.yaw = 0; cam.pitch = -0.2; }
on('restart', () => { camState.fy = null; });
// the Warden's ground pound shakes the whole arena (0 in the tuning panel turns it off)
on('bossgroundslam', () => { if (tuning.slamShake > 0) shake(tuning.slamShake); });

export function updateCamera(dt, ix, iy, iz) {
  const T = tuning;
  if (camState.fy == null || Math.abs(camState.fy - iy) > 4) camState.fy = iy;
  else camState.fy = damp(camState.fy, iy, 14, dt);
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  const fx = -sy * cp, fy = sp, fz = -cy * cp, rx = cy, rz = -sy;
  const hx = ix, hy = camState.fy + T.camHeight, hz = iz;
  const sx = hx + rx * T.camShoulder, sz = hz + rz * T.camShoulder;
  const dx = sx - fx * T.camDist - hx, dy = -fy * T.camDist, dz = sz - fz * T.camDist - hz;
  let t = 1;
  for (const b of SOLIDS) { if (b.kind === 'crusher') continue; const h = rayBox(hx, hy, hz, dx, dy, dz, b.min, b.max, 0.22); if (h < t) t = h; }
  const full = Math.hypot(dx, dy, dz) || 1;
  const want = Math.max(0.45, t * full);
  camState.dist = want < camState.dist ? want : damp(camState.dist, want, 5, dt);
  const k = camState.dist / full;
  camState.shake = Math.max(0, camState.shake - dt);
  const sh = reduceMotion ? 0 : camState.shake * 0.5;
  camera.position.set(hx + dx * k + (Math.random() - 0.5) * sh, hy + dy * k + (Math.random() - 0.5) * sh, hz + dz * k + (Math.random() - 0.5) * sh);
  camera.lookAt(sx + fx * 30, hy + fy * 30, sz + fz * 30);
  const fovTarget = T.fov + (p.dashTimer > 0 && !reduceMotion ? 7 : 0);
  camState.fov = damp(camState.fov, fovTarget, 10, dt);
  if (Math.abs(camera.fov - camState.fov) > 0.01) { camera.fov = camState.fov; camera.updateProjectionMatrix(); }
}
