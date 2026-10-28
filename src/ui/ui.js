// Screens and HUD: start, pause, clear and game-over overlays, the HUD, toasts, screen flashes,
// best times, and the UI keys (T tuning, M sound, H hide controls, R restart, Esc/P pause).
import { MAX_HP, LEVEL, ENTS, CHECKPOINTS, state, on } from '../core/world.js';
import { $, fmtTime, store } from '../core/util.js';
import { tuning, onTuningChange } from '../core/tuning.js';
import { loadLevel, restartCourse } from '../core/sim.js';
import { p, placeAt } from '../player/player.js';
import { releaseAll, lockPointer, releasePointer, isPointerLocked } from '../player/input.js';
import { ensureAudio, isMuted, setMuted } from '../fx/audio.js';
import { refreshTuneOut } from './tuning-panel.js';

const ui = { timer: $('timer'), cp: $('cp-label'), best: $('best-label'), pipDash: $('pip-dash'), pipAir: $('pip-air'), fps: $('fps'), toast: $('toast'), flash: $('flash'), reticle: $('reticle'), hp: $('hud-hp'), lives: $('lives'), boss: $('boss-hud'), bossFill: $('boss-fill'), bossTrack: document.querySelector('.boss-track'), bossLabel: $('boss-health-label') };
const hpSegs = [];
for (let i = 0; i < MAX_HP; i++) { const s = document.createElement('i'); $('hp-bar').appendChild(s); hpSegs.push(s); }
let shownHp = -1, toastTimer = 0, hitTimer = 0, fpsFrames = 0, fpsTime = 0;

export function toast(text, molten = false) { ui.toast.textContent = text; ui.toast.classList.toggle('molten', molten); ui.toast.classList.add('show'); toastTimer = 1.6; }
// a quick vignette: 'hurt' is red, anything else is the orange lava flash
export function flash(kind = 'fall') { ui.flash.classList.toggle('hurt', kind === 'hurt'); ui.flash.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => ui.flash.classList.remove('on'))); }
function updateSoundLabel() { $('sound-label').textContent = isMuted() ? 'Sound off · M' : 'Sound on · M'; }
const bestKey = () => `smelter-yard:best:${LEVEL.id}:v3`;
function updateBestLabel() { ui.best.textContent = state.best != null ? `Best ${fmtTime(state.best)}` : 'No best yet'; }
function showOverlay(id) { for (const o of ['ov-start', 'ov-pause', 'ov-clear', 'ov-over']) $(o).hidden = o !== id; }

// start or resume play; restart = from the beginning; levelId switches level first
export function beginPlay(restart, levelId, checkpointIndex = 0) {
  ensureAudio();
  if (levelId && levelId !== LEVEL.id) loadLevel(levelId);
  else if (restart) restartCourse();
  if (checkpointIndex > 0 && CHECKPOINTS[checkpointIndex]) {
    state.cp = checkpointIndex;
    placeAt(CHECKPOINTS[checkpointIndex]);
  }
  showOverlay(null);
  state.mode = 'play';
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  lockPointer();
}
function backToLevels() {
  state.mode = 'start'; releaseAll();
  releasePointer();
  showOverlay('ov-start');
}
export function pause() {
  if (state.mode !== 'play') return;
  state.mode = 'pause'; releaseAll();
  showOverlay('ov-pause');
}
export function toggleTune(force) {
  const open = typeof force === 'boolean' ? force : !state.tuneOpen;
  if (open === state.tuneOpen) return;
  state.tuneOpen = open;
  $('tune').hidden = !open;
  releaseAll();
  if (open) { releasePointer(); refreshTuneOut(); }
  else if (state.mode === 'play') lockPointer();
}
$('btn-start').addEventListener('click', () => beginPlay(LEVEL.id === 'smelter' ? state.started : true, 'smelter'));
$('btn-boss-practice').addEventListener('click', () => beginPlay(true, 'smelter', 3));
$('btn-yard').addEventListener('click', () => beginPlay(LEVEL.id === 'yard' ? state.started : true, 'yard'));
$('btn-resume').addEventListener('click', () => beginPlay(false));
$('btn-restart').addEventListener('click', () => beginPlay(true));
$('btn-again').addEventListener('click', () => beginPlay(true));
$('btn-over-restart').addEventListener('click', () => beginPlay(true));
for (const id of ['btn-levels', 'btn-clear-levels', 'btn-over-levels']) $(id).addEventListener('click', backToLevels);
for (const id of ['btn-start-tune', 'btn-pause-tune', 'btn-clear-tune', 'btn-over-tune']) $(id).addEventListener('click', () => toggleTune(true));
$('tune-close').addEventListener('click', () => toggleTune(false));

window.addEventListener('keydown', (e) => {
  const inField = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
  if (e.code === 'KeyT' && !e.repeat) { e.preventDefault(); toggleTune(); return; }
  if (e.code === 'Escape' && state.tuneOpen) { toggleTune(false); return; }
  if (inField) return;
  if (e.code === 'KeyM' && !e.repeat) { setMuted(!isMuted()); updateSoundLabel(); return; }
  if (e.code === 'KeyH' && !e.repeat) { const el = $('hud-br'); el.hidden = !el.hidden; return; }
  if (e.code === 'KeyR' && !e.repeat && (state.mode === 'play' || state.mode === 'clear' || state.mode === 'pause' || state.mode === 'over')) { beginPlay(true); return; }
  if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && state.mode === 'play' && !isPointerLocked()) pause();
});

on('level', () => {
  for (const id of ['hud-level', 'pause-level', 'over-level']) $(id).textContent = LEVEL.name;
  state.best = store.get(bestKey(), null); updateBestLabel();
});
on('hurt', () => { if (p.hp > 0) flash('hurt'); });
on('die', (e) => { flash('hurt'); toast(e.last ? 'Game over' : 'Life lost', true); if (e.last) gameOverScreen(); });
on('revive', () => toast(`${state.lives} ${state.lives === 1 ? 'life' : 'lives'} left`));
on('pickup', () => toast('+6 HP'));
on('checkpoint', (e) => toast(`Checkpoint ${e.i} of ${LEVEL.cpCount}`));
on('lava', () => flash());
on('spikes', () => flash('hurt'));
on('hit', () => { hitTimer = 0.12; });
on('clear', onClear);

function onClear() {
  const t = state.time;
  const isBest = state.best == null || t < state.best;
  if (isBest) { state.best = t; store.set(bestKey(), t); }
  updateBestLabel();
  const G0 = LEVEL.goal;
  $('clear-time').textContent = fmtTime(t);
  const plural = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  const parts = [isBest ? 'New best time' : `Best ${fmtTime(state.best)}`, `${plural(state.lives, 'life', 'lives')} left of ${tuning.lives}`, plural(state.kills, 'enemy destroyed', 'enemies destroyed')];
  $('clear-detail').textContent = `${parts.join(' · ')}.`;
  $('clear-title').textContent = G0.kind === 'door' ? 'Boss door reached' : 'Course clear';
  $('clear-note').textContent = G0.kind === 'door'
    ? 'The boss fight behind this door is milestone 6. Note what felt off: a section too long or too hard, enemy placement, crusher or platform timing, anything. If you changed sliders, copy your settings from the tuning panel and paste them into your chat.'
    : 'Note what felt off. If you changed sliders, copy your settings from the tuning panel and paste them into your chat.';
  state.mode = 'clear'; releaseAll();
  releasePointer();
  setTimeout(() => showOverlay('ov-clear'), 450);
}
function gameOverScreen() {
  releaseAll();
  const where = state.cp === 0 ? 'before the first checkpoint' : `after checkpoint ${state.cp} of ${LEVEL.cpCount}`;
  $('over-detail').textContent = `You lost your last life at ${fmtTime(state.time)}, ${where}. The run starts over from the beginning.`;
  releasePointer();
  setTimeout(() => { if (state.mode === 'over') showOverlay('ov-over'); }, 1100);
}

onTuningChange(() => { $('lives-note').textContent = tuning.lives; });
export function initUI() { updateSoundLabel(); updateBestLabel(); $('lives-note').textContent = tuning.lives; }

export function updateHud(dt) {
  ui.timer.textContent = fmtTime(state.time);
  ui.cp.textContent = state.cp === 0 ? 'Start' : `Checkpoint ${state.cp} of ${LEVEL.cpCount}`;
  ui.lives.textContent = `×${state.lives}`;
  const boss = ENTS.find((e) => e.kind === 'boss');
  ui.boss.hidden = !boss || !boss.activated;
  if (boss && boss.activated) {
    const progress = Math.max(0, Math.min(1, boss.combatReady ? boss.hp / boss.maxHp : boss.introProgress));
    ui.bossFill.style.transform = `scaleX(${progress})`;
    ui.bossLabel.textContent = `${Math.round(progress * 100)}%`;
    ui.bossTrack.setAttribute('aria-valuenow', `${Math.round(progress * 100)}`);
  }
  ui.pipDash.classList.toggle('on', p.dashTimer <= 0 && p.dashCD <= 0);
  ui.pipAir.classList.toggle('on', p.airDash);
  if (shownHp !== p.hp) {
    shownHp = p.hp;
    hpSegs.forEach((s, i) => s.classList.toggle('on', i < p.hp));
    ui.hp.classList.toggle('low', p.hp <= MAX_HP / 4);
    ui.hp.classList.toggle('critical', p.hp > 0 && p.hp <= 4);
  }
  if (hitTimer > 0) { hitTimer -= dt; ui.reticle.classList.add('hit'); } else ui.reticle.classList.remove('hit');
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.classList.remove('show'); }
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) { ui.fps.textContent = `${Math.round(fpsFrames / fpsTime)} fps`; fpsFrames = 0; fpsTime = 0; }
}
