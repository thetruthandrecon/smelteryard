// Enemies: what each kind is, their behaviour each step, enemy shots, and enemy health.
import { ENTS, R, H, state, events, LEVEL } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';
import { damp, angleDamp } from '../core/util.js';
import { segSolids, rayBox, lineOfSight, groundBelow } from '../player/physics.js';
import { p } from '../player/player.js';
import { hurt } from '../player/health.js';

defineTuning('Enemies', [
  ['turretRate', 'Turret fire interval', 1.7, 0.6, 4, 0.1, 's'],
  ['turretShotSpeed', 'Turret shot speed', 13, 5, 30, 0.5, 'm/s'],
  ['walkerSpeed', 'Walker speed', 2.2, 0.5, 6, 0.1, 'm/s'],
  ['flyerSpeed', 'Flyer swoop speed', 12, 4, 22, 0.5, 'm/s'],
  ['enemiesFire', 'Enemies attack', true],
  ['slagBlobDamage', 'Slag blob damage', 3, 0, 10, 0.5, 'HP'],
  ['slagFireDamage', 'Slag fire damage', 2, 0, 10, 0.5, 'HP'],
  ['groundWaveDamage', 'Ground wave damage', 3, 0, 10, 0.5, 'HP'],
  ['groundWaveSpeed', 'Ground wave speed', 12, 5, 22, 0.5, 'm/s'],
]);

// size (half-widths and height), health, seconds to respawn after being destroyed, contact damage
export const ENT_SPEC = {
  dummy: { hx: 0.45, hy: 1.85, hz: 0.45, hp: 3, respawn: 3 },
  mover: { hx: 0.45, hy: 0.85, hz: 0.45, hp: 3, respawn: 3 },
  turret: { hx: 0.5, hy: 1.2, hz: 0.5, hp: 8, respawn: 10 },
  walker: { hx: 0.55, hy: 1.15, hz: 0.55, hp: 3, respawn: 6, touch: 3 },
  flyer: { hx: 0.45, hy: 0.8, hz: 0.45, hp: 2, respawn: 6, touch: 2 },
  boss: { hx: 1.45, hy: 3.9, hz: 1.1, hp: 100, respawn: 999999, touch: 3, chargeDamage: 4, chargeSpeed: 18, chargeAlignSpeed: 14 },
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
export const FIRE_PATCHES = [];
export const GROUND_WAVES = [];
const BOSS_CORE = { x: 0, y: 2.12, z: -0.72, radius: 0.52 };
const SHOT_RADII = [0.16, 0.36, 0.62];
const SLAG_FLIGHT = 0.8, SLAG_GRAVITY = 18, SLAG_RADIUS = 0.32, SLAG_PATCH_LIFE = 3, SLAG_PATCH_RADIUS = 0.9;
const GROUND_WAVE_DEPTH = 0.42;
const GROUND_WAVE_MIN_X = -5, GROUND_WAVE_MAX_X = 5;
const GROUND_WAVE_FRONT_Z = -216, GROUND_WAVE_BACK_Z = -245;

function isBossCoreHit(e, x, y, z, level) {
  const radius = BOSS_CORE.radius + (SHOT_RADII[level] ?? 0);
  const dx = x - (e.x + BOSS_CORE.z * Math.sin(e.yaw)), dy = y - (e.y + BOSS_CORE.y), dz = z - (e.z + BOSS_CORE.z * Math.cos(e.yaw));
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}

export function resetEnt(e) {
  e.x = e.x0; e.y = e.y0; e.z = e.z0; e.alive = e.kind !== 'boss'; e.hp = e.maxHp; e.timer = 0; e.flash = 0; e.cd = 1; e.tele = 0;
  e.st = 'hover'; e.t = 0; e.t2 = 0; e.dir = e.dir0; e.yaw = e.yaw0; e.vx = e.vy = e.vz = 0;
  if (e.kind === 'boss') {
    e.activated = false; e.damageable = false; e.combatReady = false;
    e.introTimer = 0; e.introProgress = 0; e.phase = 0; e.introEntering = false;
    e.chargeDirZ = 0; e.chargeTargetZ = e.entryZ; e.chargeX = e.x0;
    e.groundWaveDirZ = 0;
    e.nextAttack = 'charge';
  }
}
export function resetEnemies() {
  for (const e of ENTS) resetEnt(e);
  ESHOTS.length = 0;
  FIRE_PATCHES.length = 0;
  GROUND_WAVES.length = 0;
}

export function activateBoss() {
  const boss = ENTS.find((e) => e.kind === 'boss');
  if (!boss || boss.activated) return false;
  boss.alive = true; boss.activated = true; boss.damageable = false;
  boss.hp = boss.maxHp; boss.introTimer = 0; boss.introProgress = 0;
  boss.combatReady = false; boss.introEntering = false; boss.chargeDirZ = 0;
  boss.chargeTargetZ = boss.entryZ; boss.chargeX = boss.x0; boss.cd = 0;
  boss.nextAttack = 'charge';
  boss.st = 'enter'; boss.z = boss.z0; boss.yaw = Math.PI;
  return true;
}

function resetBossEncounter(e) {
  resetEnt(e);
  for (let i = ESHOTS.length - 1; i >= 0; i--) if (ESHOTS[i].kind === 'slag') ESHOTS.splice(i, 1);
  FIRE_PATCHES.length = 0;
  GROUND_WAVES.length = 0;
  const door = LEVEL.named.bossDoor;
  if (door) {
    door.open = 0; door.triggered = false; door.openedAt = 0;
    door.min[1] = door.closedMin[1]; door.max[1] = door.closedMax[1];
  }
}

function startBossChargeTell(e) {
  if (!e.chargeDirZ) e.chargeDirZ = Math.sign(p.z - e.z) || 1;
  e.chargeTargetZ = e.chargeDirZ > 0 ? e.chargeFrontZ : e.chargeBackZ;
  e.yaw = e.chargeDirZ > 0 ? Math.PI : 0;
  e.st = 'chargeTell'; e.t2 = 0.5; e.tele = 1;
  events.push({ type: 'bosstelegraph', e, attack: 'charge' });
}

function startBossSlagTell(e) {
  e.st = 'slagTell'; e.t2 = 0.5; e.tele = 1;
  events.push({ type: 'bosstelegraph', e, attack: 'slag' });
}

function startBossGroundTell(e) {
  e.groundWaveDirZ = Math.sign(p.z - e.z) || 1;
  e.yaw = e.groundWaveDirZ > 0 ? Math.PI : 0;
  e.st = 'groundTell'; e.t2 = 0.5; e.tele = 1;
  events.push({ type: 'bosstelegraph', e, attack: 'groundpound' });
}

function startBossNextTell(e) {
  if (e.nextAttack === 'slag') startBossSlagTell(e);
  else if (e.nextAttack === 'groundpound') startBossGroundTell(e);
  else startBossChargeTell(e);
}

function launchBossSlag(e) {
  const startX = e.x + BOSS_CORE.z * Math.sin(e.yaw), startY = e.y + BOSS_CORE.y;
  const startZ = e.z + BOSS_CORE.z * Math.cos(e.yaw);
  const targetZ = Math.max(Math.min(p.z, e.chargeFrontZ), e.chargeBackZ);
  for (const offset of [-2, 0, 2]) {
    const targetX = Math.max(e.chargeMinX, Math.min(e.chargeMaxX, p.x + offset));
    const floorY = groundBelow(targetX, e.y + 8, targetZ);
    if (!Number.isFinite(floorY)) continue;
    const targetY = floorY + SLAG_RADIUS;
    const vy = (targetY - startY + 0.5 * SLAG_GRAVITY * SLAG_FLIGHT * SLAG_FLIGHT) / SLAG_FLIGHT;
    ESHOTS.push({
      kind: 'slag', x: startX, y: startY, z: startZ,
      vx: (targetX - startX) / SLAG_FLIGHT, vy, vz: (targetZ - startZ) / SLAG_FLIGHT,
      life: SLAG_FLIGHT + 0.15, radius: SLAG_RADIUS, gravity: SLAG_GRAVITY,
      targetX, targetY, targetZ,
    });
  }
  events.push({ type: 'bossslag', e, x: startX, y: startY, z: startZ });
  e.nextAttack = 'groundpound'; e.st = 'idle'; e.cd = 1; e.tele = 0;
}

function launchBossGroundWave(e) {
  const dirZ = e.groundWaveDirZ || Math.sign(p.z - e.z) || 1;
  const endZ = dirZ > 0 ? GROUND_WAVE_FRONT_Z : GROUND_WAVE_BACK_Z;
  const speed = tuning.groundWaveSpeed;
  GROUND_WAVES.push({
    x: (GROUND_WAVE_MIN_X + GROUND_WAVE_MAX_X) * 0.5, y: e.y, z: e.z,
    width: GROUND_WAVE_MAX_X - GROUND_WAVE_MIN_X, dirZ, endZ, speed,
    damage: tuning.groundWaveDamage, depth: GROUND_WAVE_DEPTH,
    life: Math.abs(endZ - e.z) / speed + 0.1, crossed: false,
  });
  events.push({ type: 'bossgroundslam', e, x: e.x, y: e.y, z: e.z, dirZ });
  e.nextAttack = 'charge'; e.st = 'groundRecover'; e.t2 = 0.25; e.tele = 0;
}

function updateBoss(e, dt, attack) {
  if (p.dead > 0) {
    resetBossEncounter(e);
    return;
  }

  e.introTimer = Math.min(e.introDuration, e.introTimer + dt);
  e.introProgress = e.introTimer / e.introDuration;
  e.phase += dt * 3;

  if (!e.combatReady && e.introProgress >= 1) {
    e.combatReady = true;
    e.damageable = true;
    e.cd = 0;
  }

  if (e.combatReady && attack && e.st === 'enter') {
    e.introEntering = true;
    startBossNextTell(e);
  }

  if (e.st === 'enter') {
    const dz = e.entryZ - e.z, move = e.entrySpeed * dt;
    e.yaw = Math.PI;
    if (Math.abs(dz) <= move) { e.z = e.entryZ; e.st = 'idle'; }
    else e.z += Math.sign(dz) * move;
  }

  if (e.st === 'chargeTell') {
    const targetX = Math.max(e.chargeMinX, Math.min(e.chargeMaxX, p.x));
    const dx = targetX - e.x, moveX = e.chargeAlignSpeed * dt;
    e.x += Math.sign(dx) * Math.min(Math.abs(dx), moveX);
    if (e.introEntering) {
      const dz = e.entryZ - e.z, move = e.entrySpeed * dt;
      if (Math.abs(dz) <= move) { e.z = e.entryZ; e.introEntering = false; }
      else e.z += Math.sign(dz) * move;
    }
    e.t2 = Math.max(0, e.t2 - dt);
    if (e.t2 <= 0 && !e.introEntering) {
      e.chargeX = e.x;
      e.st = 'charge'; e.tele = 0;
      events.push({ type: 'bosscharge', e });
    }
  } else if (e.st === 'slagTell') {
    if (e.introEntering) {
      const dz = e.entryZ - e.z, move = e.entrySpeed * dt;
      if (Math.abs(dz) <= move) { e.z = e.entryZ; e.introEntering = false; }
      else e.z += Math.sign(dz) * move;
    }
    e.t2 = Math.max(0, e.t2 - dt);
    if (e.t2 <= 0 && !e.introEntering) launchBossSlag(e);
  } else if (e.st === 'groundTell') {
    e.t2 = Math.max(0, e.t2 - dt);
    if (e.t2 <= 0) launchBossGroundWave(e);
  } else if (e.st === 'groundRecover') {
    e.t2 = Math.max(0, e.t2 - dt);
    if (e.t2 <= 0) { e.st = 'idle'; e.cd = 1; }
  } else if (e.st === 'charge') {
    const dz = e.chargeTargetZ - e.z, move = e.chargeSpeed * dt;
    e.x = e.chargeX;
    e.yaw = e.chargeDirZ > 0 ? Math.PI : 0;
    if (Math.abs(dz) <= move) {
      e.z = e.chargeTargetZ; e.st = 'idle'; e.cd = 1;
      e.chargeDirZ *= -1;
      e.nextAttack = 'slag';
    } else e.z += Math.sign(dz) * move;
  } else if (e.st === 'idle' && e.combatReady && attack) {
    e.cd -= dt;
    if (e.cd <= 0) startBossNextTell(e);
  }

  if (e.combatReady && attack) {
    const mn = entMin(e), mx = entMax(e);
    if (p.x - R < mx[0] && p.x + R > mn[0] && p.y < mx[1] && p.y + H > mn[1] && p.z - R < mx[2] && p.z + R > mn[2]) {
      const charging = e.st === 'charge';
      if (hurt((charging ? e.chargeDamage : e.touch) * tuning.damageTaken, p.x - e.x, p.z - e.z)) {
        const x = (p.x + e.x) / 2, y = p.y + 1, z = (p.z + e.z) / 2;
        events.push({ type: 'touch', x, y, z, boss: true, charge: charging });
        if (charging) events.push({ type: 'bossimpact', x, y, z });
        if (p.dead > 0) resetBossEncounter(e);
      }
    }
  }
}

// a player shot hit enemy e at (x, y, z); returns true if that destroyed it
export function damageEnt(e, dmg, x, y, z, level) {
  if (e.kind === 'boss' && !e.damageable) {
    e.flash = 0.12;
    events.push({ type: 'hit', x, y, z, kill: false, level, blocked: true });
    return false;
  }
  const weakspot = e.kind === 'boss' && isBossCoreHit(e, x, y, z, level);
  const damage = weakspot ? dmg * 1.5 : dmg;
  e.hp -= damage; e.flash = 0.12;
  const kill = e.hp <= 0;
  events.push({ type: 'hit', x, y, z, kill, level, weakspot, damage });
  if (kill) { e.alive = false; e.timer = e.respawn; state.kills += 1; events.push({ type: 'kill', e }); }
  return kill;
}

export function updateEnemies(dt) {
  const attack = tuning.enemiesFire && !state.noEnemies && p.dead <= 0 && p.returning <= 0;
  for (const e of ENTS) {
    if (e.kind === 'boss' && !e.activated) continue;
    if (!e.alive) {
      e.timer -= dt;
      if (e.timer <= 0) { resetEnt(e); e.cd = 1.2; events.push({ type: 'entspawn', e }); }
      continue;
    }
    e.flash = Math.max(0, e.flash - dt);
    if (e.kind === 'boss') {
      if (e.activated) updateBoss(e, dt, attack);
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
  for (let i = FIRE_PATCHES.length - 1; i >= 0; i--) {
    const fire = FIRE_PATCHES[i];
    fire.life -= dt;
    if (fire.life <= 0) { FIRE_PATCHES.splice(i, 1); continue; }
    const dx = p.x - fire.x, dz = p.z - fire.z;
    if (attack && p.y <= fire.y + 0.1 && p.y + H > fire.y - 0.1 && Math.hypot(dx, dz) <= fire.radius + R) {
      if (hurt(tuning.slagFireDamage * tuning.damageTaken, dx, dz)) events.push({ type: 'slagfirehit', x: p.x, y: fire.y, z: p.z });
    }
  }
  for (let i = GROUND_WAVES.length - 1; i >= 0; i--) {
    const wave = GROUND_WAVES[i];
    const fromZ = wave.z;
    const nextZ = fromZ + wave.dirZ * wave.speed * dt;
    const toZ = wave.dirZ > 0 ? Math.min(nextZ, wave.endZ) : Math.max(nextZ, wave.endZ);
    const halfDepth = wave.depth * 0.5;
    const lowZ = Math.min(fromZ, toZ) - halfDepth, highZ = Math.max(fromZ, toZ) + halfDepth;
    const overlapsX = p.x + R >= wave.x - wave.width * 0.5 && p.x - R <= wave.x + wave.width * 0.5;
    const overlapsZ = p.z + R >= lowZ && p.z - R <= highZ;
    if (!wave.crossed && overlapsX && overlapsZ) {
      wave.crossed = true;
      events.push({ type: 'groundwavepass', x: p.x, y: p.y, z: p.z, grounded: p.grounded });
      if (attack && p.grounded && hurt(wave.damage * tuning.damageTaken, 0, wave.dirZ)) {
        events.push({ type: 'groundwavehit', x: p.x, y: p.y, z: p.z });
      }
    }
    wave.z = toZ; wave.life -= dt;
    if (wave.life <= 0) GROUND_WAVES.splice(i, 1);
  }
  for (let i = ESHOTS.length - 1; i >= 0; i--) {
    const s = ESHOTS[i];
    s.life -= dt;
    const radius = s.kind === 'slag' ? s.radius : 0;
    const dx = s.vx * dt, dy = s.kind === 'slag' ? s.vy * dt - 0.5 * s.gravity * dt * dt : s.vy * dt, dz = s.vz * dt;
    if (s.kind === 'slag') s.vy -= s.gravity * dt;
    const tWall = segSolids(s.x, s.y, s.z, dx, dy, dz, radius);
    if (p.iframes <= 0 && p.dead <= 0 && p.returning <= 0) {
      const t = rayBox(s.x, s.y, s.z, dx, dy, dz, [p.x - R, p.y, p.z - R], [p.x + R, p.y + H, p.z + R], s.kind === 'slag' ? radius : 0.22);
      if (t <= 1 && t < tWall) {
        const x = s.x + dx * t, y = s.y + dy * t, z = s.z + dz * t;
        if (s.kind === 'slag') {
          hurt(tuning.slagBlobDamage * tuning.damageTaken, s.vx, s.vz);
          events.push({ type: 'slagblobhit', x, y, z });
        } else {
          hurt(2 * tuning.damageTaken, s.vx, s.vz);
          events.push({ type: 'eshothit', x, y, z });
        }
        ESHOTS.splice(i, 1); continue;
      }
    }
    if (tWall <= 1) {
      const x = s.x + dx * tWall, y = s.y + dy * tWall, z = s.z + dz * tWall;
      const floorY = s.kind === 'slag' ? groundBelow(x, y + radius + 0.1, z) : -Infinity;
      if (s.kind === 'slag' && dy < 0 && Number.isFinite(floorY) && y <= floorY + radius + 0.06) {
        FIRE_PATCHES.push({ x, y: floorY + 0.04, z, life: SLAG_PATCH_LIFE, radius: SLAG_PATCH_RADIUS });
        events.push({ type: 'slagland', x, y: floorY + 0.04, z });
      } else events.push({ type: 'eshotwall', x, y, z });
      ESHOTS.splice(i, 1); continue;
    }
    s.x += dx; s.y += dy; s.z += dz;
    if (s.life <= 0) ESHOTS.splice(i, 1);
  }
}
