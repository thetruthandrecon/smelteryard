// What enemies look like, their per-frame animation, and their effects and sounds.
import * as THREE from '../core/three.js';
import { ENTS, on } from '../core/world.js';
import { canvasTex, makeOrb } from '../core/render.js';
import { loadModel, modelsEnabled } from '../core/models.js';
import { ESHOTS, FIRE_PATCHES, GROUND_WAVES, ENERGY_RINGS, STEAM_CHARGE_TIME } from './enemies.js';
import { emit, burst, C_TEAL, C_MOLTEN, C_WHITE, C_RED, C_AMBER } from '../fx/particles.js';
import { tone, hiss, near } from '../fx/audio.js';

const targetTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#e7e2da'; g.fillRect(0, 0, s, s);
  const rings = ['#ff8a2a', '#e7e2da', '#ff8a2a', '#e7e2da', '#1d0f04'];
  rings.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(s / 2, s / 2, s * 0.46 * (1 - i * 0.19), 0, Math.PI * 2); g.fill(); });
  g.strokeStyle = '#3a2a1c'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
});
const postMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.7, metalness: 0.4 });
const C_SHOCK = new THREE.Color(0x9b7cff);
const C_STEAM = new THREE.Color(0xc8f5f1);
function makeEntityMesh(e) {
  const g = new THREE.Group();
  const flashMats = [];
  const std = (opts) => { const m = new THREE.MeshStandardMaterial(opts); flashMats.push(m); return m; };
  if (e.kind === 'dummy' || e.kind === 'mover') {
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), std({ map: targetTex, roughness: 0.6, metalness: 0.1 }));
    block.castShadow = true;
    if (e.kind === 'dummy') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.05, 8), postMat); post.position.y = 0.52; g.add(post);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.08, 12), postMat); foot.position.y = 0.04; g.add(foot);
      block.position.y = 1.43;
    } else {
      block.position.y = 0.45;
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.08, 0.14, 10), new THREE.MeshBasicMaterial({ color: 0x3ad6c6, toneMapped: false }));
      jet.position.y = -0.02; g.add(jet);
    }
    g.add(block);
    return { g, flashMats, block };
  }
  if (e.kind === 'walker') {
    const shell = std({ color: 0x6b3218, roughness: 0.5, metalness: 0.45 });
    const dark = std({ color: 0x23272c, roughness: 0.7, metalness: 0.5 });
    const body = new THREE.Group(); body.position.y = 0.8; g.add(body);
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.62, 0.9), shell); hull.castShadow = true; body.add(hull);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.12), dark); brow.position.set(0, 0.16, -0.48); body.add(brow);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false });
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.05), eyeMat); eye.position.set(0, 0.02, -0.47); body.add(eye);
    const spikeMat = std({ color: 0xc7ccd2, roughness: 0.35, metalness: 0.8 });
    for (const x of [-0.3, 0, 0.3]) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.32, 6), spikeMat); s.position.set(x, 0.46, 0.05); body.add(s); }
    const legs = [];
    for (const x of [-0.3, 0.3]) {
      const hip = new THREE.Group(); hip.position.set(x, 0.5, 0); g.add(hip);
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.28), dark); leg.position.y = -0.25; hip.add(leg);
      legs.push(hip);
    }
    return { g, flashMats, body, legs, eyeMat };
  }
  if (e.kind === 'flyer') {
    const shell = std({ color: 0x2c3138, roughness: 0.45, metalness: 0.6 });
    const body = new THREE.Group(); body.position.y = 0.4; g.add(body);
    const hull = new THREE.Mesh(new THREE.OctahedronGeometry(0.46), shell); hull.scale.set(1.1, 0.8, 1.3); hull.castShadow = true; body.add(hull);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), eyeMat); eye.position.set(0, 0.02, -0.55); body.add(eye);
    const wingMat = std({ color: 0xd2652a, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide });
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 20), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = -0.3; body.add(ring);
    const wings = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(s * 0.32, 0.05, 0); body.add(pivot);
      const wing = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.55), wingMat); wing.position.x = s * 0.47; pivot.add(wing);
      wings.push([pivot, s]);
    }
    return { g, flashMats, body, wings, eyeMat, eye };
  }
  if (e.kind === 'boss') {
    const armor = std({ color: 0x343b42, roughness: 0.42, metalness: 0.72 });
    const dark = std({ color: 0x1b2025, roughness: 0.62, metalness: 0.65 });
    const bronze = std({ color: 0x8a4a22, roughness: 0.46, metalness: 0.55 });
    const edge = std({ color: 0xb67b43, roughness: 0.36, metalness: 0.8 });
    const soot = std({ color: 0x292d31, roughness: 0.8, metalness: 0.3 });
    const furnaceGlow = new THREE.MeshBasicMaterial({ color: 0xff5b18, toneMapped: false });
    const ventGlow = new THREE.MeshBasicMaterial({ color: 0xff8130, toneMapped: false });
    const box = (parent, mat, w, h, d, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; parent.add(mesh);
      return mesh;
    };
    const legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(side * 0.62, 1.04, 0); g.add(hip);
      const knee = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.48, 10), bronze);
      knee.rotation.z = Math.PI / 2; knee.position.y = -0.23; hip.add(knee);
      box(hip, armor, 0.62, 0.58, 0.72, 0, -0.48, 0.02);
      box(hip, edge, 0.46, 0.1, 0.76, 0, -0.27, -0.03);
      box(hip, dark, 0.18, 0.48, 0.18, side * 0.3, -0.48, 0.16);
      const ankle = box(g, dark, 0.46, 0.3, 0.56, side * 0.62, 0.31, 0.04);
      box(g, bronze, 0.88, 0.27, 1.02, side * 0.62, 0.15, -0.14);
      box(g, edge, 0.72, 0.08, 0.2, side * 0.62, 0.27, -0.61);
      legs.push({ hip, ankle });
    }
    box(g, dark, 1.78, 0.48, 1.08, 0, 1.06, 0.02);
    box(g, armor, 1.98, 1.9, 1.3, 0, 2.08, 0.02);
    box(g, bronze, 1.96, 0.16, 1.34, 0, 3.04, 0.02);
    box(g, dark, 1.48, 0.18, 1.32, 0, 1.16, 0.01);
    for (const side of [-1, 1]) {
      box(g, bronze, 0.28, 1.38, 1.2, side * 1.02, 2.1, 0.02);
      const chest = box(g, armor, 0.38, 1.18, 0.2, side * 0.82, 2.15, -0.7);
      chest.rotation.z = -side * 0.1;
      box(g, edge, 0.34, 0.1, 0.22, side * 0.82, 2.76, -0.73);
      for (const y of [1.8, 2.08, 2.36]) box(g, ventGlow, 0.035, 0.09, 0.34, side * 1.18, y, 0.1);
      for (const y of [1.72, 2.48]) {
        const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 8), edge);
        bolt.rotation.x = Math.PI / 2; bolt.position.set(side * 0.83, y, -0.83); g.add(bolt);
      }
    }
    // The glowing furnace grille sits below the unobstructed core.
    box(g, dark, 1.05, 0.38, 0.12, 0, 1.42, -0.68);
    for (const x of [-0.3, 0, 0.3]) box(g, furnaceGlow, 0.16, 0.27, 0.025, x, 1.42, -0.76);
    for (const y of [1.31, 1.53]) box(g, bronze, 1.08, 0.07, 0.12, 0, y, -0.78);
    // Boiler shell and twin exhaust stacks stay within the Warden's existing bounds.
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.66, 0.94, 12), soot);
    boiler.position.set(0, 2.3, 0.46); boiler.castShadow = true; g.add(boiler);
    for (const side of [-1, 1]) {
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.68, 10), dark);
      stack.position.set(side * 0.72, 3.44, 0.42); stack.castShadow = true; g.add(stack);
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 10), bronze);
      collar.position.set(side * 0.72, 3.79, 0.42); g.add(collar);
      const ember = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.015, 10), furnaceGlow);
      ember.position.set(side * 0.72, 3.845, 0.42); g.add(ember);
    }
    const armJoints = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group(); shoulder.position.set(side * 1.1, 2.72, 0); g.add(shoulder);
      box(shoulder, bronze, 0.68, 0.74, 1.04, 0, 0, 0);
      box(shoulder, edge, 0.72, 0.11, 1.05, 0, 0.38, 0);
      const arm = new THREE.Group(); arm.position.set(0, -0.38, -0.02); shoulder.add(arm);
      box(arm, dark, 0.48, 0.95, 0.58, 0, -0.43, 0);
      box(arm, armor, 0.54, 0.52, 0.62, 0, -0.34, -0.03);
      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.55, 8), edge);
      piston.position.set(side * 0.24, -0.48, 0.12); arm.add(piston);
      box(arm, bronze, 0.6, 0.36, 0.72, 0, -1.04, -0.12);
      for (const x of [-0.17, 0.17]) box(arm, edge, 0.09, 0.15, 0.32, x, -1.07, -0.52);
      armJoints.push({ shoulder, arm, piston, side });
    }
    const headPivot = new THREE.Group(); headPivot.position.set(0, 3.45, 0); g.add(headPivot);
    box(headPivot, dark, 0.76, 0.14, 0.72, 0, -0.38, 0);
    box(headPivot, bronze, 1.14, 0.66, 0.94, 0, 0.02, -0.02);
    box(headPivot, edge, 1.16, 0.12, 0.95, 0, 0.35, -0.02);
    box(headPivot, dark, 0.92, 0.22, 0.13, 0, 0.02, -0.51);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false });
    box(headPivot, visorMat, 0.72, 0.11, 0.05, 0, 0.04, -0.59);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 16, 12), coreMat); core.position.set(0, 2.12, -0.72); g.add(core);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.1, 8, 24), new THREE.MeshStandardMaterial({ color: 0xd7a56c, roughness: 0.34, metalness: 0.8 }));
    rim.position.copy(core.position); g.add(rim);
    const coreShutters = [];
    for (const side of [-1, 1]) {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.14), dark);
      shutter.position.set(side * 0.52, 2.12, -1.3); g.add(shutter);
      coreShutters.push([shutter, side]);
    }
    // A front-facing flash makes the floor impact readable from the player's camera.
    const slamRingMat = new THREE.MeshBasicMaterial({ color: 0xe2d4ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const slamRing = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.62, 40), slamRingMat);
    slamRing.position.set(0, 1.05, -1.6); slamRing.visible = false; g.add(slamRing);
    const slamDiscMat = new THREE.MeshBasicMaterial({ color: 0xb99cff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const slamDisc = new THREE.Mesh(new THREE.CircleGeometry(0.45, 40), slamDiscMat);
    slamDisc.position.set(0, 1.05, -1.62); slamDisc.visible = false; g.add(slamDisc);
    const steamRingMat = new THREE.MeshBasicMaterial({ color: 0xc8f5f1, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const steamRing = new THREE.Mesh(new THREE.TorusGeometry(3.45, 0.24, 8, 48), steamRingMat);
    steamRing.rotation.x = Math.PI / 2; steamRing.position.y = 0.8; steamRing.visible = false; g.add(steamRing);
    const steamWallMat = new THREE.MeshBasicMaterial({ color: 0xa6dbd9, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const steamWall = new THREE.Mesh(new THREE.CylinderGeometry(3.45, 3.45, 1.65, 48, 1, true), steamWallMat);
    steamWall.position.y = 0.9; steamWall.visible = false; g.add(steamWall);
    const chargeHaloMat = new THREE.MeshBasicMaterial({ color: 0xf8ffff, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
    const chargeHalo = new THREE.Mesh(new THREE.RingGeometry(0.76, 1.04, 40), chargeHaloMat);
    chargeHalo.position.set(0, 2.12, -1.6); chargeHalo.visible = false; g.add(chargeHalo);
    return { g, flashMats, core, coreMat, visorMat, rim, coreShutters, legs, armJoints, headPivot, ventGlow, furnaceGlow, slamRing, slamRingMat, slamDisc, slamDiscMat, steamRing, steamRingMat, steamWall, steamWallMat, chargeHalo, chargeHaloMat, slamAt: -Infinity };
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.45, 12), std({ color: 0x2b3139, roughness: 0.6, metalness: 0.5 }));
  base.position.y = 0.22; g.add(base);
  const yawG = new THREE.Group(); yawG.position.y = 0.85; g.add(yawG);
  const pitchG = new THREE.Group(); yawG.add(pitchG);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.75), std({ color: 0x8a4a22, roughness: 0.5, metalness: 0.45 }));
  pitchG.add(head);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.7, 10), std({ color: 0x23282f, roughness: 0.6, metalness: 0.6 }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, -0.02, -0.6); pitchG.add(barrel);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a2a, toneMapped: false });
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeMat); eye.position.set(0, 0.1, -0.38); pitchG.add(eye);
  head.castShadow = true;
  return { g, flashMats, yawG, pitchG, eye, eyeMat };
}

// called by the level builder: one model per enemy, added to the level's group
let entVis = [];
let slagPatchVis = [];
let slagTargetVis = [];
let groundWaveVis = [];
let energyRingVis = [];
export function buildEnemyVisuals(group) {
  entVis = ENTS.map((e) => {
    const v = makeEntityMesh(e); group.add(v.g);
    if (e.kind === 'flyer' && modelsEnabled()) {
      loadModel('flyer').then(({ scene, animations }) => {
        if (!entVis.includes(v)) return;
        const bounds = new THREE.Box3().setFromObject(scene);
        const size = bounds.getSize(new THREE.Vector3());
        if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
        scene.scale.multiplyScalar(Math.min(e.hx * 2 / size.x, e.hy / size.y, e.hz * 2 / size.z));
        const center = new THREE.Box3().setFromObject(scene).getCenter(new THREE.Vector3());
        scene.position.set(-center.x, e.hy / 2 - center.y, -center.z);
        v.modelBasePosition = scene.position.clone();
        v.modelFlashMats = [];
        scene.traverse((part) => {
          if (!part.isMesh) return;
          const cloneMaterial = (mat) => {
            const copy = mat.clone();
            if (copy.isMeshStandardMaterial) v.modelFlashMats.push({ mat: copy, emissive: copy.emissive.clone(), intensity: copy.emissiveIntensity });
            return copy;
          };
          part.material = Array.isArray(part.material) ? part.material.map(cloneMaterial) : cloneMaterial(part.material);
        });
        if (animations.length) {
          v.modelMixer = new THREE.AnimationMixer(scene);
          v.modelMixer.clipAction(animations.find((clip) => /idle|hover/i.test(clip.name)) || animations[0]).play();
          v.modelLastTime = performance.now() / 1000;
        }
        v.g.add(scene);
        v.model = scene;
        v.body.visible = false;
      }).catch(() => {}); // The code-built flyer remains visible if the file cannot load.
    }
    return v;
  });
  slagPatchVis = Array.from({ length: 32 }, () => { const v = makeSlagPatch(); group.add(v.g); return v; });
  slagTargetVis = Array.from({ length: 3 }, () => { const v = makeSlagTarget(); group.add(v.g); return v; });
  groundWaveVis = Array.from({ length: 4 }, () => { const v = makeGroundWave(); group.add(v.g); return v; });
  energyRingVis = Array.from({ length: 2 }, () => { const v = makeEnergyRing(); group.add(v.g); return v; });
}

const eshotOrbs = Array.from({ length: 24 }, () => makeOrb(0xff6a1a));
for (const o of eshotOrbs) o.core.material.color.set(0xffd2a0);

function makeSlagPatch() {
  const g = new THREE.Group();
  const discMat = new THREE.MeshBasicMaterial({ color: 0xff5a13, transparent: true, opacity: 0.42, depthWrite: false, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), discMat);
  disc.rotation.x = -Math.PI / 2; g.add(disc);
  const rimMat = new THREE.MeshBasicMaterial({ color: 0xffc24b, transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.055, 6, 24), rimMat);
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.015; g.add(rim);
  return { g, discMat, rimMat };
}

function makeSlagTarget() {
  const g = new THREE.Group();
  const discMat = new THREE.MeshBasicMaterial({ color: 0x8efff0, transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.82, 24), discMat);
  disc.rotation.x = -Math.PI / 2; g.add(disc);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x8efff0, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.055, 6, 24), ringMat);
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; g.add(ring);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 0.48), ringMat);
  cross.position.y = 0.025; g.add(cross);
  const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2; g.add(cross2);
  return { g, discMat, ringMat };
}

function makeGroundWave() {
  const g = new THREE.Group();
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xb694ff, transparent: true, opacity: 0.36, depthWrite: false, toneMapped: false });
  const glow = new THREE.Mesh(new THREE.BoxGeometry(1, 0.06, 1.25), glowMat);
  glow.position.y = 0.05; g.add(glow);
  const waveMat = new THREE.MeshBasicMaterial({ color: 0xf0e7ff, transparent: true, opacity: 0.96, depthWrite: false, toneMapped: false });
  const crest = new THREE.Mesh(new THREE.BoxGeometry(1, 0.72, 0.4), waveMat);
  crest.position.y = 0.39; g.add(crest);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 0.55), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  edge.position.y = 0.76; g.add(edge);
  return { g, glowMat, waveMat };
}

function makeEnergyRing() {
  const g = new THREE.Group();
  const wallMat = new THREE.MeshBasicMaterial({ color: 0x6dfaff, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.8, 64, 1, true), wallMat);
  wall.position.y = 1.4; g.add(wall);
  const bandMat = new THREE.MeshBasicMaterial({ color: 0xe5ffff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  for (const y of [0.12, 2.72]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.025, 8, 64), bandMat);
    band.rotation.x = Math.PI / 2; band.position.y = y; g.add(band);
  }
  return { g, wallMat, bandMat };
}

export function renderEnemies() {
  const now = performance.now() / 1000;
  eshotOrbs.forEach((o, i) => {
    const s = ESHOTS[i];
    if (!s) { o.g.visible = false; return; }
    o.g.visible = true; o.g.position.set(s.x, s.y, s.z);
    o.core.scale.setScalar(s.kind === 'slag' ? s.radius : 0.13);
    o.halo.scale.setScalar(s.kind === 'slag' ? 1.8 + 0.18 * Math.sin(now * 30 + i) : 0.9 + 0.15 * Math.sin(now * 30 + i));
  });
  slagTargetVis.forEach((v) => { v.g.visible = false; });
  let slagTargetIndex = 0;
  for (const s of ESHOTS) {
    if (s.kind !== 'slag' || slagTargetIndex >= slagTargetVis.length) continue;
    const i = slagTargetIndex++, v = slagTargetVis[i], pulse = 0.5 + 0.5 * Math.sin(now * 9 + i);
    v.g.visible = true;
    v.g.position.set(s.targetX, s.targetY - s.radius + 0.045, s.targetZ);
    v.g.scale.setScalar(0.96 + pulse * 0.08);
    v.discMat.opacity = 0.08 + pulse * 0.08;
    v.ringMat.opacity = 0.68 + pulse * 0.3;
  }
  slagPatchVis.forEach((v, i) => {
    const fire = FIRE_PATCHES[i];
    if (!fire) { v.g.visible = false; return; }
    const fade = Math.min(1, fire.life / 0.35), pulse = 0.08 * Math.sin(now * 10 + i);
    v.g.visible = true; v.g.position.set(fire.x, fire.y, fire.z); v.g.scale.setScalar(fire.radius);
    v.discMat.opacity = (0.34 + pulse) * fade; v.rimMat.opacity = (0.72 + pulse) * fade;
  });
  groundWaveVis.forEach((v) => { v.g.visible = false; });
  GROUND_WAVES.forEach((wave, i) => {
    const v = groundWaveVis[i];
    if (!v) return;
    const pulse = 0.5 + 0.5 * Math.sin(now * 22 + i);
    v.g.visible = true; v.g.position.set(wave.x, wave.y, wave.z); v.g.scale.set(wave.width, 1, 1);
    v.glowMat.opacity = 0.28 + pulse * 0.18; v.waveMat.opacity = 0.9 + pulse * 0.1;
  });
  energyRingVis.forEach((v, i) => {
    const ring = ENERGY_RINGS[i];
    v.g.visible = Boolean(ring && ring.radius > 0.08);
    if (!v.g.visible) return;
    v.g.position.set(ring.x, ring.y, ring.z);
    v.g.scale.set(ring.radius, ring.height / 2.8, ring.radius);
    v.wallMat.opacity = 0.28 + 0.09 * Math.sin(now * 18 + i);
    v.bandMat.opacity = 0.85 + 0.15 * Math.sin(now * 22 + i);
  });
  ENTS.forEach((e, i) => {
    const v = entVis[i];
    if (!v) return;
    v.g.visible = e.alive && (e.kind !== 'boss' || e.activated);
    if (!e.alive) return;
    v.g.position.set(e.x, e.y + (e.kind === 'mover' ? Math.sin(now * 3 + i) * 0.08 : e.kind === 'boss' && e.st === 'enter' ? Math.abs(Math.sin(e.phase)) * 0.06 : 0), e.z);
    const f = e.flash > 0 ? 1 : 0;
    for (const m of v.flashMats) { m.emissive.setRGB(f, f, f); m.emissiveIntensity = f * 1.5; }
    if (v.modelFlashMats) for (const { mat, emissive, intensity } of v.modelFlashMats) {
      mat.emissive.copy(emissive).addScalar(f); mat.emissiveIntensity = intensity + f * 1.5;
    }
    if (e.kind === 'turret') {
      v.yawG.rotation.y = e.yaw;
      v.pitchG.rotation.x = e.pitch;
      const tele = e.tele;
      v.eyeMat.color.setRGB(1, 0.35 + tele * 0.6, 0.15 + tele * 0.5);
      v.eye.scale.setScalar(1 + tele * (0.8 + 0.4 * Math.sin(now * 40)));
    } else if (e.kind === 'walker') {
      v.g.rotation.y = e.yaw;
      const sw2 = Math.sin(e.phase) * 0.6;
      v.legs[0].rotation.x = sw2; v.legs[1].rotation.x = -sw2;
      v.body.position.y = 0.8 + Math.abs(Math.cos(e.phase)) * 0.05;
    } else if (e.kind === 'boss') {
      const phaseTransition = e.st === 'phaseTransition';
      const steamTell = e.st === 'steamTell', steamSpin = e.st === 'steamSpin';
      const steamActive = steamSpin && e.t2 > STEAM_CHARGE_TIME;
      const steamCharge = steamSpin && !steamActive;
      v.g.rotation.y = e.yaw + (phaseTransition && e.phaseThree ? e.phaseTransitionElapsed * 9 : 0);
      v.steamRing.visible = v.steamWall.visible = steamActive;
      v.chargeHalo.visible = steamCharge;
      if (steamActive) {
        v.steamRing.scale.setScalar(1 + Math.sin(now * 18) * 0.025);
        const charge = 1 - e.t2 / 1.5;
        v.steamRingMat.opacity = 0.55 + charge * 0.3 + Math.sin(now * 20) * 0.1;
        v.steamWallMat.opacity = 0.12 + charge * 0.18 + Math.sin(now * 15) * 0.04;
      }
      if (steamCharge) {
        const charge = 1 - e.t2 / STEAM_CHARGE_TIME;
        v.chargeHalo.scale.setScalar(0.75 + charge * 0.55 + Math.sin(now * 32) * 0.06);
        v.chargeHaloMat.opacity = 0.65 + Math.sin(now * 32) * 0.2;
      }
      if (steamTell || steamActive || (phaseTransition && e.phaseThree)) {
        for (const side of [-1, 1]) emit(e.x + side * 1.1, e.y + 2.65, e.z,
          side * (0.8 + Math.random()), 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.4, 0.5, C_STEAM, 0);
      }
      v.g.rotation.z = phaseTransition ? Math.sin(e.phase) * 0.075 : 0;
      if (phaseTransition) {
        v.g.position.y += Math.abs(Math.sin(e.phase)) * 0.24;
        emit(e.x + (Math.random() - 0.5) * 1.5, e.y + 1.7 + Math.random() * 1.3, e.z + (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.3, C_AMBER, 5);
      }
      const chargeTell = e.st === 'chargeTell', slagTell = e.st === 'slagTell', groundTell = e.st === 'groundTell';
      // Animate only the added parts. The boss transform, hitbox and core center stay as before.
      const charging = e.st === 'charge', pounding = e.st === 'groundRecover';
      const gait = e.st === 'enter' ? Math.sin(e.phase * 1.4) * 0.13 :
        charging ? Math.sin(e.phase * 2.4) * 0.26 : Math.sin(now * 1.8) * 0.025;
      v.legs[0].hip.rotation.x = gait;
      v.legs[1].hip.rotation.x = -gait;
      v.headPivot.rotation.y = Math.sin(now * 0.8) * 0.035;
      v.headPivot.rotation.x = chargeTell ? 0.12 : charging ? 0.19 : slagTell ? -0.12 : groundTell ? -0.1 : 0;
      for (const { arm, piston, side } of v.armJoints) {
        const idle = Math.sin(now * 2.1 + side) * 0.045;
        const pose = phaseTransition ? Math.sin(now * 23 + side) * 0.38 :
          chargeTell ? -0.55 : charging ? 0.48 :
          slagTell ? (side < 0 ? 0.82 : -0.2) :
          groundTell ? -0.75 : pounding ? 0.44 :
          steamTell ? 0.35 : steamSpin ? 0.52 + Math.sin(now * 19 + side) * 0.15 :
          e.st === 'energyRingVolley' ? 0.3 : 0;
        arm.rotation.x = pose + idle;
        arm.rotation.z = side * (steamTell || steamSpin ? 0.04 : 0);
        piston.position.y = -0.48 + Math.sin(now * (charging ? 16 : 3) + side) * 0.035;
      }
      const heat = 0.5 + Math.sin(now * (e.phaseThree ? 11 : 4)) * 0.14;
      v.furnaceGlow.color.setRGB(1, 0.24 + heat * 0.2, 0.05);
      v.ventGlow.color.setRGB(1, 0.32 + heat * 0.3, 0.08);
      const rear = groundTell ? Math.min(1, (0.5 - e.t2) * 3.2) : 0;
      v.g.position.y += rear * 0.85;
      v.g.rotation.x = rear * 0.18;
      v.g.scale.y = e.st === 'groundRecover' ? 1 - 0.12 * (e.t2 / 0.25) : 1;
      const slamAge = now - v.slamAt, slamVisible = slamAge >= 0 && slamAge < 0.38;
      v.slamRing.visible = v.slamDisc.visible = slamVisible;
      if (slamVisible) {
        const fade = 1 - slamAge / 0.38, size = 1 + slamAge * 5;
        v.slamRing.scale.setScalar(size); v.slamDisc.scale.setScalar(size);
        v.slamRingMat.opacity = 0.95 * fade; v.slamDiscMat.opacity = 0.55 * fade;
      }
      const telling = chargeTell || slagTell || groundTell || steamTell;
      const tellPulse = chargeTell ? (Math.sin(now * 38) > 0 ? 1 : 0) : slagTell ? 0.5 + 0.5 * Math.sin(now * 10) : groundTell ? (Math.sin(now * 24) > 0 ? 1 : 0) : 0;
      const coreOpen = Math.min(1, e.coreOpenTimer / 0.25);
      v.core.scale.setScalar((chargeTell ? 1.06 + tellPulse * 0.28 : slagTell ? 1.12 + tellPulse * 0.16 : groundTell ? 1.1 + tellPulse * 0.2 : 1 + Math.sin(now * 8) * 0.06) * (1 + coreOpen * 0.32));
      v.rim.scale.setScalar(1 + coreOpen * 0.38);
      for (const [shutter, side] of v.coreShutters) shutter.position.x = side * (0.52 + coreOpen * 0.38);
      v.coreMat.color.setRGB(groundTell ? 0.62 + tellPulse * 0.34 : slagTell ? 0.08 : 1, groundTell ? 0.2 + tellPulse * 0.2 : slagTell ? 0.72 + tellPulse * 0.2 : telling ? 0.62 + tellPulse * 0.34 : 0.24 + Math.sin(now * 5) * 0.08, groundTell ? 0.92 + tellPulse * 0.08 : slagTell ? 0.78 + tellPulse * 0.22 : telling ? 0.08 + tellPulse * 0.8 : 0.04);
      v.visorMat.color.setRGB(groundTell ? 0.58 + tellPulse * 0.38 : slagTell ? 0.08 : 1, groundTell ? 0.18 + tellPulse * 0.2 : slagTell ? 0.68 + tellPulse * 0.22 : telling ? 0.45 + tellPulse * 0.5 : 0.25, groundTell ? 0.9 + tellPulse * 0.1 : slagTell ? 0.78 + tellPulse * 0.22 : telling ? 0.2 + tellPulse * 0.7 : 0.08);
      if (e.phaseTwo && !telling) v.visorMat.color.setRGB(1, 0.16, 0.08);
      if (coreOpen) v.coreMat.color.setRGB(1, 0.92, 0.52);
      else if (e.phaseTwo && !telling) v.coreMat.color.setRGB(1, 0.22, 0.07);
      if (phaseTransition) {
        const flash = Math.sin(now * 46) > 0 ? 1 : 0;
        v.core.scale.setScalar(1.18 + flash * 0.45);
        v.coreMat.color.setRGB(1, 0.2 + flash * 0.78, 0.06 + flash * 0.82);
        v.visorMat.color.setRGB(1, 0.15 + flash * 0.65, 0.08 + flash * 0.55);
      }
      if (steamTell || steamSpin) {
        const charge = steamSpin ? 1 - e.t2 / 1.5 : 0;
        v.core.scale.setScalar(1.1 + charge * 0.75 + Math.sin(now * 24) * 0.08);
        v.coreMat.color.setRGB(0.6 + charge * 0.4, 1, 0.94);
        v.visorMat.color.setRGB(0.5 + charge * 0.5, 1, 0.92);
        if (steamActive) emit(e.x, e.y + 2.12, e.z, (Math.random() - 0.5) * 2,
          0.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0.35, C_STEAM, 0);
        if (steamCharge) emit(e.x, e.y + 2.12, e.z, (Math.random() - 0.5) * 1.4,
          (Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4, 0.22, C_WHITE, 2);
      }
      if (e.st === 'charge') emit(e.x, e.y + 0.3, e.z, 0, 0.15, -e.chargeDirZ * 1.5, 0.24, C_MOLTEN, 0);
    } else if (e.kind === 'flyer') {
      v.g.rotation.y = e.yaw;
      const flap = Math.sin(now * (e.st === 'swoop' ? 40 : 18) + i) * 0.5;
      for (const [pivot, s] of v.wings) pivot.rotation.z = s * flap;
      const shake = e.st === 'tele' ? (Math.random() - 0.5) * 0.08 : 0;
      v.body.position.set(shake, 0.4, 0);
      v.body.rotation.x = e.st === 'swoop' ? -0.6 : 0;
      v.eyeMat.color.setRGB(1, e.st === 'tele' ? 0.9 : 0.35, e.st === 'tele' ? 0.6 : 0.15);
      v.eye.scale.setScalar(e.st === 'tele' ? 1.6 + 0.3 * Math.sin(now * 40) : 1);
      if (v.model) {
        v.model.position.copy(v.modelBasePosition);
        v.model.position.x += shake;
        v.model.position.y += Math.sin(now * 5 + i) * 0.025;
        v.model.rotation.x = e.st === 'swoop' ? -0.6 : 0;
        if (v.modelMixer) {
          v.modelMixer.update(Math.min(0.1, Math.max(0, now - v.modelLastTime)));
          v.modelLastTime = now;
        }
      }
      if (e.st === 'swoop') emit(e.x, e.y + 0.4, e.z, 0, 0, 0, 0.25, C_MOLTEN, 0);
    } else if (v.block) {
      v.block.rotation.y = e.kind === 'mover' ? now * 1.2 : 0;
    }
  });
}

const sfx = {
  kill: () => { hiss(0.35, 1200, 120, 0.25); tone(220, 50, 0.3, 'sine', 0.2); },
  efire: (v) => tone(300, 160, 0.12, 'square', 0.06 * v),
  swoop: (v) => { hiss(0.4, 600, 2600, 0.16 * v); tone(260, 520, 0.35, 'sawtooth', 0.04 * v); },
  bossTell: (v) => { tone(220, 900, 0.42, 'sawtooth', 0.14 * v); hiss(0.45, 800, 2800, 0.16 * v); },
  slagTell: (v) => { tone(620, 390, 0.38, 'sine', 0.14 * v); tone(940, 690, 0.26, 'triangle', 0.08 * v, 0.1); },
  groundTell: (v) => { tone(96, 45, 0.22, 'square', 0.18 * v); tone(430, 125, 0.2, 'triangle', 0.11 * v, 0.13); tone(76, 38, 0.18, 'sine', 0.14 * v, 0.3); },
  bossCharge: (v) => { tone(130, 52, 0.24, 'sawtooth', 0.18 * v); hiss(0.65, 1500, 100, 0.24 * v); },
  groundSlam: (v) => { tone(100, 38, 0.34, 'sine', 0.28 * v); hiss(0.28, 700, 90, 0.16 * v); },
  slagLand: (v) => { tone(170, 70, 0.2, 'square', 0.12 * v); hiss(0.25, 1100, 260, 0.15 * v); },
  bossImpact: (v) => { tone(88, 40, 0.2, 'square', 0.2 * v); hiss(0.18, 1200, 180, 0.16 * v); },
  phaseTwo: (v) => { tone(190, 42, 1.5, 'sawtooth', 0.22 * v); tone(90, 36, 1.65, 'sine', 0.17 * v); hiss(1.2, 900, 100, 0.17 * v); },
  phaseThree: (v) => { tone(150, 28, 2.2, 'sawtooth', 0.25 * v); tone(75, 30, 2.5, 'square', 0.12 * v); hiss(2.4, 1400, 120, 0.22 * v); },
  steamTell: (v) => { hiss(0.5, 2400, 350, 0.22 * v); tone(410, 190, 0.45, 'sine', 0.1 * v); },
  steamSpin: (v) => { hiss(1, 1100, 480, 0.23 * v); tone(180, 960, 1.5, 'sawtooth', 0.13 * v); },
  steamCharge: (v) => { tone(700, 1400, STEAM_CHARGE_TIME, 'triangle', 0.16 * v); },
  energyRing: (v) => { tone(840, 130, 0.35, 'sine', 0.22 * v); hiss(0.3, 2600, 340, 0.18 * v); },
  coreOpen: (v) => { tone(520, 960, 0.25, 'triangle', 0.15 * v); },
  bossDefeat: (v) => { tone(160, 32, 0.9, 'sawtooth', 0.26 * v); hiss(0.8, 2800, 80, 0.26 * v); },
};
on('kill', ({ e }) => { burst(e.x, e.y + e.hy * 0.6, e.z, 40, 7, C_MOLTEN, { up: 1.2, grav: 8, life: 0.7 }); burst(e.x, e.y + e.hy * 0.6, e.z, 16, 3, C_WHITE, { up: 0.8, grav: 2, life: 0.4 }); sfx.kill(); });
on('entspawn', ({ e }) => { burst(e.x, e.y + e.hy * 0.5, e.z, 14, 2, C_TEAL, { up: 0.5, grav: 0, life: 0.4 }); });
on('efire', (e) => { burst(e.x, e.y, e.z, 6, 2, C_MOLTEN, { up: 0.4, grav: 2, life: 0.2 }); sfx.efire(near(e.x, e.y, e.z, 30)); });
on('eshotwall', (e) => { burst(e.x, e.y, e.z, 8, 3, C_MOLTEN, { up: 0.6, grav: 6, life: 0.3 }); });
on('eshothit', (e) => { burst(e.x, e.y, e.z, 14, 4, C_RED, { up: 0.8, grav: 6, life: 0.35 }); });
on('touch', (e) => { burst(e.x, e.y, e.z, 12, 3, C_RED, { up: 0.8, grav: 6, life: 0.3 }); });
on('swoop', ({ e }) => { sfx.swoop(near(e.x, e.y, e.z, 25)); });
on('bosstelegraph', ({ e, attack }) => {
  if (attack === 'slag') {
    burst(e.x, e.y + 2.1, e.z, 22, 3, C_TEAL, { up: 0.7, grav: 1, life: 0.5 });
    burst(e.x, e.y + 2.1, e.z, 8, 1.5, C_WHITE, { up: 0.4, grav: 0, life: 0.3 });
    sfx.slagTell(near(e.x, e.y, e.z, 35));
  } else if (attack === 'steam') {
    burst(e.x, e.y + 2.6, e.z, 30, 4, C_STEAM, { up: 1.2, grav: 0, life: 0.55 });
    sfx.steamTell(near(e.x, e.y, e.z, 35));
  } else if (attack === 'groundpound') {
    burst(e.x, e.y + 2.1, e.z, 24, 3, C_SHOCK, { up: 0.7, grav: 1, life: 0.5 });
    burst(e.x, e.y + 2.1, e.z, 8, 1.5, C_WHITE, { up: 0.4, grav: 0, life: 0.28 });
    sfx.groundTell(near(e.x, e.y, e.z, 35));
  } else {
    burst(e.x, e.y + 2.1, e.z, 20, 3, C_AMBER, { up: 0.7, grav: 1, life: 0.4 });
    sfx.bossTell(near(e.x, e.y, e.z, 35));
  }
});
on('bosscharge', ({ e }) => { burst(e.x, e.y + 0.35, e.z, 26, 5, C_MOLTEN, { up: 0.8, grav: 7, life: 0.4, dirZ: -e.chargeDirZ }); sfx.bossCharge(near(e.x, e.y, e.z, 35)); });
on('bossslag', (e) => { burst(e.x, e.y, e.z, 18, 4, C_MOLTEN, { up: 1.1, grav: 3, life: 0.45 }); });
on('slagland', (e) => { burst(e.x, e.y, e.z, 14, 3, C_MOLTEN, { up: 0.8, grav: 7, life: 0.4 }); sfx.slagLand(near(e.x, e.y, e.z, 35)); });
on('slagblobhit', (e) => { burst(e.x, e.y, e.z, 18, 4, C_AMBER, { up: 0.9, grav: 7, life: 0.35 }); });
on('slagfirehit', (e) => { burst(e.x, e.y, e.z, 12, 3, C_RED, { up: 0.8, grav: 7, life: 0.3 }); });
on('bossfirehit', (e) => { burst(e.x, e.y, e.z, 14, 4, C_MOLTEN, { up: 0.8, grav: 7, life: 0.35 }); });
on('bossphase2', (e) => { burst(e.x, e.y, e.z, 80, 6, C_RED, { up: 1.6, grav: 3, life: 0.8 }); burst(e.x, e.y, e.z, 48, 7, C_AMBER, { up: 1.8, grav: 4, life: 1.1 }); sfx.phaseTwo(near(e.x, e.y, e.z, 35)); });
on('bossphase3', (e) => { burst(e.x, e.y + 1.6, e.z, 100, 8, C_STEAM, { up: 2.1, grav: 0, life: 1.2 }); burst(e.x, e.y, e.z, 70, 8, C_AMBER, { up: 2, grav: 4, life: 1.1 }); sfx.phaseThree(near(e.x, e.y, e.z, 40)); });
on('bosssteamspin', (e) => { burst(e.x, e.y + 1, e.z, 55, 5, C_STEAM, { up: 1, grav: 0, life: 0.6 }); sfx.steamSpin(near(e.x, e.y, e.z, 35)); });
on('bosssteamcharge', (e) => { burst(e.x, e.y, e.z, 30, 2, C_WHITE, { up: 0.4, grav: 0, life: 0.35 }); sfx.steamCharge(near(e.x, e.y, e.z, 35)); });
on('bossenergyring', (e) => { burst(e.x, e.y, e.z, 38, 5, C_STEAM, { up: 1.4, grav: 0, life: 0.5 }); sfx.energyRing(near(e.x, e.y, e.z, 40)); });
on('bosssteamhit', (e) => { burst(e.x, e.y, e.z, 20, 4, C_STEAM, { up: 0.7, grav: 0, life: 0.35 }); });
on('bosscoreopen', (e) => { burst(e.x, e.y, e.z, 30, 4, C_WHITE, { up: 0.8, grav: 1, life: 0.45 }); sfx.coreOpen(near(e.x, e.y, e.z, 35)); });
on('bossdefeat', (e) => {
  burst(e.x, e.y, e.z, 130, 9, C_MOLTEN, { up: 2.4, grav: 5, life: 1.1 });
  burst(e.x, e.y, e.z, 90, 7, C_WHITE, { up: 1.8, grav: 3, life: 0.8 });
  burst(e.x, e.y - 1.2, e.z, 70, 6, C_SHOCK, { up: 1.2, grav: 2, life: 0.9 });
  sfx.bossDefeat(near(e.x, e.y, e.z, 40));
});
on('bossgroundslam', (ev) => {
  const frontZ = ev.z + ev.dirZ * 1.6;
  burst(ev.x, ev.y + 0.45, frontZ, 64, 8, C_SHOCK, { up: 2.8, grav: 5, life: 0.65, dirZ: ev.dirZ });
  burst(ev.x, ev.y + 0.7, frontZ, 28, 5, C_WHITE, { up: 2, grav: 4, life: 0.4 });
  const v = entVis[ENTS.indexOf(ev.e)];
  if (v) v.slamAt = performance.now() / 1000;
  sfx.groundSlam(near(ev.x, ev.y, ev.z, 35));
});
on('groundwavehit', (e) => { burst(e.x, e.y + 0.08, e.z, 14, 3, C_SHOCK, { up: 0.35, grav: 4, life: 0.28 }); });
on('bossimpact', (e) => { burst(e.x, e.y, e.z, 24, 5, C_WHITE, { up: 0.9, grav: 8, life: 0.35 }); sfx.bossImpact(near(e.x, e.y, e.z, 35)); });
