// Player health rules (knockout and revive, spikes, lava, lives and game over), camera shakes, the hero model,
// and the 3D model files in assets/models (they load, stay within budget, and stay off in the tests).
const fs = require('fs');
const path = require('path');
const MODELS = path.resolve(__dirname, '..', '..', 'assets', 'models');

module.exports = {
  name: 'Player: health, lives, camera, hero and model files',
  owner: 'Claude (player)',
  async run({ page, expect, log }) {
    const r = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('yard');
      const { p, state, placeAt, ENTS, tuning, restartCourse, MAX_HP, CHECKPOINTS } = G; const { run, fresh } = window.__t;
      const out = {};
      // knocked out by the turret at low health, then back at the start with full health
      fresh(ENTS[5]); placeAt({ x: 3, y: 0, z: -9.5 }); p.hp = 2;
      let died = false, revived = false;
      run(6, () => { if (p.dead > 0) died = true; else if (died) revived = true; });
      out.ko = { died, revived, hp: p.hp, backAtStart: Math.abs(p.z - 8) < 0.5 };
      // spikes: a quarter of your health and back to the checkpoint, unless you're still flashing
      fresh(); placeAt({ x: 0, y: 1.6, z: -4.5 }); run(1.6);
      out.spikes = { hp: p.hp, lives: state.lives, backAtStart: Math.abs(p.z - 8) < 0.01 };
      fresh(); placeAt({ x: 0, y: 1.6, z: -4.5 }, 3); run(0.6);
      out.spikes.survivesWhileFlashing = p.hp === MAX_HP && state.spikeHits === 0;
      // lava: a quarter of your health and back to the checkpoint; at 0 health it costs a life; the last life ends the run
      fresh(); state.cp = 1; placeAt({ x: 0, y: 0, z: -11.5 }); p.hp = 10; run(2.5);
      out.lives = { lavaHp: p.hp, livesAfterLava: state.lives, backAtCheckpoint: Math.abs(p.z - CHECKPOINTS[1].z) < 0.01 && p.dead <= 0 };
      fresh(); state.cp = 1; placeAt({ x: 0, y: 0, z: -11.5 }); p.hp = 3; run(3);
      out.lives.lowHpLavaCostsLife = state.lives === tuning.lives - 1 && p.hp === MAX_HP;
      fresh(); placeAt({ x: 3, y: 0, z: -9.5 }); state.lives = 1; p.hp = 1; ENTS[5].alive = true; ENTS[5].timer = 0; run(4);
      out.lives.lastKoGameOver = state.mode === 'over';
      fresh(); state.lives = 1; placeAt({ x: 0, y: 0, z: -11.5 }); p.hp = 4; run(2);
      out.lives.lastFallGameOver = state.mode === 'over';
      restartCourse(); out.lives.restartResets = state.cp === 0 && state.lives === tuning.lives && Math.abs(p.z - 8) < 0.01 && p.hp === MAX_HP;
      return out;
    });
    // a real Ground pound from the Warden shakes the camera by the tuning value
    r.slam = await page.evaluate(async () => {
      const { dispatchEvents } = await import('/src/core/world.js');
      const G = window.__game; const { state, STEP, placeAt, ENTS, tuning, camState, p } = G; const { run } = window.__t;
      G.loadLevel('smelter'); state.mode = 'bot'; state.noEnemies = true; G.restartCourse(); G.step(STEP); // one step before the run starts resets the boss door
      // start just inside the arena door: that both opens the door and starts the fight
      state.cp = 3; state.started = true; placeAt({ x: 0, y: 28, z: -216.2 }); G.step(STEP); run(3.2);
      const boss = ENTS.find((e) => e.kind === 'boss');
      placeAt({ x: 0, y: 28, z: boss.z + 8 }); p.iframes = 99;
      state.noEnemies = false; boss.st = 'idle'; boss.cd = 0; boss.nextAttack = 'groundpound';
      dispatchEvents(); camState.shake = 0;
      let slammed = false;
      for (let i = 0; i < 240 && !slammed; i++) { G.step(STEP); slammed = G.events.some((e) => e.type === 'bossgroundslam'); }
      const before = camState.shake; dispatchEvents();
      const out = { slammed, before, after: camState.shake, setting: tuning.slamShake };
      state.noEnemies = true;
      return out;
    });
    // the Warden's power-ups: a jolt at each roar, a rumble while it powers up, then calm; the Phase 3 roar is 1.5x stronger
    r.roar = await page.evaluate(async () => {
      const { dispatchEvents } = await import('/src/core/world.js');
      const { damageEnt } = await import('/src/enemies/enemies.js');
      const { updateCamera } = await import('/src/player/camera.js');
      const G = window.__game; const { state, STEP, placeAt, ENTS, tuning, camState, p } = G; const { run } = window.__t;
      G.loadLevel('smelter'); state.mode = 'bot'; state.noEnemies = true; G.restartCourse(); G.step(STEP); // one step before the run starts resets the boss door
      state.cp = 3; state.started = true; placeAt({ x: 0, y: 28, z: -216.2 }); G.step(STEP); run(3.2);
      const boss = ENTS.find((e) => e.kind === 'boss');
      placeAt({ x: 0, y: 28, z: boss.z + 8 }); p.iframes = 99;
      const roar = (barsLeft) => {
        boss.st = 'idle'; boss.hp = barsLeft * boss.hpPerBar + 4;
        dispatchEvents(); camState.shake = 0;
        damageEnt(boss, 4, boss.x, boss.y + 0.6, boss.z + boss.hz, 0);
        const transition = boss.st === 'phaseTransition';
        dispatchEvents(); const jolt = camState.shake;
        // let the jolt fade, then check the rumble holds while the Warden powers up
        for (let i = 0; i < 90; i++) updateCamera(1 / 60, p.x, p.y, p.z);
        run(1); const rumble = camState.shake;
        run(tuning.bossPhaseTransitionTime);
        for (let i = 0; i < 90; i++) updateCamera(1 / 60, p.x, p.y, p.z);
        return { transition, jolt: +jolt.toFixed(4), rumble: +rumble.toFixed(4), after: camState.shake, calm: boss.st !== 'phaseTransition', phase: boss.bossPhase };
      };
      return { setting: tuning.roarShake, phase2: roar(2), phase3: roar(1) };
    });
    // the hero model: fits the collision capsule, every pose is set, and the planted boot stays on the floor
    r.model = await page.evaluate(async () => {
      const { heroModel: hero, renderPlayer } = await import('/src/player/model.js');
      const THREE = await import('/src/core/three.js');
      const G = window.__game; const { p, placeAt, state, tuning } = G;
      G.loadLevel('yard'); state.mode = 'bot'; placeAt({ x: -4, y: 0, z: 2 });
      const set = (o) => Object.assign(p, { vx: 0, vy: 0, vz: 0, grounded: true, sliding: false, dashTimer: 0, aimTimer: 0, charging: false, charge: 0, stun: 0, iframes: 0, faceX: 0, faceZ: -1, wallX: 1, wallZ: 0 }, o);
      const frame = (n = 1) => { for (let i = 0; i < n; i++) renderPlayer(1 / 60, p.x, p.y, p.z); };
      const box = () => new THREE.Box3().setFromObject(hero.group);
      const joints = () => ['hipL', 'kneeL', 'hipR', 'kneeR', 'shL', 'elbowL', 'shR', 'elbowR'].map((k) => +hero[k].rotation.x.toFixed(2));
      set({}); frame(60);
      const b = box(), size = b.getSize(new THREE.Vector3());
      const out = { height: +size.y.toFixed(2), width: +size.x.toFixed(2), soleY: +(b.min.y - p.y).toFixed(3) };
      const poses = { idle: {}, run: { vz: -tuning.runSpeed }, jump: { grounded: false, vy: 6 }, fall: { grounded: false, vy: -6 }, wallslide: { grounded: false, sliding: true, vy: -2 }, dash: { dashTimer: 0.1, vz: -17 }, aim: { aimTimer: 0.5 } };
      out.poses = {};
      for (const [name, o] of Object.entries(poses)) { set(o); frame(45); out.poses[name] = joints().join(','); }
      // the run cycle: the lower sole stays within 6 cm of the floor
      set({ vz: -tuning.runSpeed }); let lo = 9, hi = -9;
      for (let i = 0; i < 90; i++) { frame(); const y = box().min.y - p.y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
      out.runSole = [+lo.toFixed(3), +hi.toFixed(3)];
      set({}); frame(60);
      return out;
    });
    log('player', r);
    expect(r.ko.died && r.ko.revived && r.ko.hp === 16 && r.ko.backAtStart, 'a knockout should revive you at the checkpoint with full health');
    expect(r.spikes.hp === 12 && r.spikes.lives === 3 && r.spikes.backAtStart, 'spikes should take 4 HP and send you back to the checkpoint without costing a life');
    expect(r.spikes.survivesWhileFlashing, 'spikes should not hurt while you are still flashing');
    expect(r.lives.lavaHp === 6 && r.lives.livesAfterLava === 3 && r.lives.backAtCheckpoint, 'lava should take 4 HP and send you back to the checkpoint');
    expect(r.lives.lowHpLavaCostsLife, 'lava at 4 HP or less should cost a life');
    expect(r.lives.lastKoGameOver && r.lives.lastFallGameOver, 'losing the last life should be game over');
    expect(r.lives.restartResets, 'restart should reset checkpoint, lives, position and health');
    const M = r.model, poseSet = new Set(Object.values(M.poses));
    expect(M.height >= 1.8 && M.height <= 2.15 && M.width <= 1.25 && Math.abs(M.soleY) <= 0.005, 'the hero model should stand on its soles, about 2 m tall and no wider than its shoulder plates');
    expect(poseSet.size === Object.keys(M.poses).length && !Object.values(M.poses).some((v) => v.includes('NaN')), 'each hero pose (idle, run, jump, fall, wall slide, dash, aim) should set its own joint angles');
    expect(Math.abs(M.runSole[0]) <= 0.005 && Math.abs(M.runSole[1]) <= 0.005, 'while running, the lower boot should stay planted on the floor');
    const R2 = r.roar.phase2, R3 = r.roar.phase3, set = r.roar.setting;
    expect(R2.transition && R2.phase === 2 && R2.jolt === set && R2.rumble === +(set * 0.5).toFixed(4) && R2.calm && R2.after === 0, 'the Phase 2 roar should jolt the camera by the Boss roar shake setting, rumble at half strength while the Warden powers up, then calm down');
    expect(R3.transition && R3.phase === 3 && R3.jolt === +Math.min(1, set * 1.5).toFixed(4) && R3.rumble === +Math.min(1, set * 0.75).toFixed(4) && R3.calm && R3.after === 0, 'the Phase 3 roar should shake 1.5x as hard as the Phase 2 roar, then calm down');
    expect(r.slam.slammed && r.slam.before === 0 && Math.abs(r.slam.after - r.slam.setting) < 1e-9, 'the Warden\'s Ground pound should shake the camera by the Boss slam shake setting');

    // every model file loads through src/core/models.js and stays within the AGENTS.md budget
    const names = fs.existsSync(MODELS) ? fs.readdirSync(MODELS).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)) : [];
    const mb = Object.fromEntries(names.map((n) => [n, +(fs.statSync(path.join(MODELS, n + '.glb')).size / 1e6).toFixed(2)]));
    const files = await page.evaluate(async (list) => {
      const M = await import('/src/core/models.js'), THREE = await import('/src/core/three.js');
      const out = { enabled: M.modelsEnabled(), models: {} };
      for (const name of list) {
        try {
          const a = await M.loadModel(name), b = await M.loadModel(name);
          const meshes = (root) => { const r = []; root.traverse((o) => { if (o.isMesh) r.push(o); }); return r; };
          let tris = 0, tex = 0, lit = true;
          for (const o of meshes(a.scene)) {
            tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
            for (const m of [].concat(o.material)) {
              for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (m[k] && m[k].image) tex = Math.max(tex, m[k].image.width, m[k].image.height);
              if (m.isMeshStandardMaterial && !m.envMap) lit = false;
            }
          }
          const ma = meshes(a.scene), mb2 = meshes(b.scene);
          // the loader must build models with the game's own Three.js (the import map in index.html), or they won't render right
          const sameThree = a.scene instanceof THREE.Object3D && ma.every((o) => o.geometry instanceof THREE.BufferGeometry);
          out.models[name] = { tris, tex, lit, sameThree, meshes: ma.length, ownCopy: ma.length > 0 && ma.every((o, i) => o !== mb2[i]) };
        } catch (e) { out.models[name] = { error: String(e.message || e) }; }
      }
      return out;
    }, names);
    log('model files', { ...files, mb });
    expect(!files.enabled, 'the tests should run with the code-built looks (modelsEnabled() false when a bot drives the browser)');
    for (const n of names) {
      const m = files.models[n];
      expect(!m.error, `assets/models/${n}.glb should load (${m.error})`);
      if (m.error) continue;
      expect(m.tris > 0 && m.tris <= 30000, `assets/models/${n}.glb should have at most 30,000 triangles (has ${m.tris})`);
      expect(mb[n] <= 5, `assets/models/${n}.glb should be at most 5 MB (is ${mb[n]} MB)`);
      expect(m.tex <= 2048, `assets/models/${n}.glb textures should be at most 2048 px (largest ${m.tex})`);
      expect(m.lit, `assets/models/${n}.glb materials should get the shared reflection map`);
      expect(m.sameThree, `assets/models/${n}.glb should be built with the game's own Three.js (import map in index.html)`);
      expect(m.ownCopy, `each loadModel('${n}') call should get its own copy`);
    }

    // the 3D model hero (assets/models/hero.glb): stands on the floor at the code-built hero's height, picks the right
    // clip for each move, points the cannon along the aim, and gives way to the code-built hero again when removed
    const glb = await page.evaluate(async () => {
      const M = await import('/src/player/model.js'), { loadModel } = await import('/src/core/models.js'), THREE = await import('/src/core/three.js');
      const G = window.__game; const { p, placeAt, state, tuning, aimRay, cam } = G;
      G.loadLevel('yard'); state.mode = 'bot'; placeAt({ x: -4, y: 0, z: 2 });
      const copies = await Promise.all([0, 1, 2].map(() => loadModel('hero')));
      M.attachHeroGlb(await loadModel('hero'), copies);
      const H = M.heroGlb, hero = M.heroModel;
      let skinned = null; H.model.traverse((o) => { if (o.isSkinnedMesh) skinned = o; });
      const set = (o) => Object.assign(p, { vx: 0, vy: 0, vz: 0, grounded: true, sliding: false, dashTimer: 0, aimTimer: 0, charging: false, charge: 0, stun: 0, iframes: 0, faceX: 0, faceZ: -1, wallX: 1, wallZ: 0 }, o);
      const frame = (n = 1) => { for (let i = 0; i < n; i++) M.renderPlayer(1 / 60, p.x, p.y, p.z); };
      const box = () => { hero.group.updateMatrixWorld(true); skinned.skeleton.update(); return new THREE.Box3().setFromObject(H.model, true); };
      const out = { codeBuiltHidden: !hero.body.visible, clips: Object.keys(H.actions).sort().join(','), muzzle: !!H.muzzle };
      set({}); frame(30);
      const b = box(); out.height = +(b.max.y - b.min.y).toFixed(2); out.idleFeet = +(b.min.y - p.y).toFixed(3);
      set({ vz: -tuning.runSpeed }); let lo = 9, hi = -9;
      for (let i = 0; i < 40; i++) { frame(); const y = box().min.y - p.y; lo = Math.min(lo, y); hi = Math.max(hi, y); }
      out.runFeet = [+lo.toFixed(3), +hi.toFixed(3)];
      const poses = { idle: {}, run: { vz: -tuning.runSpeed }, jump: { grounded: false, vy: 6 }, fall: { grounded: false, vy: -6 }, wallslide: { grounded: false, sliding: true, vy: -2 }, dash: { dashTimer: 0.1, vz: -17 } };
      out.clipFor = {};
      for (const [name, o] of Object.entries(poses)) { set(o); frame(20); out.clipFor[name] = H.clip; }
      set({}); H.landT = 0.3; frame(2); out.clipFor.land = H.clip; H.landT = 0;
      // aiming: the cannon forearm lines up with the aim ray, up and down too
      out.aimDeg = [];
      for (const pitch of [0, 0.35, -0.3]) {
        cam.pitch = pitch; set({ aimTimer: 0.5 }); frame(30);
        const r = aimRay(), a = H.bones.RightForeArm.getWorldPosition(new THREE.Vector3()), h = H.bones.RightHand.getWorldPosition(new THREE.Vector3());
        out.aimDeg.push(+(h.sub(a).normalize().angleTo(new THREE.Vector3(r.fx, r.fy, r.fz)) * 180 / Math.PI).toFixed(1));
      }
      cam.pitch = 0; set({}); frame(30);
      out.muzzleNearHand = +H.muzzle.getWorldPosition(new THREE.Vector3()).distanceTo(H.bones.RightHand.getWorldPosition(new THREE.Vector3())).toFixed(2);
      M.detachHeroGlb();
      out.restored = hero.body.visible && !M.heroGlb.wrap && hero.group.children.every((c) => c === hero.body);
      set({}); frame(30);
      return out;
    });
    log('hero model file', glb);
    expect(glb.codeBuiltHidden && glb.muzzle && glb.clips === 'fall,idle,jump,land,run', 'the 3D hero should replace the code-built body and bring its five clips and a cannon muzzle');
    expect(glb.height >= 1.9 && glb.height <= 2.1 && Math.abs(glb.idleFeet) <= 0.03, 'the 3D hero should be about 2 m tall and stand on the floor');
    expect(glb.runFeet[0] >= -0.03 && glb.runFeet[0] <= 0.03, `the 3D hero's boots should touch the floor while running and never sink into it (lowest ${glb.runFeet[0]} m)`);
    const C = glb.clipFor;
    expect(C.idle === 'idle' && C.run === 'run' && C.jump === 'jump' && C.fall === 'fall' && C.wallslide === 'fall' && C.dash === 'run' && C.land === 'land', `the 3D hero should pick the clip for each move (${JSON.stringify(C)})`);
    expect(glb.aimDeg.every((d) => d <= 8), `the cannon arm should point along the aim (off by ${glb.aimDeg.join(', ')} degrees)`);
    expect(glb.muzzleNearHand <= 0.35, 'the muzzle glow should sit at the cannon');
    expect(glb.restored, 'removing the 3D hero should bring the code-built hero back');
  },
};
