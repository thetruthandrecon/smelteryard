// The renderer, scene, camera object, sky, sun, the lava sea under every level, and shared texture helpers.
import * as THREE from './three.js';
import { $, seeded } from './util.js';
import { tuning, defineTuning, onTuningChange } from './tuning.js';

defineTuning('Display', [
  ['resScale', 'Resolution', 1, 0.5, 1, 0.05, '×'],
  ['shadows', 'Shadows', true],
]);

export const canvas = $('view');
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
export const scene = new THREE.Scene();
const FOG = new THREE.Color(0x2b1f1f);
scene.fog = new THREE.Fog(FOG, 45, 175);
// the over-the-shoulder camera (player/camera.js) moves this every frame
export const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(400, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x0b1322) }, mid: { value: new THREE.Color(0x231b24) }, low: { value: FOG.clone() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.08 ? mix(mid, top, smoothstep(0.08, 0.7, h)) : mix(low, mid, smoothstep(-0.05, 0.08, h)); gl_FragColor = vec4(c, 1.0); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }),
);
sky.renderOrder = -1;
scene.add(sky);

const hemi = new THREE.HemisphereLight(0x9db8d8, 0xff7a2a, 1.15);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
sun.castShadow = tuning.shadows;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 100 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);

// a texture drawn on a canvas; repeat = tile it
export function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}
// soft round dot, used for particles, glows and the blob shadow
export const dotTex = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
});

// the lava sea far below every level
const lavaTex = canvasTex(256, (g, s) => {
  const rnd = seeded(11);
  g.fillStyle = '#2a0a04'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * s, y = rnd() * s, r = 8 + rnd() * 34;
    for (const [ox, oy] of [[0, 0], [s, 0], [-s, 0], [0, s], [0, -s]]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(255,${120 + Math.floor(rnd() * 80)},40,0.55)`); gr.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
}, true);
lavaTex.repeat.set(100, 100);
const lava = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), new THREE.MeshBasicMaterial({ map: lavaTex, toneMapped: false }));
lava.rotation.x = -Math.PI / 2; lava.position.set(0, -14, -100);
scene.add(lava);

// a glowing ball for projectiles: white core plus a coloured halo
const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
export function makeOrb(color) {
  const g = new THREE.Group();
  const core = new THREE.Mesh(sphereGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
  const haloM = new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const halo = new THREE.Sprite(haloM);
  g.add(core, halo); g.visible = false; scene.add(g);
  return { g, core, halo, haloM };
}

let lastShadows = null, lastRes = null;
export function applyDisplaySettings() {
  if (lastShadows !== tuning.shadows) { sun.castShadow = tuning.shadows; lastShadows = tuning.shadows; }
  if (lastRes !== tuning.resScale) { lastRes = tuning.resScale; resize(); }
}
export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5) * tuning.resScale);
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
onTuningChange(applyDisplaySettings);

// per frame, after the camera has moved: keep the sky around the camera and the sun's shadow on the player
export function renderWorld(dt, ix, iy, iz) {
  lavaTex.offset.x += dt * 0.004; lavaTex.offset.y += dt * 0.0025;
  sky.position.copy(camera.position);
  sun.position.set(ix + 18, iy + 30, iz + 12);
  sun.target.position.set(ix, iy, iz);
}
