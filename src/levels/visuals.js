// What levels look like: surfaces, spikes, platforms, crushers, capsules, checkpoints, the goal,
// signs and set dressing, plus their effects and sounds.
import * as THREE from '../core/three.js';
import { SOLIDS, DYN, CAPSULES, CHECKPOINTS, SIGNS, DECO, LEVEL, on } from '../core/world.js';
import { tuning } from '../core/tuning.js';
import { seeded } from '../core/util.js';
import { scene, canvasTex } from '../core/render.js';
import { p } from '../player/player.js';
import { shake, reduceMotion } from '../player/camera.js';
import { buildEnemyVisuals } from '../enemies/models.js';
import { emit, burst, C_TEAL, C_MOLTEN, C_DUST } from '../fx/particles.js';
import { tone, hiss, near } from '../fx/audio.js';

function gridTex(base, line) {
  const rnd = seeded(7);
  return canvasTex(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1600; i++) { const a = rnd() * 0.08; g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
    g.strokeStyle = line; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    g.globalAlpha = 0.45; g.lineWidth = 2; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = line; for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]]) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
  }, true);
}
const hazardTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#1b1e22'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#ff8a2a';
  for (let i = -s; i < s * 2; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 16 - s, s); g.lineTo(i - s, s); g.closePath(); g.fill(); }
}, true);
hazardTex.repeat.set(3, 1);
const beltTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#2a2e33'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#1b1e22'; g.lineWidth = 4; for (let y = 0; y < s; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
  g.fillStyle = '#ffb347';
  g.beginPath(); g.moveTo(40, 24); g.lineTo(80, 64); g.lineTo(40, 104); g.lineTo(58, 104); g.lineTo(98, 64); g.lineTo(58, 24); g.closePath(); g.fill();
}, true);
const doorTex = canvasTex(128, (g, s) => {
  g.fillStyle = '#2b1810'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#ff8a2a';
  for (let i = -s; i < s * 2; i += 40) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 18, 0); g.lineTo(i + 18 - s, s); g.lineTo(i - s, s); g.closePath(); g.fill(); }
  g.strokeStyle = '#140b07'; g.lineWidth = 8; g.strokeRect(4, 4, s - 8, s - 8);
}, true);
const MATS = {
  floor: new THREE.MeshStandardMaterial({ map: gridTex('#c3cad0', '#6b7680'), color: 0x8c96a0, roughness: 0.82, metalness: 0.2 }),
  wall: new THREE.MeshStandardMaterial({ map: gridTex('#cfc3b6', '#7a6a5c'), color: 0x8f8378, roughness: 0.78, metalness: 0.25 }),
  crate: new THREE.MeshStandardMaterial({ map: gridTex('#d8b98e', '#8a6a42'), color: 0x9a8166, roughness: 0.8, metalness: 0.1 }),
  platform: new THREE.MeshStandardMaterial({ map: gridTex('#bfe9e4', '#3f8f88'), color: 0x8fb8b4, roughness: 0.6, metalness: 0.35 }),
  belt: new THREE.MeshStandardMaterial({ map: beltTex, color: 0xffffff, roughness: 0.7, metalness: 0.4 }),
  door: new THREE.MeshStandardMaterial({ map: doorTex, color: 0xffffff, roughness: 0.5, metalness: 0.5, emissive: 0x3a1206, emissiveIntensity: 0.6 }),
};
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  uv.needsUpdate = true;
}
function topEdges(arr, x0, z0, x1, z1, y) { arr.push(x0, y, z0, x1, y, z0, x1, y, z0, x1, y, z1, x1, y, z1, x0, y, z1, x0, y, z1, x0, y, z0); }

function makeSign(text) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(10,14,19,0.88)'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#ff8a2a'; g.fillRect(0, 0, 512, 7);
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2; g.strokeRect(1, 1, 510, 126);
  let size = 54;
  const font = (s) => `600 ${s}px "Chakra Petch", "Segoe UI", sans-serif`;
  g.font = font(size);
  while (g.measureText(text).width > 470 && size > 22) { size -= 2; g.font = font(size); }
  g.fillStyle = '#e7eef1'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, toneMapped: false }));
  s.scale.set(3.6, 0.9, 1);
  return s;
}
const fontsReady = Promise.race([document.fonts ? document.fonts.load('600 54px "Chakra Petch"') : Promise.resolve(), new Promise((r) => setTimeout(r, 1500))]).catch(() => {});

// everything that belongs to the current level lives in one group, rebuilt on a level change
let levelGroup = null;
let dynVis = [], capVis = [], cpVis = [];
const LV = { goalGem: null, goalBeam: null, doorGlow: null, doorPanels: [] };
export function buildLevelVisuals() {
  if (levelGroup) {
    scene.remove(levelGroup);
    levelGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const grp = new THREE.Group();
  levelGroup = grp;
  LV.doorPanels = [];
  scene.add(grp);
  const edgePts = [];
  const spikeCones = [];
  for (const b of SOLIDS) {
    if (b.dyn) continue;
    const w = b.max[0] - b.min[0], h = b.max[1] - b.min[1], d = b.max[2] - b.min[2];
    if (b.kind === 'spike') {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.7, metalness: 0.5 }));
      plate.position.set((b.min[0] + b.max[0]) / 2, b.min[1] + 0.04, (b.min[2] + b.max[2]) / 2); plate.receiveShadow = true; grp.add(plate);
      for (let x = b.min[0] + 0.2; x < b.max[0] - 0.05; x += 0.36) for (let z = b.min[2] + 0.2; z < b.max[2] - 0.05; z += 0.36) spikeCones.push([x, b.min[1] + 0.08, z, h - 0.08]);
      continue;
    }
    const geo = new THREE.BoxGeometry(w, h, d);
    scaleBoxUV(geo, w, h, d, b.kind === 'door' ? 4 : 2);
    const m = new THREE.Mesh(geo, MATS[b.kind] || MATS.floor);
    m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    m.castShadow = true; m.receiveShadow = true;
    grp.add(m);
    if (b.kind === 'door' && b.closedMin) LV.doorPanels.push({ b, mesh: m });
    if (b.kind !== 'door') topEdges(edgePts, b.min[0], b.min[2], b.max[0], b.max[2], b.max[1] + 0.012);
  }
  {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(edgePts, 3));
    grp.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xffa34d, transparent: true, opacity: 0.7, toneMapped: false })));
  }
  if (spikeCones.length) {
    const cone = new THREE.ConeGeometry(0.15, 1, 6); cone.translate(0, 0.5, 0);
    const inst = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.35, metalness: 0.8, emissive: 0x401a08, emissiveIntensity: 0.6 }), spikeCones.length);
    const mtx = new THREE.Matrix4();
    spikeCones.forEach(([x, y, z, hgt], i) => { mtx.makeScale(1, hgt, 1); mtx.setPosition(x, y, z); inst.setMatrixAt(i, mtx); });
    inst.castShadow = true;
    grp.add(inst);
  }
  dynVis = DYN.map((b) => {
    const w = b.hw * 2, h = b.hh * 2, d = b.hd * 2;
    const g = new THREE.Group();
    if (b.kind === 'platform') {
      const geo = new THREE.BoxGeometry(w, h, d); scaleBoxUV(geo, w, h, d, 1.5);
      const m = new THREE.Mesh(geo, MATS.platform); m.castShadow = true; m.receiveShadow = true; g.add(m);
      const pts = []; topEdges(pts, -b.hw, -b.hd, b.hw, b.hd, b.hh + 0.012);
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x3ad6c6, toneMapped: false })));
      const jetMat = new THREE.MeshBasicMaterial({ color: 0x3ad6c6, toneMapped: false });
      for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) { const j = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 10), jetMat); j.position.set(x, -b.hh - 0.06, z); g.add(j); }
      grp.add(g);
      return { g };
    }
    const bodyMat = new THREE.MeshStandardMaterial({ map: hazardTex, color: 0xffffff, roughness: 0.6, metalness: 0.5 });
    const underMat = new THREE.MeshStandardMaterial({ color: 0x3a1608, roughness: 0.5, metalness: 0.4, emissive: 0xff4a10, emissiveIntensity: 0 });
    const side = new THREE.MeshStandardMaterial({ color: 0x2a2e33, roughness: 0.6, metalness: 0.6 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [side, side, new THREE.MeshStandardMaterial({ color: 0x24282c, roughness: 0.7, metalness: 0.6 }), underMat, bodyMat, bodyMat]);
    m.castShadow = true; g.add(m);
    const piston = new THREE.Mesh(new THREE.BoxGeometry(0.9, 20, 0.9), new THREE.MeshStandardMaterial({ color: 0x3a4048, roughness: 0.4, metalness: 0.8 }));
    piston.position.y = b.hh + 10; g.add(piston);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x401808, toneMapped: false });
    for (const s of [-1, 1]) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.08), lampMat); lamp.position.set(s * 2.6, 0.4, b.hd + 0.04); g.add(lamp); const lamp2 = lamp.clone(); lamp2.position.z = -b.hd - 0.04; g.add(lamp2); }
    grp.add(g);
    return { g, underMat, lampMat };
  });
  buildEnemyVisuals(grp);
  capVis = CAPSULES.map((c) => {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.3, 4, 10), new THREE.MeshStandardMaterial({ color: 0xbff8f1, emissive: 0x3ad6c6, emissiveIntensity: 1.4, roughness: 0.3 }));
    shell.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 6, 16), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 0.5, roughness: 0.4 }));
    band.rotation.y = Math.PI / 2;
    g.add(shell, band); g.position.set(c.x, c.y + 0.6, c.z); grp.add(g);
    return g;
  });
  cpVis = [];
  for (let i = 1; i < CHECKPOINTS.length; i++) {
    const c = CHECKPOINTS[i];
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 8, 40), mat);
    ring.rotation.x = Math.PI / 2; ring.position.set(c.x, c.y + 0.05, c.z);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 3.5, 24, 1, true), beamMat);
    beam.position.set(c.x, c.y + 1.75, c.z);
    grp.add(ring, beam);
    cpVis[i] = { ring, mat, beamMat };
  }
  const G0 = LEVEL.goal;
  LV.goalGem = null; LV.goalBeam = null; LV.doorGlow = null;
  if (G0.kind === 'beacon') {
    LV.goalGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.6), new THREE.MeshBasicMaterial({ color: 0xffb347, toneMapped: false }));
    LV.goalGem.position.set(G0.x, G0.y + 1.6, G0.z);
    LV.goalBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    LV.goalBeam.position.set(G0.x, G0.y + 30, G0.z);
    grp.add(LV.goalGem, LV.goalBeam);
  } else {
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, toneMapped: false });
    const frame = new THREE.Group();
    for (const [x, y, w, h] of [[-1.92, 30.5, 0.12, 5], [1.92, 30.5, 0.12, 5], [0, 32.92, 3.96, 0.12]]) { const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), glowMat); bar.position.set(x, y, -214.55); frame.add(bar); }
    grp.add(frame);
    LV.doorGlow = glowMat;
  }
  // set dressing
  const rnd = seeded(LEVEL.id === 'smelter' ? 41 : 23);
  const towerMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.9, metalness: 0.2 });
  const glowStrip = new THREE.MeshBasicMaterial({ color: 0xff7a2a, toneMapped: false });
  const [zA, zB] = LEVEL.path;
  for (let i = 0; i < 28; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (40 + rnd() * 45), z = zA + 30 - ((zA - zB + 60) * (i + rnd() * 0.8)) / 28;
    const hgt = 30 + rnd() * 70, w = 6 + rnd() * 12;
    const t = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, w), towerMat);
    t.position.set(x, -14 + hgt / 2, z); grp.add(t);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.8, w * 1.02), glowStrip);
    strip.position.set(x, -14 + hgt * (0.55 + rnd() * 0.35), z); grp.add(strip);
  }
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x4a3a30, roughness: 0.5, metalness: 0.7 });
  const vatMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.7, metalness: 0.5 });
  const moltenMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, toneMapped: false });
  for (const d of DECO) {
    if (d.kind === 'pipe') {
      const len = Math.abs(d.z1 - d.z0);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, len, 10), pipeMat);
      pipe.rotation.x = Math.PI / 2; pipe.position.set(d.x, d.y, (d.z0 + d.z1) / 2); grp.add(pipe);
    } else if (d.kind === 'vat') {
      const vat = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 40, 18, 1, true), vatMat);
      vat.position.set(d.x, d.y - 20, d.z); grp.add(vat);
      const top = new THREE.Mesh(new THREE.CircleGeometry(2.9, 24), moltenMat);
      top.rotation.x = -Math.PI / 2; top.position.set(d.x, d.y - 0.6, d.z); grp.add(top);
    }
  }
  fontsReady.then(() => { if (levelGroup !== grp) return; for (const sg of SIGNS) { const s = makeSign(sg.text); s.position.set(sg.x, sg.y, sg.z); grp.add(s); } });
}

// per frame: moving pieces, capsules, the belt, checkpoint rings, the goal
export function renderLevel(dt) {
  const now = performance.now() / 1000;
  CAPSULES.forEach((c, i) => {
    const g = capVis[i];
    if (!g) return;
    g.visible = c.active;
    if (c.active) { g.position.y = c.y + 0.6 + Math.sin(now * 2.5 + i) * 0.1; g.rotation.y += dt * 1.6; }
  });
  DYN.forEach((b, i) => {
    const v = dynVis[i];
    if (!v) return;
    const shakeX = b.kind === 'crusher' && b.mode === 'shake' && !reduceMotion ? (Math.random() - 0.5) * 0.08 : 0;
    v.g.position.set(b.cx + shakeX, b.cy, b.cz);
    if (b.kind === 'crusher') {
      const warn = b.mode === 'shake' || b.mode === 'slam';
      const blinkOn = warn && Math.floor(now * 12) % 2 === 0;
      v.lampMat.color.set(blinkOn ? 0xff6a1a : 0x401808);
      v.underMat.emissiveIntensity = warn ? 1.2 : 0;
    }
  });
  beltTex.offset.x -= dt * 3.5 * tuning.beltSpeed / 2;
  for (const d of LV.doorPanels) {
    d.mesh.position.y = (d.b.closedMin[1] + d.b.closedMax[1]) / 2 + 5.2 * d.b.open;
    d.mesh.visible = d.b.open < 0.97;
  }
  if (LV.goalGem) { LV.goalGem.rotation.y += dt * 1.4; LV.goalGem.position.y = LEVEL.goal.y + 1.6 + Math.sin(now * 2) * 0.15; }
  if (LV.doorGlow) { const k = 0.6 + 0.4 * Math.sin(now * 3); LV.doorGlow.color.setRGB(1, 0.3 + 0.2 * k, 0.08 * k); LV.doorGlow.opacity = 1 - (LEVEL.named.bossDoor?.open || 0); }
  for (const v of cpVis) if (v) v.ring.rotation.z += dt * 0.8;
}
// show checkpoints 1..n as reached (used when the page reloads mid-run)
export function markCheckpoints(n) {
  for (let i = 1; i <= n; i++) if (cpVis[i]) { cpVis[i].mat.color.set(0x3ad6c6); cpVis[i].beamMat.color.set(0x3ad6c6); }
}

const sfx = {
  slam: (v) => { tone(90, 32, 0.4, 'sine', 0.45 * v); hiss(0.3, 900, 120, 0.3 * v); },
  pickup: () => { [660, 990, 1320].forEach((f, i) => tone(f, f, 0.08, 'triangle', 0.1, i * 0.06)); },
  checkpoint: () => { tone(660, 660, 0.09, 'triangle', 0.14); tone(880, 880, 0.09, 'triangle', 0.14, 0.09); tone(1320, 1320, 0.16, 'triangle', 0.14, 0.18); },
  clear: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.18, 'triangle', 0.14, i * 0.1)); },
};
on('slam', ({ b }) => {
  const v = near(0, b.min[1], b.cz, 26);
  for (let i = 0; i < 26; i++) { const x = -b.hw + Math.random() * b.hw * 2, z = b.cz + (Math.random() < 0.5 ? -b.hd : b.hd); emit(x, b.min[1] + 0.1, z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2, Math.sign(z - b.cz) * (1 + Math.random() * 2), 0.5, C_DUST, 4); }
  sfx.slam(v); shake(0.3 * v);
});
on('checkpoint', (e) => { const v = cpVis[e.i]; if (v) { v.mat.color.set(0x3ad6c6); v.beamMat.color.set(0x3ad6c6); } burst(p.x, p.y + 1, p.z, 30, 5, C_TEAL, { up: 1.6, grav: 4, life: 0.8 }); sfx.checkpoint(); });
on('restart', () => { for (const v of cpVis) if (v) { v.mat.color.set(0xff8a2a); v.beamMat.color.set(0xff8a2a); } });
on('pickup', (e) => { burst(e.x, e.y + 0.6, e.z, 20, 3, C_TEAL, { up: 1.2, grav: 2, life: 0.6 }); sfx.pickup(); });
on('clear', () => { const G0 = LEVEL.goal; burst(G0.x, G0.y + 1.5, G0.z, 60, 7, C_MOLTEN, { up: 2, grav: 5, life: 1.1 }); sfx.clear(); });
