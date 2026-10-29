// Course rules each step: falling into the lava, reaching checkpoints and the goal, health capsules.
import { CHECKPOINTS, CAPSULES, LEVEL, MAX_HP, H, R, state, events } from '../core/world.js';
import { groundBelow } from '../player/physics.js';
import { p } from '../player/player.js';
import { hazardHit } from '../player/health.js';
import { activateBoss } from '../enemies/enemies.js';

// runs after the player and enemies, only while the player is up
export function updateCourse() {
  // the lava: either you hit the sea, or you've dropped well below your last footing with nothing underneath
  if (p.y < -12 || (p.y < p.lastGroundY - 9 && groundBelow(p.x, p.y, p.z) === -Infinity)) { hazardHit('lava'); return; }
  for (let i = state.cp + 1; i < CHECKPOINTS.length; i++) {
    const c = CHECKPOINTS[i];
    if (p.z <= c.z + 0.5 && Math.abs(p.x - c.x) < 6 && p.y > c.y - 0.6 && p.y < c.y + 5) { state.cp = i; events.push({ type: 'checkpoint', i }); }
  }
  const G0 = LEVEL.goal;
  if (G0.kind === 'door') {
    const door = LEVEL.named.bossDoor;
    if (door) {
      // A fresh run closes the arena gate again. resetEnemies() handles the boss itself.
      if (!state.started) {
        door.open = 0; door.triggered = false; door.openedAt = 0;
        door.enteredArena = false; door.closeStartedAt = 0;
        door.min[1] = door.closedMin[1]; door.max[1] = door.closedMax[1];
      }
      if (!door.triggered && state.started && p.y > G0.y - 0.2 && Math.abs(p.x - G0.x) < G0.xHalf && p.z < G0.triggerZ && p.z > G0.zMin - 2) {
        door.triggered = true; door.openedAt = state.worldT;
        door.enteredArena = false; door.closeStartedAt = 0;
        events.push({ type: 'bossdoor' });
      }
      if (door.triggered) {
        if (!door.enteredArena && p.z < door.closedMin[2] - R - 0.02) {
          door.enteredArena = true;
          door.closeStartedAt = state.worldT;
          activateBoss();
        }
        const opening = Math.max(0, Math.min(1, (state.worldT - door.openedAt) / 1.3));
        door.open = door.enteredArena ? Math.max(0, 1 - (state.worldT - door.closeStartedAt) / 1.3) : opening;
        const lift = 5.2 * door.open;
        // Once inside, collision seals at once while the panel finishes sliding down.
        door.min[1] = door.closedMin[1] + (door.enteredArena ? 0 : lift);
        door.max[1] = door.closedMax[1] + (door.enteredArena ? 0 : lift);
      }
    }
    return;
  }
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
