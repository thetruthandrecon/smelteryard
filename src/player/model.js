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
import { modelsEnabled, loadModel } from '../core/models.js';
import { aimRay, hitStopRemaining } from '../combat/shots.js';

// The hero: teal armor with white plating, an orange visor band, a swept crest, a teal chest core and
// back thrusters; jointed knees and elbows; the right forearm is the arm cannon. About 1.85 m tall,
// so it fills the 0.4 m by 1.8 m collision capsule. It faces -z.
function makePlayer() {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x1d8a82, roughness: 0.4, metalness: 0.4 });
  const armorDark = new THREE.MeshStandardMaterial({ color: 0x14625c, roughness: 0.45, metalness: 0.4 });
  const plate = new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.45, metalness: 0.25 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.7, metalness: 0.3 });
  const visor = new THREE.MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a2a, emissiveIntensity: 2.4 });
  const core = new THREE.MeshStandardMaterial({ color: 0x8ff7ec, emissive: 0x3ad6c6, emissiveIntensity: 1.8 });
  const thrusterMat = core.clone();
  const muzzleMat = core.clone();
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const mk = (geo, mat, x, y, z, parent, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m;
  };
  const grp = (x, y, z, parent) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
  const body = grp(0, 0, 0, group);

  // legs: hip -> thigh -> knee -> shin and boot, with a heel thruster
  const legs = [];
  for (const side of [-1, 1]) {
    const hip = grp(side * 0.17, 0.9, 0, body);
    mk(box(0.2, 0.42, 0.22), dark, 0, -0.2, 0, hip);
    mk(box(0.24, 0.26, 0.07), armorDark, 0, -0.17, -0.12, hip);
    const knee = grp(0, -0.42, 0, hip);
    mk(box(0.2, 0.15, 0.09), plate, 0, 0.01, -0.13, knee);
    mk(box(0.26, 0.34, 0.3), armor, 0, -0.2, 0.01, knee);
    mk(box(0.3, 0.14, 0.44), plate, 0, -0.39, -0.05, knee);
    const sole = mk(box(0.32, 0.05, 0.46), dark, 0, -0.455, -0.05, knee);
    mk(box(0.16, 0.06, 0.04), thrusterMat, 0, -0.35, 0.18, knee);
    legs.push({ hip, knee, sole });
  }

  // pelvis and belt
  mk(box(0.5, 0.2, 0.32), dark, 0, 0.92, 0, body);
  mk(box(0.54, 0.07, 0.36), armorDark, 0, 0.99, 0, body);
  mk(box(0.12, 0.08, 0.04), core, 0, 0.98, -0.19, body);

  // torso: abdomen, tapered chest, white chest plate with the core, collar, backpack with twin thrusters
  const torso = grp(0, 1.0, 0, body);
  mk(box(0.42, 0.18, 0.3), dark, 0, 0.08, 0, torso);
  mk(box(0.66, 0.36, 0.42), armor, 0, 0.34, 0, torso);
  mk(box(0.48, 0.12, 0.38), armorDark, 0, 0.13, 0, torso);
  mk(box(0.46, 0.22, 0.06), plate, 0, 0.36, -0.22, torso);
  mk(box(0.12, 0.12, 0.04), core, 0, 0.36, -0.26, torso);
  mk(box(0.42, 0.07, 0.36), plate, 0, 0.55, 0, torso);
  mk(box(0.44, 0.4, 0.2), dark, 0, 0.3, 0.28, torso);
  mk(box(0.1, 0.12, 0.04), thrusterMat, -0.12, 0.17, 0.39, torso);
  mk(box(0.1, 0.12, 0.04), thrusterMat, 0.12, 0.17, 0.39, torso);

  // head: helmet, faceplate, wrap-around visor, a swept crest along the top
  const head = grp(0, 0.57, 0, torso);
  mk(box(0.16, 0.1, 0.16), dark, 0, 0.02, 0, head);
  mk(box(0.4, 0.34, 0.42), plate, 0, 0.21, 0, head);
  mk(box(0.44, 0.06, 0.46), armor, 0, 0.38, 0.01, head);
  mk(box(0.34, 0.1, 0.06), armor, 0, 0.08, -0.21, head);
  mk(box(0.36, 0.08, 0.05), visor, 0, 0.21, -0.22, head);
  mk(box(0.05, 0.06, 0.14), visor, -0.19, 0.21, -0.14, head);
  mk(box(0.05, 0.06, 0.14), visor, 0.19, 0.21, -0.14, head);
  mk(box(0.06, 0.07, 0.34), armor, 0, 0.43, 0.02, head);
  mk(box(0.06, 0.12, 0.14), armorDark, 0, 0.43, 0.22, head, -0.5);

  // arms: angled pauldron, upper arm, elbow; left gauntlet with a hand, right forearm is the cannon
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = grp(side * 0.43, 0.46, 0, torso);
    mk(box(0.26, 0.2, 0.34), armor, side * 0.02, 0.04, 0, sh, 0, 0, -side * 0.25);
    mk(box(0.28, 0.04, 0.36), plate, side * 0.03, 0.15, 0, sh, 0, 0, -side * 0.25);
    mk(box(0.16, 0.32, 0.18), dark, 0, -0.24, 0, sh);
    const elbow = grp(0, -0.4, 0, sh);
    if (side < 0) {
      mk(box(0.2, 0.28, 0.22), armor, 0, -0.14, 0, elbow);
      mk(box(0.22, 0.06, 0.24), plate, 0, -0.02, 0, elbow);
      mk(box(0.14, 0.12, 0.14), dark, 0, -0.34, 0, elbow);
    } else {
      mk(new THREE.CylinderGeometry(0.15, 0.17, 0.44, 12), armor, 0, -0.2, 0, elbow);
      mk(new THREE.CylinderGeometry(0.175, 0.175, 0.05, 12), plate, 0, -0.05, 0, elbow);
      mk(new THREE.CylinderGeometry(0.165, 0.165, 0.04, 12), plate, 0, -0.32, 0, elbow);
      mk(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 12), muzzleMat, 0, -0.43, 0, elbow);
    }
    arms.push({ sh, elbow });
  }
  return {
    group, body, torso, head, thrusterMat, muzzleMat, soles: [legs[0].sole, legs[1].sole],
    hipL: legs[0].hip, kneeL: legs[0].knee, hipR: legs[1].hip, kneeR: legs[1].knee,
    shL: arms[0].sh, elbowL: arms[0].elbow, shR: arms[1].sh, elbowR: arms[1].elbow,
  };
}
const hero = makePlayer();
const soleBox = new THREE.Box3();
// the hero's model parts, read by the player tests
export const heroModel = hero;
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
  if (gh.glb && heroGlb.wrap) {
    // the 3D model hero's afterimage: its own copy of the model, frozen in the live pose
    const G = gh.glb;
    G.root.position.copy(hero.group.position); G.root.rotation.copy(hero.group.rotation);
    G.wrap.rotation.copy(heroGlb.wrap.rotation); G.wrap.scale.copy(heroGlb.wrap.scale);
    for (let i = 0; i < G.nodes.length; i++) { const s = heroGlb.nodes[i], d = G.nodes[i]; d.position.copy(s.position); d.quaternion.copy(s.quaternion); d.scale.copy(s.scale); }
    G.root.visible = true; gh.life = 0.26;
    return;
  }
  for (let i = 0; i < srcNodes.length; i++) { const s = srcNodes[i], d = gh.nodes[i]; d.position.copy(s.position); d.rotation.copy(s.rotation); d.scale.copy(s.scale); }
  gh.g.visible = true; gh.life = 0.26;
}

// The 3D model hero (assets/models/hero.glb): H's design, rigged and animated in Mixamo, with clips
// idle, run, jump (takeoff to peak), land and fall. Once it has loaded it replaces the code-built body;
// the code-built hero stays as the fallback and is what the tests see (models are off for test bots).
// Looks only: the collision capsule, movement and timing never read it.
const HERO_HEIGHT = 2.0; // m, crest included, like the code-built hero
const BONE = (n) => 'mixamorig' + n;
export const heroGlb = { wrap: null, model: null, skinned: null, soles: [], mixer: null, actions: {}, clip: '', nodes: [], bones: {}, muzzle: null, glow: null, aimW: 0, reachW: 0, lean: 0, landT: 0, requested: false };

function requestHeroGlb() {
  heroGlb.requested = true;
  if (!modelsEnabled()) return;
  Promise.all(Array.from({ length: 1 + ghosts.length }, () => loadModel('hero')))
    .then(([main, ...copies]) => attachHeroGlb(main, copies))
    .catch(() => { /* keep the code-built hero */ });
}

// swap the model in (also used by the player tests, which load it themselves)
export function attachHeroGlb({ scene: model, animations }, ghostCopies = []) {
  if (heroGlb.wrap) detachHeroGlb();
  const H = heroGlb;
  // the file faces +z; the game's hero faces -z
  model.rotation.y = Math.PI;
  const wrap = new THREE.Group();
  wrap.add(model);
  hero.group.add(wrap);
  let skinned = null;
  // no cast shadow: the blob under the hero stays its shadow, as before
  model.traverse((o) => { if (o.isMesh) o.castShadow = false; if (o.isSkinnedMesh) { skinned = o; o.frustumCulled = false; } });
  H.wrap = wrap; H.model = model;
  H.nodes = []; model.traverse((o) => H.nodes.push(o));
  for (const n of ['Hips', 'Spine1', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1']) H.bones[n] = model.getObjectByName(BONE(n));
  H.mixer = new THREE.AnimationMixer(model);
  H.actions = {};
  for (const clip of animations) {
    const a = H.mixer.clipAction(clip);
    if (clip.name === 'jump' || clip.name === 'land') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    H.actions[clip.name] = a;
  }
  H.clip = '';
  setClip('idle', 0);
  H.mixer.update(0);
  // size and stand it from the first idle frame (the skeleton's resting pose has the hips on the floor)
  const pose = () => { hero.group.updateMatrixWorld(true); if (skinned) skinned.skeleton.update(); };
  pose();
  const box = new THREE.Box3().setFromObject(model, true);
  wrap.scale.setScalar(HERO_HEIGHT / Math.max(0.1, box.max.y - box.min.y));
  model.position.y = hero.group.position.y - box.min.y; // feet on the floor (in the model's own units)
  pose();
  // the boot soles: skin near the floor that moves with the feet, checked each frame so a boot never sinks in
  H.skinned = skinned; H.soles = [];
  if (skinned) {
    const feet = ['LeftFoot', 'LeftToeBase', 'LeftToe_End', 'RightFoot', 'RightToeBase', 'RightToe_End'].map((n) => skinned.skeleton.bones.indexOf(model.getObjectByName(BONE(n)))).filter((i) => i >= 0);
    const geo = skinned.geometry, sIdx = geo.attributes.skinIndex, sW = geo.attributes.skinWeight, v = new THREE.Vector3(), floor = hero.group.position.y;
    for (let i = 0; i < geo.attributes.position.count; i++) {
      let w = 0; for (let j = 0; j < 4; j++) if (feet.includes(sIdx.getComponent(i, j))) w += sW.getComponent(i, j);
      if (w < 0.5) continue;
      skinned.getVertexPosition(i, v); skinned.localToWorld(v);
      if (v.y - floor < 0.12) H.soles.push(i);
    }
  }
  // the cannon's muzzle: the far end of the skin around the right hand
  H.muzzle = null;
  const hand = H.bones.RightHand, fore = H.bones.RightForeArm;
  if (skinned && hand && fore) {
    const bi = skinned.skeleton.bones.indexOf(hand), geo = skinned.geometry, sIdx = geo.attributes.skinIndex, sW = geo.attributes.skinWeight;
    const a = fore.getWorldPosition(new THREE.Vector3()), b = hand.getWorldPosition(new THREE.Vector3()), axis = b.clone().sub(a).normalize();
    let best = -Infinity; const tip = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < geo.attributes.position.count; i++) {
      let w = 0; for (let j = 0; j < 4; j++) if (sIdx.getComponent(i, j) === bi) w += sW.getComponent(i, j);
      if (w < 0.5) continue;
      skinned.getVertexPosition(i, v); skinned.localToWorld(v);
      const d = v.clone().sub(b).dot(axis);
      if (d > best) { best = d; tip.copy(b).addScaledVector(axis, d); }
    }
    if (best > -Infinity) {
      const muzzle = new THREE.Group();
      hand.add(muzzle); muzzle.position.copy(hand.worldToLocal(tip.clone()));
      const ws = hand.getWorldScale(new THREE.Vector3()).x;
      muzzle.scale.setScalar(1 / ws);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), hero.muzzleMat);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0x3ad6c6, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      glow.scale.setScalar(0.4);
      muzzle.add(core, glow);
      H.muzzle = muzzle; H.glow = glow;
    }
  }
  hero.body.visible = false;
  // afterimages for dashes
  ghostCopies.forEach(({ scene: copy }, i) => {
    const gh = ghosts[i]; if (!gh) return;
    copy.rotation.y = Math.PI; copy.position.copy(model.position);
    const root = new THREE.Group(), gw = new THREE.Group();
    gw.add(copy); root.add(gw); root.visible = false; scene.add(root);
    const nodes = []; copy.traverse((o) => { nodes.push(o); if (o.isMesh) { o.material = gh.mat; o.frustumCulled = false; o.castShadow = false; } });
    gh.glb = { root, wrap: gw, nodes };
  });
  return H;
}

// back to the code-built hero (the tests use this to clean up)
export function detachHeroGlb() {
  const H = heroGlb;
  if (!H.wrap) return;
  hero.group.remove(H.wrap);
  for (const gh of ghosts) if (gh.glb) { scene.remove(gh.glb.root); gh.glb = null; }
  Object.assign(H, { wrap: null, model: null, skinned: null, soles: [], mixer: null, actions: {}, clip: '', nodes: [], bones: {}, muzzle: null, glow: null });
  hero.body.visible = true;
}

// cross-fade to a clip; restart plays it again from the top even if it is already on
function setClip(name, fade = 0.15, restart = false) {
  const H = heroGlb, next = H.actions[name];
  if (!next || (H.clip === name && !restart)) return;
  for (const a of Object.values(H.actions)) if (a !== next && a.isRunning()) { if (fade > 0) a.fadeOut(fade); else a.stop(); }
  next.reset();
  if (fade > 0) next.fadeIn(fade); else next.setEffectiveWeight(1);
  next.play();
  H.clip = name;
}

// turn a bone (by weight w) so the line to its child points along the world direction dir
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion();
function pointBone(bone, child, dir, w) {
  if (!bone || !child || w <= 0) return;
  bone.getWorldPosition(_a); child.getWorldPosition(_b);
  const d0 = _b.sub(_a).normalize();
  _q.setFromUnitVectors(d0, dir);
  bone.getWorldQuaternion(_qw); _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp); _qp.invert().multiply(_qw);
  bone.quaternion.slerp(_qp, w);
  bone.updateMatrixWorld(true);
}

const _aim = new THREE.Vector3(), _wall = new THREE.Vector3();
function poseHeroGlb(dt, ix, iy, iz, aiming, now) {
  const H = heroGlb, T = tuning;
  const spd = Math.hypot(p.vx, p.vz), dashing = p.dashTimer > 0;
  H.landT = Math.max(0, H.landT - dt);
  // which clip
  let clip, rate = 1;
  if (!p.grounded) {
    if (p.sliding) { clip = 'fall'; rate = 0.5; }
    else if (dashing) clip = H.clip === 'jump' ? 'jump' : 'fall'; // an air dash keeps the air pose and leans
    else if (p.vy > 0) clip = 'jump';
    else clip = 'fall';
  } else if (dashing) { clip = 'run'; rate = 2.2; }
  else if (spd > 0.6) { clip = 'run'; rate = clamp(spd / 5.4, 0.6, 1.8); }
  else if (H.landT > 0) clip = 'land';
  else clip = 'idle';
  setClip(clip, clip === 'jump' ? 0.08 : clip === 'land' ? 0.06 : 0.18);
  if (H.actions[clip]) H.actions[clip].timeScale = rate;
  // the hit-stop freezes the model too
  H.mixer.update(hitStopRemaining() > 0 ? 0 : dt);
  // the dash leans the whole body into the run
  H.lean = damp(H.lean, dashing ? -0.32 : 0, 16, dt);
  H.wrap.rotation.x = H.lean;
  H.wrap.position.y = 0;
  hero.group.updateMatrixWorld(true);
  // on the ground, lift the body if a boot sole would sink below the floor (the boots are bigger than the
  // feet the animations were made for)
  if (p.grounded && H.skinned && H.soles.length) {
    H.skinned.skeleton.update();
    let lo = Infinity;
    for (const i of H.soles) { H.skinned.getVertexPosition(i, _a); H.skinned.localToWorld(_a); if (_a.y < lo) lo = _a.y; }
    if (lo < iy) { H.wrap.position.y = (iy - lo) / H.wrap.scale.y; hero.group.updateMatrixWorld(true); }
  }
  const B = H.bones;
  // wall slide: the hand nearest the wall reaches for it
  H.reachW = damp(H.reachW, p.sliding ? 1 : 0, 14, dt);
  if (H.reachW > 0.01) {
    _wall.set(-p.wallX, 0.7, -p.wallZ).normalize();
    const right = new THREE.Vector3(Math.cos(anim.yaw), 0, -Math.sin(anim.yaw)); // the hero's right side
    const useRight = right.dot(_wall) > 0 && !aiming;
    const arm = useRight ? 'Right' : 'Left';
    pointBone(B[arm + 'Arm'], B[arm + 'ForeArm'], _wall, H.reachW);
    pointBone(B[arm + 'ForeArm'], B[arm + 'Hand'], _wall, H.reachW);
  }
  // aiming: the cannon arm points straight along the aim
  H.aimW = damp(H.aimW, aiming && p.stun <= 0 ? 1 : 0, 30, dt);
  if (H.aimW > 0.01) {
    const r = aimRay();
    _aim.set(r.fx, r.fy, r.fz).normalize();
    pointBone(B.RightArm, B.RightForeArm, _aim, H.aimW);
    pointBone(B.RightForeArm, B.RightHand, _aim, H.aimW);
    pointBone(B.RightHand, B.RightHandIndex1, _aim, H.aimW);
  }
  // the muzzle glow follows the charge
  if (H.glow) {
    const lvl = !p.charging ? -1 : p.charge >= T.chargeTime2 ? 2 : p.charge >= T.chargeTime1 ? 1 : 0;
    const pulse = 0.5 + 0.5 * Math.sin(now * (lvl === 2 ? 40 : 22));
    H.glow.material.color.set(lvl === 2 ? 0xffb347 : 0x3ad6c6);
    H.glow.material.opacity = lvl >= 1 ? 0.6 + pulse * 0.4 : 0.35;
    H.glow.scale.setScalar(lvl === 2 ? 0.75 + pulse * 0.25 : lvl === 1 ? 0.5 + pulse * 0.15 : 0.3);
  }
}
on('jump', () => setClip('jump', 0.05, true));
on('walljump', () => setClip('jump', 0.05, true));
on('land', (e) => { if (e.impact > 6) heroGlb.landT = heroGlb.actions.land ? heroGlb.actions.land.getClip().duration * 0.8 : 0; });

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
  if (!heroGlb.requested) requestHeroGlb();
  hero.group.position.set(ix, iy, iz);
  hero.group.visible = p.dead <= 0 && p.returning <= 0 && !(p.iframes > 0 && Math.floor(now * 16) % 2 === 0);
  const targetYaw = Math.atan2(-p.faceX, -p.faceZ);
  anim.yaw = angleDamp(anim.yaw, targetYaw, p.dashTimer > 0 || p.aimTimer > 0 ? 30 : 16, dt);
  hero.group.rotation.y = anim.yaw;
  const spd = Math.hypot(p.vx, p.vz);
  const dashing = p.dashTimer > 0;
  if (p.grounded) anim.phase += dt * spd * 1.7;
  const sw = p.grounded ? clamp(spd / T.runSpeed, 0, 1.2) : 0;
  const ph = anim.phase;
  // pose: thigh and upper-arm swing (+ = forward), knee bend (- = shin back), elbow bend (+ = forearm forward)
  let legL = Math.sin(ph) * 0.85 * sw, legR = -legL;
  let kneeL = -sw * (0.2 + 0.9 * Math.max(0, Math.sin(ph - 1.2))), kneeR = -sw * (0.2 + 0.9 * Math.max(0, Math.sin(ph + Math.PI - 1.2)));
  let armL = -legL * 0.8, armR = legL * 0.45, elbowL = 0.35 + 0.45 * sw, elbowR = 0.25 + 0.25 * sw;
  let lean = -0.08 * sw, twist = Math.sin(ph) * 0.14 * sw, headX = 0, breath = 0;
  if (p.grounded && sw < 0.05) {
    // idle: slow breathing and a slight sway of the free arm
    const br = Math.sin(now * 2.2);
    breath = br * 0.008; armL = 0.06 + br * 0.03; elbowL = 0.3; kneeL = kneeR = -0.08;
  }
  if (!p.grounded) {
    if (p.vy > 0) { legL = 0.85; kneeL = -1.25; legR = -0.15; kneeR = -0.55; armL = -0.45; elbowL = 0.9; armR = 0.35; elbowR = 0.4; lean = -0.05; }
    else { legL = 0.3; kneeL = -0.35; legR = -0.1; kneeR = -0.2; armL = -0.9; elbowL = 0.45; armR = -0.3; elbowR = 0.3; lean = 0.04; }
    twist = 0;
  }
  if (p.sliding) { legL = 0.55; kneeL = -1.0; legR = 0.95; kneeR = -0.6; armL = 2.5; elbowL = 0.3; armR = 0.4; elbowR = 0.6; lean = 0.15; headX = 0.2; twist = 0; }
  if (dashing) { legL = -0.55; kneeL = -0.7; legR = -1.0; kneeR = -1.1; armL = -0.9; elbowL = 0.2; armR = -0.45; elbowR = 0.15; lean = -0.42; twist = 0; }
  if (p.stun > 0) { lean = 0.35; armL = -0.6; armR = -0.6; elbowL = elbowR = 0.6; kneeL = kneeR = -0.4; headX = -0.3; twist = 0; }
  const aiming = p.aimTimer > 0 || (p.charging && p.charge > T.chargeTime1);
  if (aiming) {
    // aiming: cannon arm straight out along the aim, the left hand braces it, shoulders turn into the shot
    armR = Math.PI / 2 + cam.pitch; elbowR = 0; headX = -cam.pitch * 0.5;
    if (!p.sliding && !dashing) { armL = 1.1 + cam.pitch * 0.6; elbowL = 1.25; twist = -0.22; }
  }
  // a hard landing bends the knees for a moment
  const crouch = (1 - anim.squash) * 3.2;
  kneeL -= crouch; kneeR -= crouch; legL += crouch * 0.45; legR += crouch * 0.45;
  const r = 22;
  hero.hipL.rotation.x = damp(hero.hipL.rotation.x, legL, r, dt);
  hero.hipR.rotation.x = damp(hero.hipR.rotation.x, legR, r, dt);
  hero.kneeL.rotation.x = damp(hero.kneeL.rotation.x, kneeL, r, dt);
  hero.kneeR.rotation.x = damp(hero.kneeR.rotation.x, kneeR, r, dt);
  hero.shL.rotation.x = damp(hero.shL.rotation.x, armL, r, dt);
  hero.shR.rotation.x = damp(hero.shR.rotation.x, armR, 30, dt);
  hero.elbowL.rotation.x = damp(hero.elbowL.rotation.x, elbowL, r, dt);
  hero.elbowR.rotation.x = damp(hero.elbowR.rotation.x, elbowR, 30, dt);
  hero.body.rotation.x = damp(hero.body.rotation.x, lean, 16, dt);
  hero.torso.rotation.y = damp(hero.torso.rotation.y, twist, 14, dt);
  hero.head.rotation.x = damp(hero.head.rotation.x, headX, 12, dt);
  hero.head.rotation.y = damp(hero.head.rotation.y, -twist * 0.7, 14, dt);
  anim.squash = damp(anim.squash, 1, 12, dt);
  hero.body.scale.set(1 / Math.sqrt(anim.squash), anim.squash, 1 / Math.sqrt(anim.squash));
  hero.torso.position.y = 1.0 + breath;
  // on the ground, plant the lower sole exactly on the floor however the legs are bent
  hero.body.position.y = 0;
  if (p.grounded) {
    hero.group.updateMatrixWorld(true);
    let lo = Infinity;
    for (const sole of hero.soles) lo = Math.min(lo, soleBox.setFromObject(sole).min.y);
    hero.body.position.y = iy - lo;
  }
  hero.thrusterMat.emissiveIntensity = damp(hero.thrusterMat.emissiveIntensity, dashing ? 7 : 1.4, 20, dt);
  if (heroGlb.wrap) poseHeroGlb(dt, ix, iy, iz, aiming, now);

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
    if (gh.life <= 0) { gh.g.visible = false; if (gh.glb) gh.glb.root.visible = false; continue; }
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
