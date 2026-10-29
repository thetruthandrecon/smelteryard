// Player health rules: knockout and revive, spikes, lava, lives and game over.
module.exports = {
  name: 'Player: health, hazards and lives',
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
    // the Warden's Phase 2 transition: a jolt at the roar, a rumble while it powers up, then calm
    r.roar = await page.evaluate(async () => {
      const { dispatchEvents } = await import('/src/core/world.js');
      const { damageEnt } = await import('/src/enemies/enemies.js');
      const { updateCamera } = await import('/src/player/camera.js');
      const G = window.__game; const { state, STEP, placeAt, ENTS, tuning, camState, p } = G; const { run } = window.__t;
      G.loadLevel('smelter'); state.mode = 'bot'; state.noEnemies = true; G.restartCourse(); G.step(STEP); // one step before the run starts resets the boss door
      state.cp = 3; state.started = true; placeAt({ x: 0, y: 28, z: -216.2 }); G.step(STEP); run(3.2);
      const boss = ENTS.find((e) => e.kind === 'boss');
      placeAt({ x: 0, y: 28, z: boss.z + 8 }); p.iframes = 99; boss.st = 'idle'; boss.hp = 52;
      dispatchEvents(); camState.shake = 0;
      damageEnt(boss, 4, boss.x, boss.y + 0.6, boss.z + boss.hz, 0);
      const transition = boss.st === 'phaseTransition';
      dispatchEvents(); const jolt = camState.shake;
      // let the jolt fade, then check the rumble holds while the Warden powers up
      for (let i = 0; i < 60; i++) updateCamera(1 / 60, p.x, p.y, p.z);
      run(1); const rumble = camState.shake;
      run(tuning.bossPhaseTransitionTime);
      for (let i = 0; i < 60; i++) updateCamera(1 / 60, p.x, p.y, p.z);
      return { transition, jolt, rumble, after: camState.shake, setting: tuning.roarShake, calm: boss.st !== 'phaseTransition' };
    });
    log('player', r);
    expect(r.ko.died && r.ko.revived && r.ko.hp === 16 && r.ko.backAtStart, 'a knockout should revive you at the checkpoint with full health');
    expect(r.spikes.hp === 12 && r.spikes.lives === 3 && r.spikes.backAtStart, 'spikes should take 4 HP and send you back to the checkpoint without costing a life');
    expect(r.spikes.survivesWhileFlashing, 'spikes should not hurt while you are still flashing');
    expect(r.lives.lavaHp === 6 && r.lives.livesAfterLava === 3 && r.lives.backAtCheckpoint, 'lava should take 4 HP and send you back to the checkpoint');
    expect(r.lives.lowHpLavaCostsLife, 'lava at 4 HP or less should cost a life');
    expect(r.lives.lastKoGameOver && r.lives.lastFallGameOver, 'losing the last life should be game over');
    expect(r.lives.restartResets, 'restart should reset checkpoint, lives, position and health');
    expect(r.roar.transition && Math.abs(r.roar.jolt - r.roar.setting) < 1e-9, 'the Warden\'s Phase 2 roar should jolt the camera by the Phase 2 roar shake setting');
    expect(Math.abs(r.roar.rumble - r.roar.setting * 0.5) < 1e-9 && r.roar.calm && r.roar.after === 0, 'the camera should rumble at half strength while the Warden powers up, and calm down once it is done');
    expect(r.slam.slammed && r.slam.before === 0 && Math.abs(r.slam.after - r.slam.setting) < 1e-9, 'the Warden\'s Ground pound should shake the camera by the Boss slam shake setting');
  },
};
