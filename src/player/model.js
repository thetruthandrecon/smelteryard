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
export const heroGlb = { wrap: null, model: null, skinned: null, soles: [], mixer: null, actions: {}, clip: '', nodes: [], bones: {}, muzzle: null, glow: null, aimW: 0, reachW: 0, runW: 0, dashW: 0, phase: 0, recoil: 0, airW: 0, airMix: 0, landT: 9, landK: 0, landW: 0, requested: false };

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
  for (const n of ['Hips', 'Spine1', 'RightArm', 'RightForeArm', 'RightHand', 'RightHandIndex1', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftHandIndex1',
    'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase', 'LeftHandIndex2', 'LeftHandIndex3', 'Spine', 'Spine2']) H.bones[n] = model.getObjectByName(BONE(n));
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
  // (per boot: its lowest points and its toe, heel and side edges, about 50 points, so the check stays cheap)
  H.skinned = skinned; H.soles = [];
  if (skinned) {
    const geo = skinned.geometry, sIdx = geo.attributes.skinIndex, sW = geo.attributes.skinWeight, v = new THREE.Vector3(), floor = hero.group.position.y;
    for (const side of ['Left', 'Right']) {
      const feet = ['Foot', 'ToeBase', 'Toe_End'].map((n) => skinned.skeleton.bones.indexOf(model.getObjectByName(BONE(side + n)))).filter((i) => i >= 0);
      const cand = [];
      for (let i = 0; i < geo.attributes.position.count; i++) {
        let w = 0; for (let j = 0; j < 4; j++) if (feet.includes(sIdx.getComponent(i, j))) w += sW.getComponent(i, j);
        if (w < 0.5) continue;
        skinned.getVertexPosition(i, v); skinned.localToWorld(v);
        if (v.y - floor < 0.12) cand.push({ i, x: v.x, y: v.y, z: v.z });
      }
      const pick = new Set();
      const take = (key, dir, n, maxY) => cand.filter((c) => c.y - floor < maxY).sort((a, b) => dir * (b[key] - a[key])).slice(0, n).forEach((c) => pick.add(c.i));
      take('y', -1, 24, 1); take('z', 1, 8, 0.06); take('z', -1, 8, 0.06); take('x', 1, 6, 0.06); take('x', -1, 6, 0.06);
      H.soles.push(...pick);
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
  // every other clip fades out, including a one-shot clip that finished and is holding its last frame
  for (const a of Object.values(H.actions)) if (a !== next && a.enabled) { if (fade > 0) a.fadeOut(fade); else a.stop(); }
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

// The hero's own animations, made in code on the model's skeleton (Mixamo's idle only runs underneath to give
// the spine, head and hands a little life). Each pose says where a bone points, as [forward, up, right] in the
// hero's own frame, from the bone to the next one: thigh (UpLeg) -> shin (Leg) -> foot -> toes, upper arm ->
// forearm -> hand. null keeps the foot flat as the clip has it. The right arm is the cannon. The style: always
// combat-ready, the cannon held forward, low and leaning when fast, quick changes between poses.
const POSES = {
  // standing ready: feet apart, knees soft, the cannon forward at the hip, the free fist in front of the body
  stand: {
    LeftUpLeg: [0.2, -0.96, -0.18], LeftLeg: [-0.08, -0.99, -0.08], LeftFoot: null,
    RightUpLeg: [-0.06, -0.97, 0.22], RightLeg: [-0.16, -0.98, 0.1], RightFoot: null,
    RightArm: [0.3, -0.86, 0.4], RightForeArm: [0.97, 0.05, 0.2], RightHand: [0.97, 0.05, 0.2],
    LeftArm: [0.15, -0.93, -0.3], LeftForeArm: [0.8, 0.1, 0.35], LeftHand: [0.8, 0.1, 0.35],
  },
  // the run, four keys per stride (the second half mirrors the first): left foot reaching forward, then passing
  // over the left foot with the right knee driving up
  runReach: {
    LeftUpLeg: [0.6, -0.8, -0.04], LeftLeg: [0.12, -0.99, 0], LeftFoot: [0.8, -0.6, 0],
    RightUpLeg: [-0.45, -0.89, 0.04], RightLeg: [-0.88, -0.47, 0], RightFoot: [-0.3, -0.95, 0],
  },
  runPass: {
    LeftUpLeg: [-0.05, -1, -0.04], LeftLeg: [-0.3, -0.95, 0], LeftFoot: [0.85, -0.5, 0],
    RightUpLeg: [0.85, -0.53, 0.04], RightLeg: [-0.45, -0.89, 0], RightFoot: [0.35, -0.94, 0],
  },
  // running arms: the cannon stays up and ready, the free arm pumps against the legs
  runArms: { RightArm: [0.35, -0.85, 0.32], RightForeArm: [0.96, 0.12, 0.15], RightHand: [0.96, 0.12, 0.15] },
  pumpBack: { LeftArm: [-0.5, -0.85, -0.15], LeftForeArm: [0.4, -0.55, -0.05], LeftHand: [0.4, -0.55, -0.05] },
  pumpFwd: { LeftArm: [0.5, -0.82, -0.12], LeftForeArm: [0.6, 0.78, 0.08], LeftHand: [0.6, 0.78, 0.08] },
  // the dash: low, the left leg bent in front, the right leg stretched behind, cannon forward, free arm back
  dash: {
    LeftUpLeg: [0.72, -0.69, -0.06], LeftLeg: [-0.25, -0.97, 0], LeftFoot: [0.95, -0.3, 0],
    RightUpLeg: [-0.62, -0.78, 0.1], RightLeg: [-0.92, -0.38, 0], RightFoot: [-0.4, -0.92, 0],
    RightArm: [0.45, -0.8, 0.38], RightForeArm: [0.98, 0.1, 0.12], RightHand: [0.98, 0.1, 0.12],
    LeftArm: [-0.55, -0.75, -0.35], LeftForeArm: [-0.2, -0.9, -0.38], LeftHand: [-0.2, -0.9, -0.38],
  },
  // rising and the peak: the left knee tucked high, the right shin folded back, cannon forward, free arm out
  rise: {
    LeftUpLeg: [0.88, -0.47, 0.02], LeftLeg: [-0.3, -0.95, 0], LeftFoot: [0.45, -0.89, 0],
    RightUpLeg: [0.15, -0.98, 0.08], RightLeg: [-0.8, -0.6, 0], RightFoot: [-0.15, -0.99, 0],
    RightArm: [0.3, -0.85, 0.42], RightForeArm: [0.96, 0.2, 0.15], RightHand: [0.96, 0.2, 0.15],
    LeftArm: [-0.2, -0.55, -0.81], LeftForeArm: [0.15, 0.55, -0.82], LeftHand: [0.15, 0.55, -0.82],
  },
  // falling: the legs come down a little apart, the arms open for balance, the cannon still forward
  fall: {
    LeftUpLeg: [0.3, -0.95, -0.06], LeftLeg: [-0.1, -0.99, 0], LeftFoot: [0.55, -0.83, 0],
    RightUpLeg: [-0.05, -0.99, 0.12], RightLeg: [-0.35, -0.94, 0], RightFoot: [0.35, -0.94, 0],
    RightArm: [0.35, -0.75, 0.56], RightForeArm: [0.9, 0, 0.43], RightHand: [0.9, 0, 0.43],
    LeftArm: [0.1, -0.6, -0.79], LeftForeArm: [0.4, -0.2, -0.9], LeftHand: [0.4, -0.2, -0.9],
  },
  // landing: knees bend to take the weight, boots flat, cannon forward
  land: {
    LeftUpLeg: [0.62, -0.78, -0.12], LeftLeg: [-0.45, -0.89, -0.04], LeftFoot: null,
    RightUpLeg: [0.5, -0.85, 0.14], RightLeg: [-0.45, -0.89, 0.04], RightFoot: null,
    RightArm: [0.35, -0.85, 0.38], RightForeArm: [0.97, 0, 0.2], RightHand: [0.97, 0, 0.2],
    LeftArm: [0.2, -0.88, -0.42], LeftForeArm: [0.75, -0.3, -0.3], LeftHand: [0.75, -0.3, -0.3],
  },
};
// how far the upper body leans forward (radians) in each pose
const LEAN = { stand: 0.06, run: 0.24, dash: 0.5, rise: 0.16, fall: 0.06, land: 0.3 };
const STRIDE = 2.7; // m covered by one full run cycle (two steps)
// the free hand's fist: each finger joint folds in (about the joint's own z axis). Mixamo's simple hand rig moves
// only part of the fingers, so this is as tight as the fist gets without a finer rig.
const FIST = [['LeftHandIndex1', -1.35], ['LeftHandIndex2', -1.45], ['LeftHandIndex3', -1.1]];
const CHILD = { LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase', RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase', RightArm: 'RightForeArm', RightForeArm: 'RightHand', RightHand: 'RightHandIndex1', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand', LeftHand: 'LeftHandIndex1' };
const LIMBS = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'];
// the same pose for the other side: left and right swap, and so does the sideways direction
const mirror = (pose) => Object.fromEntries(Object.entries(pose).map(([n, v]) => [n.startsWith('Left') ? 'Right' + n.slice(4) : 'Left' + n.slice(5), v && [v[0], v[1], -v[2]]]));
const RUN_KEYS = [POSES.runReach, POSES.runPass, mirror(POSES.runReach), mirror(POSES.runPass)];
const PUMP_KEYS = [POSES.pumpBack, null, POSES.pumpFwd, null]; // null: half way between its neighbours
const smooth = (t) => t * t * (3 - 2 * t);
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const _fw = new THREE.Vector3(), _rt = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _d1 = new THREE.Vector3();
// tip a bone forward (+) or back (-) about the hero's right side, by angle times weight
function tiltBone(bone, angle, w = 1) {
  if (!bone || Math.abs(angle * w) < 1e-4) return;
  _q.setFromAxisAngle(_rt, -angle * w);
  bone.getWorldQuaternion(_qw); _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp); _qp.invert().multiply(_qw);
  bone.quaternion.copy(_qp); bone.updateMatrixWorld(true);
}
// turn a bone about the vertical (+ turns the chest to the hero's left)
function twistBone(bone, angle) {
  if (!bone || Math.abs(angle) < 1e-4) return;
  _q.setFromAxisAngle(_up, angle);
  bone.getWorldQuaternion(_qw); _qw.premultiply(_q);
  bone.parent.getWorldQuaternion(_qp); _qp.invert().multiply(_qw);
  bone.quaternion.copy(_qp); bone.updateMatrixWorld(true);
}
// the run cycle at phase u (0..4, one unit per key): leg and free-arm directions
function runPose(u) {
  const k = Math.floor(u) % 4, t = smooth(u - Math.floor(u)), a = RUN_KEYS[k], b = RUN_KEYS[(k + 1) % 4], out = {};
  for (const n in a) out[n] = lerp3(a[n], b[n], t);
  const pk = (i) => PUMP_KEYS[i % 4] || Object.fromEntries(Object.keys(POSES.pumpBack).map((n) => [n, lerp3(POSES.pumpBack[n], POSES.pumpFwd[n], 0.5)]));
  const pa = pk(k), pb = pk(k + 1);
  for (const n in pa) out[n] = lerp3(pa[n], pb[n], t);
  return Object.assign(out, POSES.runArms);
}
// blend pose tables: start from a, move toward b by t (missing entries fall back to the other pose)
function mixPose(a, b, t) {
  if (t <= 0.001) return a;
  const out = {};
  for (const n of LIMBS) {
    const va = n in a ? a[n] : b[n], vb = n in b ? b[n] : va;
    out[n] = va === null || vb === null ? (t < 0.5 ? va : vb) : lerp3(va, vb, t);
  }
  return out;
}
// lay a full pose over the skeleton (feet marked null keep the flat direction the clip gave them)
const _keep = {};
function applyPose(pose) {
  const B = heroGlb.bones;
  for (const n of ['LeftFoot', 'RightFoot']) if (B[n] && B[CHILD[n]]) { B[n].getWorldPosition(_a); _keep[n] = B[CHILD[n]].getWorldPosition(new THREE.Vector3()).sub(_a).normalize(); }
  for (const n of LIMBS) {
    const v = pose[n];
    if (v === undefined) continue;
    if (v === null) { if (_keep[n]) pointBone(B[n], B[CHILD[n]], _keep[n], 1); continue; }
    _d1.set(0, 0, 0).addScaledVector(_fw, v[0]).addScaledVector(_up, v[1]).addScaledVector(_rt, v[2]).normalize();
    pointBone(B[n], B[CHILD[n]], _d1, 1);
  }
}

const _aim = new THREE.Vector3(), _wall = new THREE.Vector3(), _zAxis = new THREE.Vector3(0, 0, 1);
function poseHeroGlb(dt, ix, iy, iz, aiming, now) {
  const H = heroGlb, T = tuning, B = H.bones;
  const spd = Math.hypot(p.vx, p.vz), dashing = p.dashTimer > 0;
  const frozen = hitStopRemaining() > 0, adt = frozen ? 0 : dt;
  setClip('idle', 0.18);
  H.mixer.update(adt);
  H.wrap.rotation.x = 0; H.wrap.position.y = 0;
  hero.group.updateMatrixWorld(true);
  _fw.set(-Math.sin(anim.yaw), 0, -Math.cos(anim.yaw)); _rt.set(Math.cos(anim.yaw), 0, -Math.sin(anim.yaw));
  // how much of each: running, dashing, in the air (rising -> falling), landing; quick blends keep it snappy
  const ground = p.grounded;
  H.runW = damp(H.runW, ground && !dashing ? clamp((spd - 0.4) / 2.5, 0, 1) : 0, 16, adt);
  H.dashW = damp(H.dashW, dashing ? 1 : 0, dashing ? 30 : 14, adt);
  H.airW = damp(H.airW, ground ? 0 : 1, ground ? 26 : 20, adt);
  const jumpV = Math.sqrt(2 * T.gravity * T.jumpHeight);
  const mixTarget = p.sliding ? 0.75 : clamp(0.15 - p.vy / jumpV, 0, 1);
  H.airMix = H.airW < 0.05 ? mixTarget : damp(H.airMix, mixTarget, 10, adt);
  H.landT += adt;
  const dip = H.landT < 0.05 ? H.landT / 0.05 : Math.max(0, 1 - (H.landT - 0.05) / 0.2);
  H.landW = ground ? H.landK * dip * (spd > 0.6 ? 0.45 : 1) : 0;
  if (ground && spd > 0.4) H.phase = (H.phase + adt * 4 * spd / STRIDE) % 4;
  // build the pose: standing -> running -> dashing on the ground, rising -> falling in the air, then the landing
  let pose = mixPose(POSES.stand, runPose(H.phase), H.runW);
  pose = mixPose(pose, POSES.dash, H.dashW);
  pose = mixPose(pose, mixPose(POSES.rise, POSES.fall, H.airMix), H.airW);
  pose = mixPose(pose, POSES.land, H.landW);
  let lean = LEAN.stand + (LEAN.run - LEAN.stand) * H.runW;
  lean += (LEAN.dash - lean) * H.dashW;
  lean += (LEAN.rise + (LEAN.fall - LEAN.rise) * H.airMix - lean) * H.airW;
  lean += (LEAN.land - lean) * H.landW;
  tiltBone(B.Spine, lean);
  // the chest turns a little with the stride, and breathes when still
  twistBone(B.Spine1, Math.sin(H.phase * Math.PI / 2) * 0.12 * H.runW * (1 - H.airW));
  tiltBone(B.Spine2, Math.sin(now * 2.2) * 0.02 * (1 - H.runW) * (1 - H.airW));
  applyPose(pose);
  for (const [n, ang] of FIST) { const bone = B[n]; if (bone) bone.quaternion.multiply(_q.setFromAxisAngle(_zAxis, ang)); }
  if (B.LeftHand) B.LeftHand.updateMatrixWorld(true);
  // on the ground, plant the lower boot sole exactly on the floor however the legs are bent
  if (ground && H.skinned && H.soles.length) {
    H.skinned.skeleton.update();
    let lo = Infinity;
    for (const i of H.soles) { H.skinned.getVertexPosition(i, _a); H.skinned.localToWorld(_a); if (_a.y < lo) lo = _a.y; }
    H.wrap.position.y = (iy - lo) / H.wrap.scale.y; hero.group.updateMatrixWorld(true);
  }
  // wall slide: the hand nearest the wall reaches for it
  H.reachW = damp(H.reachW, p.sliding ? 1 : 0, 14, adt);
  if (H.reachW > 0.01) {
    _wall.set(-p.wallX, 0.7, -p.wallZ).normalize();
    const useRight = _rt.dot(_wall) > 0 && !aiming;
    const arm = useRight ? 'Right' : 'Left';
    pointBone(B[arm + 'Arm'], B[arm + 'ForeArm'], _wall, H.reachW);
    pointBone(B[arm + 'ForeArm'], B[arm + 'Hand'], _wall, H.reachW);
  }
  // aiming: the cannon arm points straight along the aim; each shot kicks it up a little
  H.aimW = damp(H.aimW, aiming && p.stun <= 0 ? 1 : 0, 30, adt);
  if (H.aimW > 0.01) {
    const r = aimRay();
    _aim.set(r.fx, r.fy, r.fz).normalize();
    pointBone(B.RightArm, B.RightForeArm, _aim, H.aimW);
    pointBone(B.RightForeArm, B.RightHand, _aim, H.aimW);
    pointBone(B.RightHand, B.RightHandIndex1, _aim, H.aimW);
  }
  H.recoil = Math.max(0, H.recoil - adt * 9);
  if (H.recoil > 0) { tiltBone(B.RightArm, -0.35 * H.recoil); tiltBone(B.Spine1, -0.06 * H.recoil); }
  // the muzzle glow follows the charge
  if (H.glow) {
    const lvl = !p.charging ? -1 : p.charge >= T.chargeTime2 ? 2 : p.charge >= T.chargeTime1 ? 1 : 0;
    const pulse = 0.5 + 0.5 * Math.sin(now * (lvl === 2 ? 40 : 22));
    H.glow.material.color.set(lvl === 2 ? 0xffb347 : 0x3ad6c6);
    H.glow.material.opacity = lvl >= 1 ? 0.6 + pulse * 0.4 : 0.35;
    H.glow.scale.setScalar(lvl === 2 ? 0.75 + pulse * 0.25 : lvl === 1 ? 0.5 + pulse * 0.15 : 0.3);
  }
}
on('land', (e) => { heroGlb.landT = 0; heroGlb.landK = clamp((e.impact - 3) / 12, 0, 1); });
on('shoot', () => { heroGlb.recoil = 1; });

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
