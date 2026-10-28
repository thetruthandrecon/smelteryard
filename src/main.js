// Entry point: loads every lane, starts the game and runs the frame loop.
import { STEP, state, CHECKPOINTS, LEVEL, SOLIDS, ENTS, CAPSULES, DYN, CRUSHERS, MAX_HP, input, cam, events, dispatchEvents, isPlaying } from './core/world.js';
import { tuning } from './core/tuning.js';
import { renderer, scene, camera, renderWorld, applyDisplaySettings, resize } from './core/render.js';
import { step, restartCourse, loadLevel } from './core/sim.js';
import './levels/index.js';
import { LEVELS } from './levels/builders.js';
import { crusherState } from './levels/hazards.js';
import { renderLevel, markCheckpoints } from './levels/visuals.js';
import { p, placeAt } from './player/player.js';
import { hurt } from './player/health.js';
import { gatherInput } from './player/input.js';
import { camState, updateCamera } from './player/camera.js';
import { renderPlayer } from './player/model.js';
import { SHOTS, aimRay, renderShots } from './combat/shots.js';
import { ESHOTS } from './enemies/enemies.js';
import { renderEnemies } from './enemies/models.js';
import { updateParticles, renderEmbers } from './fx/particles.js';
import { initUI, updateHud } from './ui/ui.js';
import { initTuningPanel } from './ui/tuning-panel.js';

let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  gatherInput(dt);
  if (isPlaying()) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 12) { step(STEP); acc -= STEP; n++; }
    if (n === 12) acc = 0;
  }
  // draw between the last two steps so motion stays smooth at any frame rate
  const a = isPlaying() ? acc / STEP : 1;
  const ix = p.px + (p.x - p.px) * a, iy = p.py + (p.y - p.py) * a, iz = p.pz + (p.z - p.pz) * a;
  dispatchEvents();
  updateParticles(dt);
  updateCamera(dt, ix, iy, iz);
  renderPlayer(dt, ix, iy, iz);
  renderShots();
  renderEnemies();
  renderLevel(dt);
  renderEmbers(dt, ix, iy, iz);
  renderWorld(dt, ix, iy, iz);
  updateHud(dt);
  renderer.render(scene, camera);
}

function boot(data) {
  const d = data && typeof data === 'object' ? data : {};
  loadLevel(LEVELS[d.level] ? d.level : 'smelter');
  dispatchEvents();
  if (Number.isInteger(d.cp) && d.cp > 0 && d.cp < CHECKPOINTS.length) { state.cp = d.cp; placeAt(CHECKPOINTS[d.cp]); markCheckpoints(d.cp); }
  initTuningPanel(); initUI();
  applyDisplaySettings(); resize();
  requestAnimationFrame((t) => { last = t; frame(t); });
}
// when published as a Claude artifact, keep the level and checkpoint across live updates
const hot = window.claude && window.claude.hot;
if (hot && typeof hot.snapshot === 'function') { try { hot.snapshot(() => ({ level: LEVEL.id, cp: state.cp })); } catch { /* optional */ } }
if (hot && typeof hot.ready === 'function') hot.ready(boot); else boot((hot && hot.data) || {});

// test hook for the automated playtest (tests/). Keep these names.
window.__game = {
  p, input, cam, state, tuning, step, restartCourse, placeAt, loadLevel, LEVEL, CHECKPOINTS, SOLIDS, STEP, events, camera, camState, ENTS, SHOTS, ESHOTS, CAPSULES, DYN, CRUSHERS, crusherState, hurt, aimRay, MAX_HP,
  get MP1() { return LEVEL.named.MP1; }, get MP2() { return LEVEL.named.MP2; }, get GOAL() { return LEVEL.goal; },
};
