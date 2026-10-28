// The arm cannon: aiming, tap shots, two charge levels, shot flight and hits.
import { ENTS, input, cam, state, events, on } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';
import { clamp } from '../core/util.js';
import { makeOrb } from '../core/render.js';
import { segSolids, rayBox } from '../player/physics.js';
import { p } from '../player/player.js';
import { shake } from '../player/camera.js';
import { entMin, entMax, damageEnt } from '../enemies/enemies.js';
import { emit, burst, C_TEAL, C_WHITE, C_AMBER } from '../fx/particles.js';
import { tone, hiss } from '../fx/audio.js';

defineTuning('Combat', [
  ['chargeTime1', 'Charge to level 1', 0.45, 0.2, 1, 0.05, 's'],
  ['chargeTime2', 'Charge to level 2', 1.3, 0.6, 2.5, 0.05, 's'],
  ['shotSpeed', 'Shot speed', 45, 20, 80, 1, 'm/s'],
  // a full charge takes 1.3 s, in which tapping does about 8 damage, so charging has to beat that
  ['chargeDamage1', 'Charge level 1 damage', 4, 1, 10, 1, ''],
  ['chargeDamage2', 'Charge level 2 damage', 12, 2, 30, 1, ''],
  // soft lock-on: a shot aimed just beside a lockable target (the boss) bends onto it, and keeps
  // turning toward it in flight; a shot aimed right at it lands where you aimed
  ['lockOn', 'Soft lock-on', true],
  ['lockOnAngle', 'Lock-on cone', 7, 0, 20, 0.5, '°'],
  ['lockOnTurn', 'Lock-on homing', 90, 0, 360, 5, '°/s'],
]);

export const SHOTS = [];
// per charge level: hit radius, passes through enemies, speed multiplier
export const SHOT_STATS = [
  { r: 0.16, pierce: false, speed: 1 },
  { r: 0.36, pierce: false, speed: 1.08 },
  { r: 0.62, pierce: true, speed: 1.15 },
];
// a tap does 1 damage; charged shots use the tuning panel values
export const shotDamage = (level) => (level === 2 ? tuning.chargeDamage2 : level === 1 ? tuning.chargeDamage1 : 1);

// lock-on: bosses by default; any enemy can opt in or out by setting e.lockOn = true / false
const DEG = Math.PI / 180;
const lockable = (e) => e.alive && (e.lockOn ?? e.kind === 'boss');
// the point of box mn..mx nearest the line o + f*s, kept a little inside the box
function nearestOnBox(ox, oy, oz, fx, fy, fz, mn, mx) {
  const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, cz = (mn[2] + mx[2]) / 2;
  const s = (cx - ox) * fx + (cy - oy) * fy + (cz - oz) * fz;
  if (s <= 0) return null;
  const k = [ox + fx * s, oy + fy * s, oz + fz * s];
  for (let a = 0; a < 3; a++) { const inset = Math.min(0.15, (mx[a] - mn[a]) / 4); k[a] = clamp(k[a], mn[a] + inset, mx[a] - inset); }
  return k;
}
// the lockable target nearest the aim line, inside the lock-on cone and in clear view of (fromX, fromY, fromZ)
function findLock(a, fromX, fromY, fromZ) {
  if (!tuning.lockOn || tuning.lockOnAngle <= 0) return null;
  let best = null, bestCos = Math.cos(tuning.lockOnAngle * DEG);
  for (const e of ENTS) {
    if (!lockable(e)) continue;
    const k = nearestOnBox(a.ox, a.oy, a.oz, a.fx, a.fy, a.fz, entMin(e), entMax(e));
    if (!k) continue;
    const dx = k[0] - a.ox, dy = k[1] - a.oy, dz = k[2] - a.oz, d = Math.hypot(dx, dy, dz);
    if (d > 80) continue;
    const c = (dx * a.fx + dy * a.fy + dz * a.fz) / d;
    if (c < bestCos) continue;
    if (segSolids(fromX, fromY, fromZ, k[0] - fromX, k[1] - fromY, k[2] - fromZ, 0) < 1) continue;
    best = { e, k }; bestCos = c;
  }
  return best;
}
// what the reticle is locked onto right now (updated every frame; the UI can show it)
export const lockView = { target: null };

// the line from the camera's shoulder point through the reticle
export function aimRay() {
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  return { ox: p.x + cy * tuning.camShoulder, oy: p.y + tuning.camHeight, oz: p.z - sy * tuning.camShoulder, fx, fy, fz, sy, cy, sp, cp };
}
// fire from the arm cannon toward whatever the reticle is on
export function fireShot(level) {
  const a = aimRay(), L = 150;
  let t = segSolids(a.ox, a.oy, a.oz, a.fx * L, a.fy * L, a.fz * L), aimEnt = null;
  for (const e of ENTS) if (e.alive) { const h = rayBox(a.ox, a.oy, a.oz, a.fx * L, a.fy * L, a.fz * L, entMin(e), entMax(e), 0.15); if (h < t) { t = h; aimEnt = e; } }
  if (!isFinite(t)) t = 1;
  let ax = a.ox + a.fx * L * t, ay = a.oy + a.fy * L * t, az = a.oz + a.fz * L * t;
  const rx = a.cy, rz = -a.sy, hx = -a.sy, hz = -a.cy;
  const mx = p.x + rx * 0.42 + hx * a.cp * 0.72, my = p.y + 1.42 + a.sp * 0.72, mz = p.z + rz * 0.42 + hz * a.cp * 0.72;
  // soft lock-on: on target, keep the aim point; just beside a lockable target, aim at its nearest edge
  let lock = aimEnt && lockable(aimEnt) ? aimEnt : null;
  if (!aimEnt) { const near = findLock(a, mx, my, mz); if (near) { [ax, ay, az] = near.k; lock = near.e; } }
  let dx = ax - mx, dy = ay - my, dz = az - mz;
  let len = Math.hypot(dx, dy, dz);
  if (len < 1.2 || (dx * a.fx + dy * a.fy + dz * a.fz) / (len || 1) < 0.25) { dx = a.fx; dy = a.fy; dz = a.fz; len = 1; }
  const st = SHOT_STATS[level], speed = tuning.shotSpeed * st.speed;
  SHOTS.push({ x: mx, y: my, z: mz, vx: (dx / len) * speed, vy: (dy / len) * speed, vz: (dz / len) * speed, level, life: 1.6, hit: new Set(), lock });
  p.aimTimer = 0.55;
  state.shotsFired += 1;
  events.push({ type: 'shoot', level, x: mx, y: my, z: mz });
}
// each step while the player is up: a press fires a shot and starts charging; releasing fires the charge
export function updateFire(dt) {
  const T = tuning;
  if (p.dead <= 0 && input.fireQueued) {
    input.fireQueued = false;
    fireShot(0);
    p.charging = true; p.charge = 0;
  }
  if (p.charging && p.dead <= 0) {
    if (input.fireHeld) {
      const before = p.charge;
      p.charge += dt;
      if (before < T.chargeTime1 && p.charge >= T.chargeTime1) events.push({ type: 'charge', level: 1 });
      if (before < T.chargeTime2 && p.charge >= T.chargeTime2) events.push({ type: 'charge', level: 2 });
      if (p.charge > T.chargeTime1) p.aimTimer = Math.max(p.aimTimer, 0.2);
    } else {
      if (p.charge >= T.chargeTime1) fireShot(p.charge >= T.chargeTime2 ? 2 : 1);
      p.charging = false; p.charge = 0;
    }
  }
}
// turn a locked shot toward the nearest part of its target, at most lockOnTurn degrees a second;
// it lets go once it has hit the target or flown past it
function steer(s, dt) {
  const e = s.lock;
  if (!e.alive || s.hit.has(e) || !tuning.lockOn || tuning.lockOnTurn <= 0) { s.lock = null; return; }
  const mn = entMin(e), mx = entMax(e);
  const tx = clamp(s.x, mn[0], mx[0]), ty = clamp(s.y, mn[1], mx[1]), tz = clamp(s.z, mn[2], mx[2]);
  let wx = tx - s.x, wy = ty - s.y, wz = tz - s.z;
  const d = Math.hypot(wx, wy, wz), speed = Math.hypot(s.vx, s.vy, s.vz);
  if (d < 0.01 || speed < 0.01) return;
  wx /= d; wy /= d; wz /= d;
  let ux = s.vx / speed, uy = s.vy / speed, uz = s.vz / speed;
  const ang = Math.acos(clamp(ux * wx + uy * wy + uz * wz, -1, 1));
  if (ang > 60 * DEG) { s.lock = null; return; }
  const turn = tuning.lockOnTurn * DEG * dt;
  if (ang <= turn) { ux = wx; uy = wy; uz = wz; }
  else {
    const a = Math.sin(ang - turn) / Math.sin(ang), b = Math.sin(turn) / Math.sin(ang);
    ux = ux * a + wx * b; uy = uy * a + wy * b; uz = uz * a + wz * b;
  }
  s.vx = ux * speed; s.vy = uy * speed; s.vz = uz * speed;
}
export function updateShots(dt) {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const s = SHOTS[i], st = SHOT_STATS[s.level];
    s.life -= dt;
    if (s.lock) steer(s, dt);
    const dx = s.vx * dt, dy = s.vy * dt, dz = s.vz * dt;
    const tWall = segSolids(s.x, s.y, s.z, dx, dy, dz, 0);
    const hits = [];
    for (const e of ENTS) {
      if (!e.alive || s.hit.has(e)) continue;
      const t = rayBox(s.x, s.y, s.z, dx, dy, dz, entMin(e), entMax(e), st.r);
      if (t < tWall && t <= 1) hits.push([t, e]);
    }
    hits.sort((a, b) => a[0] - b[0]);
    let stopped = false;
    for (const [t, e] of hits) {
      s.hit.add(e);
      const kill = damageEnt(e, shotDamage(s.level), s.x + dx * t, s.y + dy * t, s.z + dz * t, s.level);
      // a target that can't be hurt right now (e.damageable === false, e.g. a boss during its intro)
      // stops every shot, even a piercing full charge
      if (e.damageable === false || (!st.pierce && !(s.level === 1 && kill))) { stopped = true; break; }
    }
    if (stopped) { SHOTS.splice(i, 1); continue; }
    if (tWall <= 1) {
      events.push({ type: 'shotwall', x: s.x + dx * tWall, y: s.y + dy * tWall, z: s.z + dz * tWall, level: s.level });
      SHOTS.splice(i, 1); continue;
    }
    s.x += dx; s.y += dy; s.z += dz;
    if (s.life <= 0) SHOTS.splice(i, 1);
  }
}
export function resetShots() { SHOTS.length = 0; }

const shotOrbs = Array.from({ length: 40 }, () => makeOrb(0x3ad6c6));
export function renderShots() {
  const near = findLock(aimRay(), p.x, p.y + 1.42, p.z);
  lockView.target = near ? near.e : null;
  shotOrbs.forEach((o, i) => {
    const s = SHOTS[i];
    if (!s) { o.g.visible = false; return; }
    const st = SHOT_STATS[s.level];
    o.g.visible = true; o.g.position.set(s.x, s.y, s.z);
    o.core.scale.setScalar(st.r * 0.55);
    o.halo.scale.setScalar(st.r * (s.level === 2 ? 5 : 4));
    o.haloM.color.set(s.level === 2 ? 0xffb347 : 0x3ad6c6);
    if (Math.random() < (s.level === 0 ? 0.5 : 1)) emit(s.x, s.y, s.z, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, 0.18 + s.level * 0.08, s.level === 2 ? C_AMBER : C_TEAL, 0);
  });
}

const sfx = {
  shoot: () => tone(1100, 620, 0.07, 'square', 0.06),
  shoot1: () => { tone(700, 300, 0.18, 'sawtooth', 0.09); hiss(0.14, 4000, 1200, 0.1); },
  shoot2: () => { tone(420, 120, 0.32, 'sawtooth', 0.12); hiss(0.3, 3000, 400, 0.18); tone(900, 200, 0.25, 'square', 0.05); },
  charge: (lvl) => tone(lvl === 2 ? 1320 : 990, lvl === 2 ? 1320 : 990, 0.08, 'triangle', 0.1),
  hit: () => tone(1600, 1200, 0.04, 'square', 0.05),
  ping: () => { tone(2600, 1900, 0.07, 'triangle', 0.09); tone(3900, 3300, 0.05, 'square', 0.025, 0.012); },
};
on('shoot', (e) => {
  burst(e.x, e.y, e.z, e.level === 2 ? 22 : e.level === 1 ? 12 : 5, e.level === 2 ? 5 : 3, e.level === 2 ? C_AMBER : C_TEAL, { up: 0.5, grav: 2, life: 0.25 });
  (e.level === 2 ? sfx.shoot2 : e.level === 1 ? sfx.shoot1 : sfx.shoot)();
  if (e.level === 2) shake(0.12);
});
on('charge', (e) => { sfx.charge(e.level); burst(p.x, p.y + 1.2, p.z, e.level === 2 ? 24 : 14, 3, e.level === 2 ? C_AMBER : C_TEAL, { up: 0.6, grav: 0, life: 0.35 }); });
on('hit', (e) => {
  // blocked (the target can't be hurt right now): a metallic ping and sparks glancing back toward the player
  if (e.blocked) {
    const dx = p.x - e.x, dz = p.z - e.z, m = Math.hypot(dx, dz) || 1;
    burst(e.x, e.y, e.z, 12, 3.5, C_WHITE, { up: 0.9, grav: 9, life: 0.25, dirX: (dx / m) * 3, dirZ: (dz / m) * 3 });
    sfx.ping();
    return;
  }
  burst(e.x, e.y, e.z, e.level === 2 ? 18 : 8, 4, e.level === 2 ? C_AMBER : C_WHITE, { up: 0.6, grav: 6, life: 0.3 });
  sfx.hit();
});
on('shotwall', (e) => { burst(e.x, e.y, e.z, e.level === 2 ? 16 : 6, 3, e.level === 2 ? C_AMBER : C_TEAL, { up: 0.6, grav: 6, life: 0.25 }); });
