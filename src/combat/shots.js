// The arm cannon: aiming, tap shots, two charge levels, shot flight and hits.
import { ENTS, input, cam, state, events, on } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';
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
]);

export const SHOTS = [];
// per charge level: hit radius, damage, passes through enemies, speed multiplier
export const SHOT_STATS = [
  { r: 0.16, dmg: 1, pierce: false, speed: 1 },
  { r: 0.36, dmg: 3, pierce: false, speed: 1.08 },
  { r: 0.62, dmg: 6, pierce: true, speed: 1.15 },
];

// the line from the camera's shoulder point through the reticle
export function aimRay() {
  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw), sp = Math.sin(cam.pitch), cp = Math.cos(cam.pitch);
  const fx = -sy * cp, fy = sp, fz = -cy * cp;
  return { ox: p.x + cy * tuning.camShoulder, oy: p.y + tuning.camHeight, oz: p.z - sy * tuning.camShoulder, fx, fy, fz, sy, cy, sp, cp };
}
// fire from the arm cannon toward whatever the reticle is on
export function fireShot(level) {
  const a = aimRay(), L = 150;
  let t = segSolids(a.ox, a.oy, a.oz, a.fx * L, a.fy * L, a.fz * L);
  for (const e of ENTS) if (e.alive) { const h = rayBox(a.ox, a.oy, a.oz, a.fx * L, a.fy * L, a.fz * L, entMin(e), entMax(e), 0.15); if (h < t) t = h; }
  if (!isFinite(t)) t = 1;
  const ax = a.ox + a.fx * L * t, ay = a.oy + a.fy * L * t, az = a.oz + a.fz * L * t;
  const rx = a.cy, rz = -a.sy, hx = -a.sy, hz = -a.cy;
  const mx = p.x + rx * 0.42 + hx * a.cp * 0.72, my = p.y + 1.42 + a.sp * 0.72, mz = p.z + rz * 0.42 + hz * a.cp * 0.72;
  let dx = ax - mx, dy = ay - my, dz = az - mz;
  let len = Math.hypot(dx, dy, dz);
  if (len < 1.2 || (dx * a.fx + dy * a.fy + dz * a.fz) / (len || 1) < 0.25) { dx = a.fx; dy = a.fy; dz = a.fz; len = 1; }
  const st = SHOT_STATS[level], speed = tuning.shotSpeed * st.speed;
  SHOTS.push({ x: mx, y: my, z: mz, vx: (dx / len) * speed, vy: (dy / len) * speed, vz: (dz / len) * speed, level, life: 1.6, hit: new Set() });
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
export function updateShots(dt) {
  for (let i = SHOTS.length - 1; i >= 0; i--) {
    const s = SHOTS[i], st = SHOT_STATS[s.level];
    s.life -= dt;
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
      const kill = damageEnt(e, st.dmg, s.x + dx * t, s.y + dy * t, s.z + dz * t, s.level);
      if (!st.pierce && !(s.level === 1 && kill)) { stopped = true; break; }
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
};
on('shoot', (e) => {
  burst(e.x, e.y, e.z, e.level === 2 ? 22 : e.level === 1 ? 12 : 5, e.level === 2 ? 5 : 3, e.level === 2 ? C_AMBER : C_TEAL, { up: 0.5, grav: 2, life: 0.25 });
  (e.level === 2 ? sfx.shoot2 : e.level === 1 ? sfx.shoot1 : sfx.shoot)();
  if (e.level === 2) shake(0.12);
});
on('charge', (e) => { sfx.charge(e.level); burst(p.x, p.y + 1.2, p.z, e.level === 2 ? 24 : 14, 3, e.level === 2 ? C_AMBER : C_TEAL, { up: 0.6, grav: 0, life: 0.35 }); });
on('hit', (e) => { burst(e.x, e.y, e.z, e.level === 2 ? 18 : 8, 4, e.level === 2 ? C_AMBER : C_WHITE, { up: 0.6, grav: 6, life: 0.3 }); sfx.hit(); });
on('shotwall', (e) => { burst(e.x, e.y, e.z, e.level === 2 ? 16 : 6, 3, e.level === 2 ? C_AMBER : C_TEAL, { up: 0.6, grav: 6, life: 0.25 }); });
