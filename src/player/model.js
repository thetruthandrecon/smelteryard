// The hero's look and feel: model, animation, dash afterimages, blob shadow, charge glow,
// and the effects and sounds for the player's own events.
import * as THREE from '../core/three.js';
import { R, cam, on, isPlaying } from '../core/world.js';
import { tuning } from '../core/tuning.js';
import { clamp, damp, angleDamp } from '../core/util.js';
import { scene, dotTex } from '../core/render.js';
import { groundBelow } from './physics.js';
import { p } from './player.js';
import { shake, resetView } from './camera.js';
import { emit, burst, C_TEAL, C_MOLTEN, C_DUST, C_WHITE, C_RED, C_AMBER } from '../fx/particles.js';
import { tone, hiss, setHum, stopHum, audioTime } from '../fx/audio.js';

function makePlayer() {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x1d8a82, roughness: 0.42, metalness: 0.35 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.5, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.7, metalness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a2a, emissiveIntensity: 2.4 });
  const core = new THREE.MeshStandardMaterial({ color: 0x8ff7ec, emissive: 0x3ad6c6, emissiveIntensity: 1.8 });
  const thrusterMat = core.clone();
  const muzzleMat = core.clone();
  const body = new THREE.Group(); group.add(body);
  const mk = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const hipL = new THREE.Group(); hipL.position.set(-0.17, 0.86, 0); body.add(hipL);
  const hipR = new THREE.Group(); hipR.position.set(0.17, 0.86, 0); body.add(hipR);
  for (const hip of [hipL, hipR]) {
    mk(new THREE.BoxGeometry(0.22, 0.5, 0.26), dark, 0, -0.25, 0, hip);
    mk(new THREE.BoxGeometry(0.28, 0.42, 0.34), armor, 0, -0.6, 0, hip);
    mk(new THREE.BoxGeometry(0.3, 0.12, 0.44), plate, 0, -0.8, -0.04, hip);
  }
  mk(new THREE.BoxGeometry(0.5, 0.2, 0.32), dark, 0, 0.92, 0, body);
  const torso = new THREE.Group(); torso.position.set(0, 1.0, 0); body.add(torso);
  mk(new THREE.BoxGeometry(0.62, 0.52, 0.4), armor, 0, 0.26, 0, torso);
  mk(new THREE.BoxGeometry(0.44, 0.3, 0.06), plate, 0, 0.3, -0.21, torso);
  mk(new THREE.BoxGeometry(0.12, 0.12, 0.04), core, 0, 0.3, -0.25, torso);
  mk(new THREE.BoxGeometry(0.4, 0.4, 0.18), dark, 0, 0.24, 0.27, torso);
  mk(new THREE.BoxGeometry(0.26, 0.1, 0.06), thrusterMat, 0, 0.08, 0.37, torso);
  const head = new THREE.Group(); head.position.set(0, 0.6, 0); torso.add(head);
  mk(new THREE.BoxGeometry(0.42, 0.38, 0.42), plate, 0, 0.12, 0, head);
  mk(new THREE.BoxGeometry(0.46, 0.08, 0.46), armor, 0, 0.3, 0, head);
  mk(new THREE.BoxGeometry(0.36, 0.09, 0.05), visor, 0, 0.12, -0.22, head);
  mk(new THREE.BoxGeometry(0.06, 0.2, 0.32), armor, 0, 0.4, 0.02, head);
  const shL = new THREE.Group(); shL.position.set(-0.42, 0.42, 0); torso.add(shL);
  const shR = new THREE.Group(); shR.position.set(0.42, 0.42, 0); torso.add(shR);
  mk(new THREE.BoxGeometry(0.26, 0.22, 0.3), armor, 0, 0, 0, shL);
  mk(new THREE.BoxGeometry(0.18, 0.5, 0.2), dark, 0, -0.3, 0, shL);
  mk(new THREE.BoxGeometry(0.22, 0.2, 0.24), plate, 0, -0.56, 0, shL);
  mk(new THREE.BoxGeometry(0.26, 0.22, 0.3), armor, 0, 0, 0, shR);
  mk(new THREE.BoxGeometry(0.18, 0.34, 0.2), dark, 0, -0.24, 0, shR);
  mk(new THREE.CylinderGeometry(0.15, 0.17, 0.42, 10), armor, 0, -0.5, 0, shR);
  mk(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 10), muzzleMat, 0, -0.72, 0, shR);
  return { group, body, hipL, hipR, torso, head, shL, shR, thrusterMat, muzzleMat };
}
const hero = makePlayer();
scene.add(hero.group);

const blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshBasicMaterial({ map: dotTex, color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.renderOrder = 2;
scene.add(blob);

// dash afterimages: clones of the hero frozen in place, fading out
const srcNodes = []; hero.group.traverse((o) => srcNodes.push(o));
const ghosts = [];
for (let i = 0; i < 10; i++) {
  const g = hero.group.clone(true);
  const mat = new THREE.MeshBasicMaterial({ color: 0x3ad6c6, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const nodes = []; g.traverse((o) => { nodes.push(o); if (o.isMesh) o.material = mat; });
  g.visible = false; scene.add(g);
  ghosts.push({ g, mat, nodes, life: 0 });
}
let ghostNext = 0, ghostTimer = 0;
function spawnGhost() {
  const gh = ghosts[ghostNext++ % ghosts.length];
  for (let i = 0; i < srcNodes.length; i++) { const s = srcNodes[i], d = gh.nodes[i]; d.position.copy(s.position); d.rotation.copy(s.rotation); d.scale.copy(s.scale); }
  gh.g.visible = true; gh.life = 0.26;
}

const sfx = {
  jump: () => tone(320, 640, 0.1, 'square', 0.08),
  dashjump: () => { tone(320, 720, 0.12, 'square', 0.08); hiss(0.12, 2400, 900, 0.08); },
  walljump: () => { tone(460, 900, 0.09, 'square', 0.08); hiss(0.06, 3500, 1800, 0.1); },
  dash: () => { hiss(0.2, 2600, 500, 0.18); tone(200, 90, 0.16, 'sawtooth', 0.05); },
  airdash: () => { hiss(0.2, 3400, 700, 0.18); tone(300, 140, 0.16, 'sawtooth', 0.05); },
  land: (impact) => tone(150, 55, 0.09, 'sine', clamp(impact * 0.018, 0.04, 0.4)),
  hurt: () => { tone(500, 140, 0.22, 'sawtooth', 0.12); hiss(0.12, 1500, 500, 0.12); },
  die: () => { tone(600, 60, 0.9, 'sawtooth', 0.12); hiss(0.8, 2000, 100, 0.2); },
};

const anim = { phase: 0, yaw: 0, squash: 1, slideFx: 0, chargeFx: 0 };
on('jump', (e) => { burst(p.x, p.y + 0.05, p.z, 10, 3, C_DUST, { up: 0.4, grav: 4 }); (e.dash ? sfx.dashjump : sfx.jump)(); });
on('walljump', (e) => { burst(e.x, e.y, e.z, 16, 4, C_MOLTEN, { up: 1, grav: 9, life: 0.4 }); sfx.walljump(); });
on('dash', () => { burst(p.x, p.y + 0.1, p.z, 14, 3.5, C_TEAL, { up: 0.3, grav: 2, dirX: -p.dashX * 4, dirZ: -p.dashZ * 4 }); sfx.dash(); });
on('airdash', () => { burst(p.x, p.y + 1, p.z, 18, 4, C_TEAL, { up: 0.6, grav: 1, dirX: -p.dashX * 5, dirZ: -p.dashZ * 5 }); sfx.airdash(); });
on('land', (e) => {
  if (e.impact > 6) { burst(p.x, p.y + 0.05, p.z, Math.min(22, Math.round(e.impact)), 2.6, C_DUST, { up: 0.3, grav: 3 }); anim.squash = 1 - clamp(e.impact * 0.011, 0, 0.24); }
  sfx.land(e.impact);
});
on('hurt', () => { if (p.hp > 0) { sfx.hurt(); shake(0.25); } });
on('die', (e) => {
  burst(e.x, e.y + 1, e.z, 60, 8, C_TEAL, { up: 1.2, grav: 3, life: 0.9 }); burst(e.x, e.y + 1, e.z, 30, 5, C_WHITE, { up: 1, grav: 1, life: 0.6 });
  sfx.die(); stopHum(); shake(0.4, true);
});
on('revive', () => { resetView(); burst(p.x, p.y + 1, p.z, 24, 3, C_TEAL, { up: 1, grav: 0, life: 0.5 }); });
on('return', () => { resetView(); burst(p.x, p.y + 1, p.z, 24, 3, C_TEAL, { up: 1, grav: 0, life: 0.5 }); });
on('spikes', (e) => {
  burst(e.x, e.y + 0.4, e.z, 24, 4, C_RED, { up: 1, grav: 6, life: 0.4 }); burst(e.x, e.y + 0.4, e.z, 12, 3, C_WHITE, { up: 1, grav: 4, life: 0.3 });
  sfx.hurt(); shake(0.25);
});
// falling into the lava: a splash on the lava sea far below
on('lava', (e) => {
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 4;
    emit(e.x + Math.cos(a) * 0.4, -13.9, e.z + Math.sin(a) * 0.4, Math.cos(a) * s, 4 + Math.random() * 7, Math.sin(a) * s, 0.9 + Math.random() * 0.6, Math.random() < 0.5 ? C_MOLTEN : C_AMBER, 9);
  }
  hiss(0.9, 1800, 200, 0.3); tone(220, 40, 0.8, 'sawtooth', 0.12);
  stopHum(); shake(0.35, true);
});

// per frame: pose the hero at the interpolated position (ix, iy, iz)
export function renderPlayer(dt, ix, iy, iz) {
  const T = tuning;
  const now = performance.now() / 1000;
  hero.group.position.set(ix, iy, iz);
  hero.group.visible = p.dead <= 0 && p.returning <= 0 && !(p.iframes > 0 && Math.floor(now * 16) % 2 === 0);
  const targetYaw = Math.atan2(-p.faceX, -p.faceZ);
  anim.yaw = angleDamp(anim.yaw, targetYaw, p.dashTimer > 0 || p.aimTimer > 0 ? 30 : 16, dt);
  hero.group.rotation.y = anim.yaw;
  const spd = Math.hypot(p.vx, p.vz);
  const dashing = p.dashTimer > 0;
  if (p.grounded) anim.phase += dt * spd * 1.7;
  const sw = p.grounded ? clamp(spd / T.runSpeed, 0, 1.2) : 0;
  let legL = Math.sin(anim.phase) * 0.85 * sw, legR = -legL, armL = -legL * 0.8, armR = legL * 0.45, lean = -0.08 * sw, headX = 0;
  if (!p.grounded) { legL = 0.55; legR = -0.35; armL = -0.5; armR = 0.3; lean = 0; }
  if (p.sliding) { legL = 0.5; legR = 0.9; armL = 2.4; armR = 0.4; lean = 0.15; headX = 0.2; }
  if (dashing) { legL = -0.7; legR = -1.0; armL = -0.9; armR = -0.4; lean = -0.38; }
  if (p.stun > 0) { lean = 0.35; armL = -0.6; armR = -0.6; headX = -0.3; }
  if (p.aimTimer > 0 || (p.charging && p.charge > T.chargeTime1)) { armR = Math.PI / 2 + cam.pitch; headX = -cam.pitch * 0.5; }
  const r = 22;
  hero.hipL.rotation.x = damp(hero.hipL.rotation.x, legL, r, dt);
  hero.hipR.rotation.x = damp(hero.hipR.rotation.x, legR, r, dt);
  hero.shL.rotation.x = damp(hero.shL.rotation.x, armL, r, dt);
  hero.shR.rotation.x = damp(hero.shR.rotation.x, armR, 30, dt);
  hero.body.rotation.x = damp(hero.body.rotation.x, lean, 16, dt);
  hero.head.rotation.x = damp(hero.head.rotation.x, headX, 12, dt);
  hero.body.position.y = p.grounded ? Math.abs(Math.sin(anim.phase)) * 0.05 * sw : 0;
  anim.squash = damp(anim.squash, 1, 12, dt);
  hero.body.scale.set(1 / Math.sqrt(anim.squash), anim.squash, 1 / Math.sqrt(anim.squash));
  hero.thrusterMat.emissiveIntensity = damp(hero.thrusterMat.emissiveIntensity, dashing ? 7 : 1.4, 20, dt);

  // charge glow at the arm cannon, particles drawn in, and the charge hum
  const lvl = !p.charging ? -1 : p.charge >= T.chargeTime2 ? 2 : p.charge >= T.chargeTime1 ? 1 : 0;
  const pulse = 0.5 + 0.5 * Math.sin(now * (lvl === 2 ? 40 : 22));
  hero.muzzleMat.emissive.set(lvl === 2 ? 0xffb347 : 0x3ad6c6);
  hero.muzzleMat.emissiveIntensity = lvl >= 1 ? 3 + pulse * 5 : 1.8;
  if (p.charging && p.charge > 0.18 && p.dead <= 0) {
    anim.chargeFx -= dt;
    if (anim.chargeFx <= 0) {
      anim.chargeFx = lvl === 2 ? 0.012 : 0.025;
      const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * 1.6, rr = 1.1;
      const ox = Math.cos(a) * rr, oy = b, oz = Math.sin(a) * rr;
      emit(ix + ox, iy + 1.1 + oy, iz + oz, -ox * 3.2, -oy * 3.2, -oz * 3.2, 0.3, lvl === 2 ? C_AMBER : C_TEAL, 0);
    }
    const frac = lvl >= 2 ? 1 : clamp(p.charge / T.chargeTime2, 0, 1);
    const hl = p.charge > 0.25 ? Math.max(lvl, 0) : -1;
    if (hl < 0 || !isPlaying()) stopHum();
    else setHum(110 + frac * 260 + (hl === 2 ? 40 * Math.sin(audioTime() * 40) : 0), hl === 2 ? 0.05 : 0.03);
  } else stopHum();

  if (dashing || (p.carry > 0 && !p.grounded)) { ghostTimer -= dt; if (ghostTimer <= 0) { spawnGhost(); ghostTimer = dashing ? 0.03 : 0.06; } } else ghostTimer = 0;
  for (const gh of ghosts) {
    if (gh.life <= 0) continue;
    gh.life -= dt;
    if (gh.life <= 0) { gh.g.visible = false; continue; }
    gh.mat.opacity = 0.42 * (gh.life / 0.26);
  }

  if (p.sliding) {
    anim.slideFx -= dt;
    if (anim.slideFx <= 0) { anim.slideFx = 0.025; emit(ix - p.wallX * R, iy + 0.9 + Math.random() * 0.4, iz - p.wallZ * R, p.wallX * 1.5 + (Math.random() - 0.5), 1.5 + Math.random() * 2, p.wallZ * 1.5 + (Math.random() - 0.5), 0.35, C_MOLTEN, 9); }
  }

  const gy = groundBelow(ix, iy, iz);
  if (gy > -50 && p.dead <= 0 && p.returning <= 0) {
    const h = iy - gy;
    blob.visible = true;
    blob.position.set(ix, gy + 0.02, iz);
    const s = clamp(1.1 - h * 0.05, 0.45, 1.1);
    blob.scale.set(s, s, s);
    blob.material.opacity = clamp(0.62 - h * 0.025, 0.22, 0.62);
  } else blob.visible = false;
}
