// Player health, damage, knockouts and lives. Other lanes damage the player only through hurt(),
// hazardHit() and ko().
import { MAX_HP, state, events } from '../core/world.js';
import { tuning, defineTuning, onTuningChange } from '../core/tuning.js';
import { p } from './player.js';

defineTuning('Health and lives', [
  ['damageTaken', 'Damage taken', 1, 0, 3, 0.25, '×'],
  ['lives', 'Lives per run', 3, 1, 9, 1, ''],
]);
onTuningChange(() => { if (state.mode === 'start') state.lives = tuning.lives; });

export function die() {
  p.dead = 1.3; p.vx = p.vy = p.vz = 0; p.charging = false; p.charge = 0; p.dashTimer = 0;
  state.kos += 1;
  const last = loseLife();
  events.push({ type: 'die', x: p.x, y: p.y, z: p.z, last });
}
// every knockout costs a life; losing the last one ends the run
export function loseLife() {
  state.lives -= 1;
  if (state.lives > 0) return false;
  state.lives = 0; state.timing = false; p.dead = 99; state.mode = 'over';
  return true;
}
// instant knockout (crushers)
export function ko() {
  if (p.dead > 0) return;
  p.hp = 0;
  die();
}
// spikes and lava take a quarter of your health and put you back at the checkpoint;
// if that empties your health it counts as a knockout and costs a life
export function hazardHit(kind) {
  if (p.dead > 0 || p.returning > 0) return;
  if (kind === 'lava') state.falls += 1; else state.spikeHits += 1;
  p.hp = Math.max(0, p.hp - MAX_HP / 4);
  p.vx = p.vy = p.vz = 0; p.charging = false; p.charge = 0; p.dashTimer = 0; p.stun = 0;
  events.push({ type: kind, x: p.x, y: p.y, z: p.z });
  if (p.hp <= 0) { die(); return; }
  p.returning = 0.9; p.iframes = 2;
}
// a hit from an enemy: amount of HP (callers scale it by tuning.damageTaken), knocked back along dirX/dirZ.
// Returns false if the player was invincible at that moment.
export function hurt(amount, dirX, dirZ) {
  if (p.iframes > 0 || p.dead > 0 || p.returning > 0 || amount <= 0) return false;
  p.hp = Math.max(0, p.hp - amount);
  events.push({ type: 'hurt', amount });
  if (p.hp <= 0) { die(); return true; }
  p.stun = 0.3; p.iframes = 1.2; p.dashTimer = 0; p.carry = 0; p.jumping = false;
  const m = Math.hypot(dirX, dirZ) || 1;
  p.vx = (dirX / m) * 4.5; p.vz = (dirZ / m) * 4.5; p.vy = Math.max(p.vy, 4);
  return true;
}
