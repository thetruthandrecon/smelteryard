// Particle sparks (one shared pool) and the embers drifting up from the lava.
import * as THREE from '../core/three.js';
import { seeded } from '../core/util.js';
import { scene, camera, dotTex } from '../core/render.js';
import { on } from '../core/world.js';

const MAXP = 700;
const pPos = new Float32Array(MAXP * 3).fill(-9999), pCol = new Float32Array(MAXP * 3), pBase = new Float32Array(MAXP * 3);
const pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pMax = new Float32Array(MAXP), pGrav = new Float32Array(MAXP);
let pNext = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.17, map: dotTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
sparks.frustumCulled = false;
scene.add(sparks);

export const C_TEAL = new THREE.Color(0x3ad6c6), C_MOLTEN = new THREE.Color(0xff8a2a), C_DUST = new THREE.Color(0x8a7f74), C_WHITE = new THREE.Color(0xffffff), C_RED = new THREE.Color(0xff4a3d), C_AMBER = new THREE.Color(0xffc56a);

// Brief world-space impact halos make hits legible even when particles overlap the target.
const RINGS = Array.from({ length: 24 }, () => {
  const mesh = new THREE.Mesh(
    new THREE.RingGeometry(0.64, 1, 32),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  mesh.visible = false; mesh.renderOrder = 6; scene.add(mesh);
  return { mesh, life: 0, duration: 0, radius: 0 };
});
let ringNext = 0;
function impactHalo(x, y, z, color, radius, duration = 0.24) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return;
  const ring = RINGS[ringNext++ % RINGS.length];
  ring.mesh.position.set(x, y, z); ring.mesh.material.color.copy(color);
  ring.life = duration; ring.duration = duration; ring.radius = radius; ring.mesh.visible = true;
}
on('hit', (e) => impactHalo(e.x, e.y, e.z, e.blocked ? C_WHITE : e.weakspot ? C_AMBER : C_TEAL, e.weakspot ? 0.62 : e.level === 2 ? 0.48 : 0.32));
on('kill', ({ e }) => { if (e?.kind !== 'boss') impactHalo(e.x, e.y + e.hy * 0.55, e.z, C_MOLTEN, 0.8, 0.32); });
on('bossdefeat', (e) => impactHalo(e.x, e.y, e.z, C_AMBER, 2.1, 0.48));

// one particle: position, velocity, lifetime in seconds, colour, gravity
export function emit(x, y, z, vx, vy, vz, life, color, grav) {
  const i = pNext++ % MAXP, k = i * 3;
  pPos[k] = x; pPos[k + 1] = y; pPos[k + 2] = z;
  pVel[k] = vx; pVel[k + 1] = vy; pVel[k + 2] = vz;
  pBase[k] = color.r; pBase[k + 1] = color.g; pBase[k + 2] = color.b;
  pLife[i] = life; pMax[i] = life; pGrav[i] = grav;
}
// n particles flying out from a point
export function burst(x, y, z, n, speed, color, { up = 1, grav = 6, life = 0.45, dirX = 0, dirZ = 0 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    emit(x, y, z, Math.cos(a) * s + dirX, up * (0.3 + Math.random()) * speed * 0.6, Math.sin(a) * s + dirZ, life * (0.6 + Math.random() * 0.6), color, grav);
  }
}
export function updateParticles(dt) {
  for (let i = 0; i < MAXP; i++) {
    if (pLife[i] <= 0) continue;
    const k = i * 3;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[k + 1] = -9999; pCol[k] = pCol[k + 1] = pCol[k + 2] = 0; continue; }
    pVel[k + 1] -= pGrav[i] * dt;
    pPos[k] += pVel[k] * dt; pPos[k + 1] += pVel[k + 1] * dt; pPos[k + 2] += pVel[k + 2] * dt;
    const f = pLife[i] / pMax[i];
    pCol[k] = pBase[k] * f; pCol[k + 1] = pBase[k + 1] * f; pCol[k + 2] = pBase[k + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
  for (const ring of RINGS) {
    if (ring.life <= 0) continue;
    ring.life = Math.max(0, ring.life - dt);
    ring.mesh.visible = ring.life > 0;
    const age = 1 - ring.life / ring.duration;
    ring.mesh.quaternion.copy(camera.quaternion);
    ring.mesh.scale.setScalar(ring.radius * (0.65 + 1.8 * age));
    ring.mesh.material.opacity = (1 - age) * (1 - age) * 0.9;
  }
}

const EMB = 160;
const ePos = new Float32Array(EMB * 3), eSpd = new Float32Array(EMB);
{
  const rnd = seeded(5);
  for (let i = 0; i < EMB; i++) { ePos[i * 3] = (rnd() - 0.5) * 70; ePos[i * 3 + 1] = -14 + rnd() * 40; ePos[i * 3 + 2] = (rnd() - 0.5) * 70; eSpd[i] = 0.6 + rnd() * 1.6; }
}
const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
const embers = new THREE.Points(eGeo, new THREE.PointsMaterial({ size: 0.12, map: dotTex, color: 0xff8a2a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
embers.frustumCulled = false;
scene.add(embers);
// embers rise around the player and wrap back down below them
export function renderEmbers(dt, ix, iy, iz) {
  for (let i = 0; i < EMB; i++) {
    const k = i * 3;
    ePos[k + 1] += eSpd[i] * dt;
    ePos[k] += Math.sin((ePos[k + 1] + i) * 0.7) * dt * 0.3;
    if (ePos[k + 1] > iy + 26) { ePos[k + 1] = Math.min(-14, iy - 20); ePos[k] = ix + (Math.random() - 0.5) * 70; ePos[k + 2] = iz + (Math.random() - 0.5) * 70; }
  }
  eGeo.attributes.position.needsUpdate = true;
}
