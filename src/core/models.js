// 3D model files: assets/models/<name>.glb, loaded with Three.js's own GLTFLoader (H approved on 2026-10-30).
// Models are looks only. Each caller keeps its code-built look while the model loads, if it fails to load,
// and in the tests (modelsEnabled() is false there). See AGENTS.md, "3D models".
//
//   if (modelsEnabled()) loadModel('flyer').then(({ scene, animations }) => { ...swap the look... }).catch(() => {});
//
// Every call gets its own copy of the model (skeleton included), so one file can be placed many times.
// Copies share geometry and materials: clone a material before tinting one copy (e.g. a hit flash).
import * as THREE from './three.js';
import { renderer } from './render.js';

// the loaders import 'three'; the import map in index.html points that at the same Three.js as three.js
const JSM = 'https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/';
const files = new Map();
let libs = null;

// false when a test bot drives the browser, so the tests always see the code-built looks
export const modelsEnabled = () => !navigator.webdriver;

export function modelUrl(name) {
  return new URL(`../../assets/models/${name}.glb`, import.meta.url).href;
}

// Promise of { scene, animations } for assets/models/<name>.glb
export function loadModel(name) {
  if (!libs) {
    libs = Promise.all([import(JSM + 'loaders/GLTFLoader.js'), import(JSM + 'utils/SkeletonUtils.js')])
      .then(([gltf, skel]) => ({ loader: new gltf.GLTFLoader(), clone: skel.clone }));
    libs.catch(() => { libs = null; });
  }
  if (!files.has(name)) {
    const p = libs.then(({ loader }) => loader.loadAsync(modelUrl(name))).then((gltf) => { prepare(gltf.scene); return gltf; });
    p.catch(() => files.delete(name)); // a failed download can be tried again later
    files.set(name, p);
  }
  return Promise.all([libs, files.get(name)]).then(([{ clone }, gltf]) => ({ scene: clone(gltf.scene), animations: gltf.animations }));
}

// shadows, and a reflection map so metal parts show their colour instead of going dark
function prepare(root) {
  const env = modelEnv();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    for (const m of [].concat(o.material)) {
      if (m && m.isMeshStandardMaterial && !m.envMap) { m.envMap = env; m.envMapIntensity = 1; m.needsUpdate = true; }
    }
  });
}

// Drawn in code once: cool sky light above, a warm glow from the lava below, a few bright panels for highlights.
// Only model materials use it; the code-built looks are unchanged.
let envTex = null;
export function modelEnv() {
  if (envTex) return envTex;
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16), col = [];
  const top = new THREE.Color(0x9db8d8), mid = new THREE.Color(0x4a3a3a), low = new THREE.Color(0x6a5446);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    const c = h > 0 ? mid.clone().lerp(top, h) : mid.clone().lerp(low, Math.min(1, -h * 1.3));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (x, y, z, w, h, color, k) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); scene.add(m);
  };
  panel(-6, 7, 5, 6, 3, 0xfff0dc, 3); panel(7, 3, -4, 3, 5, 0x9db8d8, 1.5); panel(0, -6, -6, 8, 2, 0xff7a2a, 0.6); panel(5, 5, 7, 4, 4, 0xffffff, 1.2);
  const pmrem = new THREE.PMREMGenerator(renderer);
  envTex = pmrem.fromScene(scene, 0.03).texture;
  pmrem.dispose();
  geo.dispose();
  return envTex;
}
