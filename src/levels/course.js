// Course rules each step: falling into the lava, reaching checkpoints and the goal, health capsules.
import { CHECKPOINTS, CAPSULES, LEVEL, MAX_HP, H, state, events } from '../core/world.js';
import { groundBelow } from '../player/physics.js';
import { p } from '../player/player.js';
import { hazardHit } from '../player/health.js';

// runs after the player and enemies, only while the player is up
export function updateCourse() {
  // the lava: either you hit the sea, or you've dropped well below your last footing with nothing underneath
  if (p.y < -12 || (p.y < p.lastGroundY - 9 && groundBelow(p.x, p.y, p.z) === -Infinity)) { hazardHit('lava'); return; }
  for (let i = state.cp + 1; i < CHECKPOINTS.length; i++) {
    const c = CHECKPOINTS[i];
    if (p.z <= c.z + 0.5 && Math.abs(p.x - c.x) < 6 && p.y > c.y - 0.6 && p.y < c.y + 5) { state.cp = i; events.push({ type: 'checkpoint', i }); }
  }
  const G0 = LEVEL.goal;
  if (!state.cleared && p.y > G0.y - 0.2 && Math.abs(p.x - G0.x) < G0.xHalf && p.z < G0.zMax && p.z > G0.zMin) {
    state.cleared = true; state.timing = false;
    events.push({ type: 'clear' });
  }
}
// health capsules: +6 HP, back 15 s after being picked up
export function updatePickups(dt) {
  for (const c of CAPSULES) {
    if (!c.active) { c.timer -= dt; if (c.timer <= 0) c.active = true; continue; }
    if (p.dead <= 0 && p.hp < MAX_HP && Math.hypot(p.x - c.x, p.z - c.z) < 0.9 && p.y < c.y + 1.2 && p.y + H > c.y) {
      p.hp = Math.min(MAX_HP, p.hp + 6); c.active = false; c.timer = 15;
      events.push({ type: 'pickup', x: c.x, y: c.y, z: c.z });
    }
  }
}
export function resetPickups() { for (const c of CAPSULES) { c.active = true; c.timer = 0; } }
