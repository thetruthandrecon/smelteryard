// The fixed-step simulation (120 steps a second): the order every lane updates in,
// restarting a run and switching levels.
import { CHECKPOINTS, LEVEL, cam, state, events } from './world.js';
import { tuning } from './tuning.js';
import { p, placeAt, updatePlayer } from '../player/player.js';
import { updateShots, resetShots } from '../combat/shots.js';
import { updateEnemies, resetEnemies } from '../enemies/enemies.js';
import { LEVELS, setupLevel } from '../levels/builders.js';
import { updateHazards, resetHazards } from '../levels/hazards.js';
import { updateCourse, updatePickups, resetPickups } from '../levels/course.js';
import { buildLevelVisuals } from '../levels/visuals.js';

export function step(dt) {
  if (state.timing) state.time += dt;
  state.worldT += dt;
  updateHazards();                         // levels: platforms and crushers move
  const up = updatePlayer(dt);             // player: movement, riding, spikes, firing
  updateShots(dt);                         // combat: shots fly and hit
  updateEnemies(dt);                       // enemies: behaviour, enemy shots, contact damage
  updatePickups(dt);                       // levels: health capsules
  if (up && p.dead <= 0) updateCourse();   // levels: lava, checkpoints, goal
}

export function resetWorld() {
  resetEnemies(); resetPickups(); resetShots();
  state.worldT = 0;
  resetHazards();
}
// back to the start of the current level with full lives
export function restartCourse() {
  state.cp = 0; state.time = 0; state.timing = false; state.started = false; state.cleared = false; state.falls = 0; state.kos = 0; state.kills = 0; state.spikeHits = 0; state.lives = tuning.lives;
  resetWorld();
  placeAt(CHECKPOINTS[0]);
  cam.yaw = 0; cam.pitch = -0.2;
  events.push({ type: 'restart' });
}
export function loadLevel(id) {
  if (!LEVELS[id]) id = 'smelter';
  if (LEVEL.id !== id) { setupLevel(id); buildLevelVisuals(); events.push({ type: 'level' }); }
  restartCourse();
}
