// The player: state, movement (run, jump, dash, wall-slide, wall-jump), riding platforms, respawning.
import { R, H, MAX_HP, DYN, SPIKES, CHECKPOINTS, input, cam, state, events } from '../core/world.js';
import { tuning, defineTuning } from '../core/tuning.js';
import { moveAxis, hit, probeWall, overlapsBox, pushOut } from './physics.js';
import { ko, hazardHit } from './health.js';
import { updateFire } from '../combat/shots.js';

defineTuning('Movement', [
  ['runSpeed', 'Run speed', 7.5, 4, 12, 0.1, 'm/s'],
  ['jumpHeight', 'Jump height', 2.2, 1, 4, 0.05, 'm'],
  ['gravity', 'Gravity', 32, 15, 60, 0.5, 'm/s²'],
  ['fallSpeed', 'Max fall speed', 24, 10, 40, 0.5, 'm/s'],
  ['airControl', 'Air control', 0.6, 0.1, 1.5, 0.05, '×'],
]);
defineTuning('Dash', [
  ['dashSpeed', 'Dash speed', 17, 10, 26, 0.5, 'm/s'],
  ['dashTime', 'Dash length', 0.24, 0.1, 0.5, 0.01, 's'],
  ['dashJumpCarry', 'Dash-jump speed kept', 0.8, 0.5, 1, 0.01, '×'],
]);
defineTuning('Walls', [
  ['wallSlide', 'Wall slide speed', 2.6, 0.5, 8, 0.1, 'm/s'],
  ['wallKick', 'Wall-jump push-off', 4, 2, 12, 0.1, 'm/s'],
  ['wallJumpHeight', 'Wall-jump height', 2.6, 0.8, 3.5, 0.05, 'm'],
]);

// p.x/y/z is the player's feet; px/py/pz is last step's position (rendering interpolates between them)
export const p = {
  x: 0, y: 0, z: 8, px: 0, py: 0, pz: 8, vx: 0, vy: 0, vz: 0,
  grounded: false, ground: null, lastGroundY: 0, coyote: 0, jumpBuffer: 0, dashBuffer: 0,
  dashTimer: 0, dashCD: 0, dashAir: false, dashX: 0, dashZ: -1, airDash: true,
  carry: 0, wallLock: 0, jumping: false, onWall: false, wallX: 0, wallZ: 0, sliding: false,
  faceX: 0, faceZ: -1,
  hp: MAX_HP, iframes: 0, stun: 0, dead: 0, returning: 0,
  charging: false, charge: 0, aimTimer: 0,
};

// put the player at a checkpoint with full health; iframes = seconds of invincibility
export function placeAt(c, iframes = 0) {
  p.x = p.px = c.x; p.y = p.py = c.y; p.z = p.pz = c.z; p.lastGroundY = c.y;
  p.vx = p.vy = p.vz = 0; p.dashTimer = 0; p.carry = 0; p.airDash = true; p.jumping = false;
  p.faceX = 0; p.faceZ = -1; p.grounded = false; p.ground = null;
  p.hp = MAX_HP; p.stun = 0; p.dead = 0; p.returning = 0; p.iframes = iframes; p.charging = false; p.charge = 0; p.aimTimer = 0;
}

// one fixed step of the player. Returns true if the player is up and moving at the end of it
// (false while knocked out or returning to a checkpoint).
export function updatePlayer(dt) {
  const T = tuning, g = T.gravity;
  const jumpV = Math.sqrt(2 * g * T.jumpHeight);
  const wallJumpV = Math.sqrt(2 * g * T.wallJumpHeight);
  p.px = p.x; p.py = p.y; p.pz = p.z;

  if (p.dead > 0) {
    input.jumpQueued = input.dashQueued = input.fireQueued = false;
    p.dead -= dt;
    if (p.dead <= 0) { placeAt(CHECKPOINTS[state.cp], 1.5); events.push({ type: 'revive' }); }
    return false;
  }
  if (p.returning > 0) {
    input.jumpQueued = input.dashQueued = input.fireQueued = false;
    p.returning -= dt;
    if (p.returning <= 0) { const hp = p.hp; placeAt(CHECKPOINTS[state.cp], 1.2); p.hp = hp; events.push({ type: 'return' }); }
    return false;
  }

  // ride moving platforms and conveyor belts; crushers coming down take you out
  if (p.grounded && p.ground && p.ground.dyn) { p.x += p.ground.dx; p.y += p.ground.dy; p.z += p.ground.dz; }
  if (p.grounded && p.ground && p.ground.belt) { moveAxis(0, p.ground.belt[0] * T.beltSpeed * dt); moveAxis(2, p.ground.belt[1] * T.beltSpeed * dt); }
  for (const b of DYN) {
    if (!overlapsBox(p.x, p.y, p.z, b, R)) continue;
    if (b.kind === 'crusher' && b.dy < 0) { ko(); break; }
    pushOut(b);
  }
  if (p.dead > 0) return false;

  const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
  let wx = cy * input.moveX - sy * input.moveY;
  let wz = -sy * input.moveX - cy * input.moveY;
  let mag = Math.hypot(wx, wz);
  if (mag > 1) { wx /= mag; wz /= mag; mag = 1; }
  const stunned = p.stun > 0;
  p.stun = Math.max(0, p.stun - dt);
  p.iframes = Math.max(0, p.iframes - dt);
  if (stunned) { wx = wz = 0; mag = 0; input.jumpQueued = input.dashQueued = input.fireQueued = false; }
  const hasInput = mag > 0.15;

  if (input.jumpQueued) { p.jumpBuffer = 0.12; input.jumpQueued = false; } else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (input.dashQueued) { p.dashBuffer = 0.1; input.dashQueued = false; } else p.dashBuffer = Math.max(0, p.dashBuffer - dt);
  p.coyote = p.grounded ? 0.1 : Math.max(0, p.coyote - dt);
  p.dashCD = Math.max(0, p.dashCD - dt);
  p.wallLock = Math.max(0, p.wallLock - dt);
  p.aimTimer = Math.max(0, p.aimTimer - dt);
  if (!state.started && !state.cleared && (hasInput || p.jumpBuffer > 0 || p.dashBuffer > 0)) { state.started = true; state.timing = true; }

  const wall = p.grounded ? null : probeWall(wx, wz);
  p.onWall = !!wall;
  if (wall) { p.wallX = wall.nx; p.wallZ = wall.nz; }

  if (p.dashBuffer > 0 && p.dashTimer <= 0 && p.dashCD <= 0) {
    const onGround = p.grounded || p.coyote > 0;
    if (onGround || (p.airDash && !wall)) {
      let dx = hasInput ? wx : p.faceX, dz = hasInput ? wz : p.faceZ;
      const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
      p.dashX = dx; p.dashZ = dz; p.dashTimer = T.dashTime; p.dashAir = !onGround; p.dashBuffer = 0;
      if (p.dashAir) { p.airDash = false; p.vy = 0; p.jumping = false; }
      events.push({ type: p.dashAir ? 'airdash' : 'dash' });
    }
  }

  if (p.jumpBuffer > 0) {
    if (p.grounded || p.coyote > 0) {
      p.vy = jumpV; p.jumping = true; p.jumpBuffer = 0; p.coyote = 0; p.grounded = false;
      // keep the motion of a platform or belt when jumping off it
      if (p.ground && p.ground.dyn) { p.vx += p.ground.dx / dt; p.vz += p.ground.dz / dt; if (p.ground.dy > 0) p.vy += p.ground.dy / dt; }
      if (p.ground && p.ground.belt) { p.vx += p.ground.belt[0] * T.beltSpeed; p.vz += p.ground.belt[1] * T.beltSpeed; }
      if (p.dashTimer > 0 && !p.dashAir) { p.carry = T.dashSpeed * T.dashJumpCarry; p.dashTimer = 0; p.dashCD = 0.05; }
      else p.carry = 0;
      p.ground = null;
      events.push({ type: 'jump', dash: p.carry > 0 });
    } else if (wall) {
      p.vy = wallJumpV; p.jumping = true; p.jumpBuffer = 0;
      p.carry = input.dashHeld ? T.dashSpeed * T.dashJumpCarry : 0;
      const kick = p.carry > 0 ? Math.max(T.wallKick, p.carry * 0.75) : T.wallKick;
      p.vx = wall.nx * kick; p.vz = wall.nz * kick;
      p.wallLock = 0.14; p.airDash = true; p.dashTimer = 0;
      p.faceX = wall.nx; p.faceZ = wall.nz;
      events.push({ type: 'walljump', x: p.x - wall.nx * R, y: p.y + 1, z: p.z - wall.nz * R });
    }
  }
  if (p.jumping && !input.jumpHeld && p.vy > 0) { p.vy *= 0.45; p.jumping = false; }
  if (p.vy <= 0) p.jumping = false;

  if (p.dashTimer > 0) {
    p.vx = p.dashX * T.dashSpeed; p.vz = p.dashZ * T.dashSpeed;
    p.dashTimer -= dt;
    if (!p.dashAir && !input.dashHeld && T.dashTime - p.dashTimer > 0.08) p.dashTimer = 0;
    if (p.dashTimer <= 0) {
      p.dashTimer = 0; p.dashCD = 0.1;
      if (!p.grounded && !p.dashAir) p.carry = Math.max(p.carry, T.dashSpeed * T.dashJumpCarry);
    }
  } else if (stunned) {
    const k = Math.exp(-3 * dt); p.vx *= k; p.vz *= k;
  } else {
    const maxSpeed = !p.grounded && p.carry > 0 ? Math.max(T.runSpeed, p.carry) : T.runSpeed;
    const tx = wx * maxSpeed, tz = wz * maxSpeed;
    let accel = p.grounded ? 80 : 80 * T.airControl;
    if (p.wallLock > 0) accel = 0;
    let dvx = tx - p.vx, dvz = tz - p.vz;
    const dl = Math.hypot(dvx, dvz), maxDv = accel * dt;
    if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
    p.vx += dvx; p.vz += dvz;
  }

  p.sliding = false;
  if (p.dashTimer > 0 && p.dashAir) p.vy = 0;
  else {
    p.vy = Math.max(p.vy - g * dt, -T.fallSpeed);
    if (wall && p.vy < 0 && hasInput && wall.push > 0.3) {
      if (p.vy < -T.wallSlide) p.vy = -T.wallSlide;
      p.sliding = true; p.carry = 0; p.airDash = true;
    }
  }

  if (moveAxis(0, p.vx * dt)) p.vx = 0;
  if (moveAxis(2, p.vz * dt)) p.vz = 0;
  const wasGrounded = p.grounded, impact = -p.vy;
  hit.box = null;
  const hy = moveAxis(1, p.vy * dt);
  if (hy < 0) {
    p.grounded = true; p.ground = hit.box; p.lastGroundY = p.y;
    if (!wasGrounded) events.push({ type: 'land', impact });
    p.vy = 0; p.airDash = true; p.carry = 0;
  } else {
    p.grounded = false; p.ground = null;
    if (hy > 0) { p.vy = 0; p.jumping = false; }
  }
  if (p.sliding) p.lastGroundY = Math.max(p.lastGroundY, p.y);

  if (p.iframes <= 0) for (const b of SPIKES) if (overlapsBox(p.x, p.y, p.z, b, R + 0.03, -0.06, H + 0.03)) { hazardHit('spikes'); break; }
  if (p.dead > 0 || p.returning > 0) return false;

  updateFire(dt);

  if (p.dashTimer > 0) { p.faceX = p.dashX; p.faceZ = p.dashZ; }
  else if (p.aimTimer > 0) { p.faceX = -sy; p.faceZ = -cy; }
  else if (p.sliding) { p.faceX = -p.wallX; p.faceZ = -p.wallZ; }
  else if (hasInput && p.wallLock <= 0) { p.faceX = wx / mag; p.faceZ = wz / mag; }
  return true;
}
