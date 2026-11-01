// Visual-only machinery for the Smelter Yard sections after the opening run.
import * as THREE from '../core/three.js';
import { dotTex } from '../core/render.js';

const iron = new THREE.MeshStandardMaterial({ color: 0x29343b, metalness: 0.75, roughness: 0.46 });
const worn = new THREE.MeshStandardMaterial({ color: 0x665b50, metalness: 0.48, roughness: 0.7 });
const black = new THREE.MeshStandardMaterial({ color: 0x172126, metalness: 0.5, roughness: 0.65 });
const bronze = new THREE.MeshStandardMaterial({ color: 0x9c6741, metalness: 0.65, roughness: 0.42 });
const hot = new THREE.MeshBasicMaterial({ color: 0xff7025, toneMapped: false });
const amber = new THREE.MeshBasicMaterial({ color: 0xffb75d, toneMapped: false });
const teal = new THREE.MeshBasicMaterial({ color: 0x4ccbd0, toneMapped: false });

function box(parent, x, y, z, w, h, d, mat = iron) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.receiveShadow = mat !== hot && mat !== amber && mat !== teal;
  parent.add(mesh);
  return mesh;
}
function pipe(parent, x, y, z, radius, height, mat = iron) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 10), mat);
  mesh.position.set(x, y, z); parent.add(mesh); return mesh;
}
function glow(parent, x, y, z, size, color = 0xff7425, opacity = 0.45) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  sprite.position.set(x, y, z); sprite.scale.set(size, size, 1); parent.add(sprite); return sprite;
}

export function buildStageArt(parent) {
  const steam = [], lava = [], fans = [];
  const addSteam = (x, y, z) => {
    for (let i = 0; i < 3; i++) {
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: 0xabb8b8, transparent: true, opacity: 0.1, depthWrite: false }));
      parent.add(puff); steam.push({ puff, x, y, z, phase: i / 3 });
    }
  };

  // The furnace climb has vertical rails, hot seams and massive machinery outside the well.
  for (const z of [-76.4, -88.4]) {
    for (const side of [-1, 1]) {
      const x = side * 1.58;
      box(parent, x, 12.8, z, 0.08, 23, 0.25, bronze);
      box(parent, x - side * 0.055, 12.8, z, 0.08, 21.5, 0.08, hot);
      for (const y of [3.2, 7.8, 12.4, 17, 21.6]) {
        box(parent, x, y, z, 0.15, 0.25, 3.8, iron);
        box(parent, x - side * 0.07, y, z, 0.08, 0.07, 2.8, amber);
      }
      pipe(parent, side * 4.6, 13, z, 1.5, 30, black);
      pipe(parent, side * 4.6, 28, z, 1.75, 0.6, bronze);
      addSteam(side * 4.6, 28.5, z);
    }
    for (const y of [4.5, 10, 15.5, 21]) {
      box(parent, 0, y, z + 2.2, 3.25, 0.22, 0.3, iron);
      box(parent, 0, y - 0.15, z + 2.04, 1.7, 0.08, 0.09, hot);
    }
  }

  // The crusher route is an elevated bridge over the works, not an endless floor.
  for (const z of [-95, -106, -117, -129, -141]) {
    for (const side of [-1, 1]) {
      const x = side * 7.4;
      box(parent, x, 24, z, 1.8, 8, 2, iron);
      box(parent, x, 29.2, z, 2.2, 2.2, 2.3, worn);
      box(parent, x - side * 1.17, 29.2, z, 0.13, 1.15, 1.3, hot);
      box(parent, x, 30.5, z, 2.5, 0.3, 2.7, bronze);
      pipe(parent, x, 34.5, z, 0.7, 8, black);
    }
    box(parent, 0, 22.7, z, 9, 0.5, 0.8, iron);
    for (const x of [-3.55, 3.55]) box(parent, x, 25.035, z + 2.7, 0.12, 0.06, 3.8, amber);
  }
  for (const x of [-4.55, 4.55]) {
    box(parent, x, 23.3, -121, 0.7, 1.1, 58, iron);
    box(parent, x, 23.9, -121, 0.75, 0.1, 58, bronze);
  }

  // Giant conveyor rollers and molten spillways frame the open crossing.
  for (const z of [-152, -163]) {
    for (const side of [-1, 1]) {
      const x = side * 6.4;
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 2.5, 18), iron);
      drum.rotation.z = Math.PI / 2; drum.position.set(x, 25.2, z); parent.add(drum);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.18, 8, 24), bronze);
      rim.rotation.y = Math.PI / 2; rim.position.set(x - side * 1.3, 25.2, z); parent.add(rim);
      glow(parent, x - side * 1.35, 25.2, z, 3.5, 0xff9a33, 0.35);
    }
  }
  for (const [x, z] of [[-10, -157], [10, -167], [-11, -181], [11, -187]]) {
    pipe(parent, x, 27, z, 2.1, 16, black);
    pipe(parent, x, 35.1, z, 2.4, 0.7, bronze);
    const fall = box(parent, x, 13, z - 2.12, 2.8, 24, 0.12, hot);
    fall.material = hot.clone(); fall.material.transparent = true; fall.material.opacity = 0.72;
    lava.push(fall);
    glow(parent, x, 24, z - 2.2, 5, 0xff6c20, 0.4);
    addSteam(x, 35.5, z);
  }

  // The final approach narrows into a reinforced gate with a visible hot core.
  for (const z of [-193, -204, -211]) {
    for (const side of [-1, 1]) {
      box(parent, side * 5.6, 32.5, z, 0.7, 9.2, 0.95, iron);
      box(parent, side * 4.94, 31.3, z, 0.09, 3.3, 0.55, bronze);
      box(parent, side * 4.88, 31.3, z, 0.09, 2.2, 0.13, hot);
      pipe(parent, side * 7.7, 35, z, 1.05, 15, black);
      addSteam(side * 7.7, 43, z);
    }
    box(parent, 0, 35.5, z, 11.5, 0.8, 1.0, iron);
    box(parent, 0, 35.02, z - 0.55, 4, 0.1, 0.1, amber);
  }
  for (const side of [-1, 1]) {
    for (const z of [-198, -207]) {
      box(parent, side * 4.92, 30.5, z, 0.08, 1.8, 2.3, black);
      for (const dz of [-0.7, -0.23, 0.23, 0.7]) box(parent, side * 4.86, 30.5, z + dz, 0.08, 1.2, 0.07, hot);
    }
  }

  // An enclosed furnace chamber gives the Warden a silhouette and its attacks clear space.
  for (const side of [-1, 1]) {
    for (const z of [-221, -229, -237, -243]) {
      box(parent, side * 4.9, 32.5, z, 0.12, 8, 0.48, bronze);
      box(parent, side * 4.83, 32.5, z, 0.08, 6.4, 0.1, hot);
      glow(parent, side * 4.7, 32.5, z, 2.9, 0xff6621, 0.24);
    }
    box(parent, side * 4.65, 28.06, -231, 0.11, 0.08, 28, amber);
  }
  for (const z of [-220, -230, -240]) {
    box(parent, 0, 37.2, z, 10.2, 0.28, 0.7, iron);
    for (const x of [-3, 0, 3]) box(parent, x, 36.96, z, 0.8, 0.1, 0.12, hot);
  }
  box(parent, 0, 33.2, -244.85, 7.5, 6.3, 0.18, black);
  for (const x of [-2.6, -1.3, 0, 1.3, 2.6]) box(parent, x, 33.2, -244.7, 0.35, 4.5, 0.12, hot);
  glow(parent, 0, 33.2, -244.55, 7, 0xff782c, 0.32);
  const arenaLight = new THREE.PointLight(0xffc294, 32, 32, 2);
  arenaLight.position.set(0, 35, -232); parent.add(arenaLight);
  for (const x of [-4, 4]) for (const z of [-218, -243]) {
    box(parent, x, 28.045, z, 0.8, 0.06, 0.8, bronze);
    const rotor = new THREE.Group(); rotor.position.set(x, 28.12, z);
    for (let i = 0; i < 4; i++) {
      const blade = box(rotor, 0, 0.04, 0.42, 0.18, 0.06, 0.7, iron);
      blade.rotation.y = i * Math.PI / 2;
      blade.position.set(Math.sin(i * Math.PI / 2) * 0.42, 0.04, Math.cos(i * Math.PI / 2) * 0.42);
    }
    parent.add(rotor); fans.push(rotor);
    addSteam(x, 28.2, z);
  }

  return (now) => {
    for (const v of steam) {
      const rise = (now * 0.2 + v.phase) % 1;
      v.puff.position.set(v.x + Math.sin(now + v.phase * 7) * rise * 0.5, v.y + rise * 4, v.z);
      v.puff.scale.setScalar(1 + rise * 3);
      v.puff.material.opacity = 0.15 * Math.sin(Math.PI * rise);
    }
    for (let i = 0; i < lava.length; i++) lava[i].material.opacity = 0.63 + 0.12 * Math.sin(now * 5 + i);
    for (const fan of fans) fan.rotation.y = now * 3;
  };
}
