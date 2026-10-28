// Enemies: what each kind is, their behaviour each step, enemy shots, and enemy health.
import { ENTS, R, H, state, events, on } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';
import { damp, angleDamp } from '../core/util.js';
import { segSolids, rayBox, lineOfSight } from '../player/physics.js';
import { p } from '../player/player.js';
import { hurt } from '../player/health.js';

defineTuning('Enemies', [
  ['turretRate', 'Turret fire interval', 1.7, 0.6, 4, 0.1, 's'],
  ['turretShotSpeed', 'Turret shot speed', 13, 5, 30, 0.5, 'm/s'],
  ['walkerSpeed', 'Walker speed', 2.2, 0.5, 6, 0.1, 'm/s'],
  ['flyerSpeed', 'Flyer swoop speed', 12, 4, 22, 0.5, 'm/s'],
  ['enemiesFire', 'Enemies attack', true],
]);

// size (half-widths and height), health, seconds to respawn after being destroyed, contact damage
export const ENT_SPEC = {
  dummy: { hx: 0.45, hy: 1.85, hz: 0.45, hp: 3, respawn: 3 },
  mover: { hx: 0.45, hy: 0.85, hz: 0.45, hp: 3, respawn: 3 },
  turret: { hx: 0.5, hy: 1.2, hz: 0.5, hp: 8, respawn: 10 },
  walker: { hx: 0.55, hy: 1.15, hz: 0.55, hp: 3, respawn: 6, touch: 3 },
  flyer: { hx: 0.45, hy: 0.8, hz: 0.45, hp: 2, respawn: 6, touch: 2 },
  boss: { hx: 1.45, hy: 3.9, hz: 1.1, hp: 100, respawn: 999999 },
};
// place an enemy in the current level (called from level definitions)
export function addEnt(kind, x, y, z, extra = {}) {
  const spec = ENT_SPEC[kind];
  const e = { kind, x, y, z, x0: x, y0: y, z0: z, ...spec, maxHp: spec.hp, alive: true, timer: 0, flash: 0, yaw: 0, pitch: 0, cd: 1, tele: 0, dir: 1, st: 'hover', t: 0, t2: 0, phase: 0, vx: 0, vy: 0, vz: 0, ...extra };
  e.dir0 = e.dir; e.yaw0 = e.yaw;
  ENTS.push(e);
  return e;
}
export const entMin = (e) => [e.x - e.hx, e.y, e.z - e.hz];
export const entMax = (e) => [e.x + e.hx, e.y + e.hy, e.z + e.hz];

export const ESHOTS = [];
export function resetEnt(e) {
  e.x = e.x0; e.y = e.y0; e.z = e.z0; e.alive = e.kind !== 'boss'; e.hp = e.maxHp; e.timer = 0; e.flash = 0; e.cd = 1; e.tele = 0;
  e.st = 'hover'; e.t = 0; e.t2 = 0; e.dir = e.dir0; e.yaw = e.yaw0; e.vx = e.vy = e.vz = 0;
  if (e.kind === 'boss') { e.activated = false; e.damageable = false; e.introTimer = 0; e.introProgress = 0; e.phase = 0; }
}
export function resetEnemies() {
  for (const e of ENTS) resetEnt(e);
  ESHOTS.length = 0;
}

// a player shot hit enemy e at (x, y, z); returns true if that destroyed it
export function damageEnt(e, dmg, x, y, z, level) {
  if (e.kind === 'boss' && !e.damageable) return false;
  e.hp -= dmg; e.flash = 0.12;
  const kill = e.hp <= 0;
  events.push({ type: 'hit', x, y, z, kill, level });
  if (kill) { e.alive = false; e.timer = e.respawn; state.kills += 1; events.push({ type: 'kill', e }); }
  return kill;
}

export function updateEnemies(dt) {
  const attack = tuning.enemiesFire && !state.noEnemies && p.dead <= 0 && p.returning <= 0;
  for (const e of ENTS) {
    if (!e.alive) {
      e.timer -= dt;
      if (e.timer <= 0) { resetEnt(e); e.cd = 1.2; events.push({ type: 'entspawn', e }); }
      continue;
    }
    e.flash = Math.max(0, e.flash - dt);
    if (e.kind === 'boss') {
      if (!e.activated) continue;
      e.introTimer = Math.min(e.introDuration, e.introTimer + dt);
      e.introProgress = e.introTimer / e.introDuration;
      e.phase += dt * 3;
      if (e.st === 'enter') {
        const dz = e.entryZ - e.z, move = e.entrySpeed * dt;
        e.yaw = Math.PI;
        if (Math.abs(dz) <= move) { e.z = e.entryZ; e.st = 'idle'; }
        else e.z += Math.sign(dz) * move;
      }
      continue;
    } else if (e.kind === 'mover') {
      e.z += e.dir * e.speed * dt;
      if (e.z > e.zMax) { e.z = e.zMax; e.dir = -1; } else if (e.z < e.zMin) { e.z = e.zMin; e.dir = 1; }
    } else if (e.kind === 'walker') {
      if (!state.noEnemies) {
        const key = e.axis === 0 ? 'x' : 'z';
        e[key] += e.dir * tuning.walkerSpeed * dt;
        if (e[key] > e.max) { e[key] = e.max; e.dir = -1; } else if (e[key] < e.min) { e[key] = e.min; e.dir = 1; }
        e.phase += dt * tuning.walkerSpeed * 2.6;
        const fx = e.axis === 0 ? e.dir : 0, fz = e.axis === 2 ? e.dir : 0;
        e.yaw = angleDamp(e.yaw, Math.atan2(-fx, -fz), 10, dt);
      }
    } else if (e.kind === 'flyer') {
      const cx = e.x, cy = e.y + 0.4, cz = e.z;
      const dx = p.x - cx, dy = p.y + 0.9 - cy, dz = p.z - cz, dist = Math.hypot(dx, dy, dz);
      e.t += dt;
      if (e.st === 'hover') {
        e.y = e.y0 + Math.sin(e.t * 2.2) * 0.25;
        e.cd -= dt;
        if (dist < e.range * 1.4) e.yaw = angleDamp(e.yaw, Math.atan2(-dx, -dz), 5, dt);
        if (attack && e.cd <= 0 && dist < e.range && lineOfSight(cx, cy, cz, p.x, p.y + 0.9, p.z)) { e.st = 'tele'; e.t2 = 0.55; }
      } else if (e.st === 'tele') {
        e.t2 -= dt;
        e.yaw = angleDamp(e.yaw, Math.atan2(-dx, -dz), 12, dt);
        if (e.t2 <= 0) {
          const m = dist || 1, sp = tuning.flyerSpeed;
          e.vx = (dx / m) * sp; e.vy = (dy / m) * sp; e.vz = (dz / m) * sp; e.t2 = (dist + 2.5) / sp;
          e.st = 'swoop';
          events.push({ type: 'swoop', e });
        }
      } else if (e.st === 'swoop') {
        e.t2 -= dt;
        const sx = e.vx * dt, sy2 = e.vy * dt, sz = e.vz * dt;
        if (segSolids(cx, cy, cz, sx, sy2, sz, 0.3) <= 1 || e.t2 <= 0) e.st = 'return';
        else { e.x += sx; e.y += sy2; e.z += sz; }
      } else {
        const hx = e.x0 - e.x, hy = e.y0 - e.y, hz = e.z0 - e.z, hd = Math.hypot(hx, hy, hz);
        const stp = 5 * dt;
        if (hd <= stp) { e.x = e.x0; e.y = e.y0; e.z = e.z0; e.st = 'hover'; e.cd = 1.6; e.t = 0; }
        else { e.x += (hx / hd) * stp; e.y += (hy / hd) * stp; e.z += (hz / hd) * stp; e.yaw = angleDamp(e.yaw, Math.atan2(-hx, -hz), 6, dt); }
      }
      e.tele = e.st === 'tele' ? 1 : 0;
    } else if (e.kind === 'turret') {
      const ex = e.x, ey = e.y + 0.85, ez = e.z;
      const dx = p.x - ex, dy = p.y + 1.0 - ey, dz = p.z - ez;
      const dist = Math.hypot(dx, dy, dz);
      let active = attack && dist < e.range;
      if (active) active = segSolids(ex, ey, ez, dx, dy, dz, 0) >= 1;
      if (active) {
        e.yaw = angleDamp(e.yaw, Math.atan2(-dx, -dz), 7, dt);
        e.pitch = damp(e.pitch, Math.atan2(dy, Math.hypot(dx, dz)), 7, dt);
        e.cd -= dt;
        if (e.cd <= 0) {
          const sp = tuning.turretShotSpeed;
          const ux = dx / dist, uy = dy / dist, uz = dz / dist;
          ESHOTS.push({ x: ex + ux * 0.7, y: ey + uy * 0.7, z: ez + uz * 0.7, vx: ux * sp, vy: uy * sp, vz: uz * sp, life: 3 });
          e.cd = tuning.turretRate;
          events.push({ type: 'efire', x: ex + ux * 0.7, y: ey + uy * 0.7, z: ez + uz * 0.7 });
        }
      } else e.cd = Math.max(e.cd, 0.8);
      e.tele = active && e.cd < 0.5 ? 1 - e.cd / 0.5 : 0;
    }
    // walkers and flyers hurt on contact
    if (attack && e.touch && p.iframes <= 0) {
      const mn = entMin(e), mx = entMax(e);
      if (p.x - R < mx[0] && p.x + R > mn[0] && p.y < mx[1] && p.y + H > mn[1] && p.z - R < mx[2] && p.z + R > mn[2]) {
        hurt(e.touch * tuning.damageTaken, p.x - e.x, p.z - e.z);
        events.push({ type: 'touch', x: (p.x + e.x) / 2, y: p.y + 1, z: (p.z + e.z) / 2 });
      }
    }
  }
  for (let i = ESHOTS.length - 1; i >= 0; i--) {
    const s = ESHOTS[i];
    s.life -= dt;
    const dx = s.vx * dt, dy = s.vy * dt, dz = s.vz * dt;
    const tWall = segSolids(s.x, s.y, s.z, dx, dy, dz, 0);
    if (p.iframes <= 0 && p.dead <= 0 && p.returning <= 0) {
      const t = rayBox(s.x, s.y, s.z, dx, dy, dz, [p.x - R, p.y, p.z - R], [p.x + R, p.y + H, p.z + R], 0.22);
      if (t <= 1 && t < tWall) {
        hurt(2 * tuning.damageTaken, s.vx, s.vz);
        events.push({ type: 'eshothit', x: s.x + dx * t, y: s.y + dy * t, z: s.z + dz * t });
        ESHOTS.splice(i, 1); continue;
      }
    }
    if (tWall <= 1) { events.push({ type: 'eshotwall', x: s.x + dx * tWall, y: s.y + dy * tWall, z: s.z + dz * tWall }); ESHOTS.splice(i, 1); continue; }
    s.x += dx; s.y += dy; s.z += dz;
    if (s.life <= 0) ESHOTS.splice(i, 1);
  }
}

on('bossdoor', () => {
  const boss = ENTS.find((e) => e.kind === 'boss');
  if (!boss || boss.activated) return;
  boss.alive = true; boss.activated = true; boss.damageable = false;
  boss.hp = boss.maxHp; boss.introTimer = 0; boss.introProgress = 0;
  boss.st = 'enter'; boss.z = boss.z0; boss.yaw = Math.PI;
});
