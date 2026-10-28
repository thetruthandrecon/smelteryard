// Course bots: play each level from the start to the goal with enemies paused. If you change a level's
// layout on purpose, update its route here in the same pull request.
module.exports = {
  name: 'Courses: both level routes reach their goals',
  owner: 'Codex (levels)',
  async run({ page, expect, log }) {
    const bot = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('yard');
      const { p, input, cam, state, step, restartCourse, STEP, MP1, MP2, CRUSHERS } = G;
      state.mode = 'bot'; restartCourse(); state.noEnemies = true; cam.yaw = 0;
      const log = [];
      let t = 0;
      const tick = () => { step(STEP); t += STEP; };
      const clearIn = () => Object.assign(input, { moveX: 0, moveY: 0, jumpHeld: false, dashHeld: false, jumpQueued: false, dashQueued: false });
      const until = (cond, max, each) => { const end = t + max; while (t < end) { if (cond()) return true; if (each) each(); tick(); } return false; };
      const jump = () => { input.jumpQueued = true; input.jumpHeld = true; };
      const done = (r) => { state.noEnemies = false; return r; };
      const fail = (why) => done({ ok: false, log: [...log, `FAIL ${why} at t=${t.toFixed(2)} pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) cp=${state.cp} falls=${state.falls} kos=${state.kos}`] });
      const alive = () => state.kos === 0 && state.falls === 0 && state.spikeHits === 0;

      clearIn(); input.moveY = 1;
      for (let i = 0; i < 30; i++) tick();
      if (!until(() => p.z < -2.9 && p.grounded, 4)) return fail('reach yard spikes');
      jump(); tick();
      if (!until(() => p.grounded && p.z < -6, 2)) return fail('hop yard spikes');
      input.jumpHeld = false;
      for (const edge of [-10, -17, -24.5]) {
        if (!until(() => p.z < edge + 0.35 && p.grounded, 6)) return fail('reach edge ' + edge);
        jump(); tick(); input.jumpHeld = true;
        if (!until(() => p.grounded && p.z < edge - 1, 3)) return fail('land after ' + edge);
        input.jumpHeld = false;
      }
      if (!alive()) return fail('gaps');
      log.push(`spikes + gaps t=${t.toFixed(1)}`);
      if (!until(() => p.z < -30.2 && p.grounded, 4)) return fail('approach dash gap');
      input.dashQueued = true; input.dashHeld = true;
      if (!until(() => p.z < -32.5, 1)) return fail('dash to edge');
      jump(); tick(); input.dashHeld = false;
      if (!until(() => p.grounded, 3) || p.z > -41) return fail('dash-jump');
      input.jumpHeld = false;
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -53.6, 4)) return fail('enter shaft');
      clearIn();
      for (let i = 0; i < 20; i++) tick();
      let dir = 1; input.moveX = dir; jump(); tick();
      let lastJump = t, exiting = false;
      const climbed = until(() => p.grounded && p.y > 10.9 && p.z < -55.4, 14, () => {
        if (!exiting && p.onWall && !p.grounded && t - lastJump > 0.12 && p.vy < 3) {
          const finalJump = p.y > 10.4;
          dir = -dir; input.moveX = dir; jump(); lastJump = t;
          if (finalJump) exiting = true;
        }
        if (exiting && t - lastJump > 0.15) { input.moveX = 0; input.moveY = 1; }
        if (p.grounded && p.y < 2 && t - lastJump > 0.3) { exiting = false; input.moveY = 0; jump(); lastJump = t; }
        if (t - lastJump > 0.05) input.jumpHeld = true;
      });
      if (!climbed || !alive()) return fail('shaft');
      log.push(`dash-jump + shaft t=${t.toFixed(1)}`);
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -58.2 && p.grounded, 3, () => { input.moveX = -p.x * 0.5; })) return fail('approach T1 spikes');
      jump(); tick();
      if (!until(() => p.grounded && p.z < -60.6, 2)) return fail('hop T1 spikes');
      input.jumpHeld = false;
      if (!until(() => p.z < -63.3 && p.grounded, 4, () => { input.moveX = -p.x * 0.5; })) return fail('approach air-dash gap');
      input.moveX = 0;
      input.dashQueued = true; input.dashHeld = true;
      if (!until(() => p.z < -65.5, 1)) return fail('dash to edge 2');
      jump(); tick(); input.dashHeld = false;
      if (!until(() => p.vy < 1.5, 2)) return fail('apex');
      input.dashQueued = true; tick();
      if (!until(() => p.grounded || p.y < 5, 3)) return fail('air-dash landing');
      if (!(p.y > 10.9 && p.z < -78) || !alive()) return fail('air-dash gap');
      input.jumpHeld = false;
      log.push(`T1 spikes + air-dash gap t=${t.toFixed(1)}`);
      // moving platforms
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -87.2 && p.grounded, 4, () => { input.moveX = -p.x * 0.5; })) return fail('reach platform edge');
      clearIn();
      if (!until(() => MP1.cz > -91.0 && MP1.dz > 0, 8)) return fail('wait for MP1');
      jump(); input.moveY = 1; tick();
      if (!until(() => p.grounded, 2, () => { input.moveY = p.z > MP1.cz - 0.2 ? 1 : 0; })) return fail('land MP1');
      if (p.ground !== MP1) return fail('missed MP1');
      clearIn(); input.jumpHeld = false;
      if (!until(() => MP1.cz < -96.1, 8)) return fail('ride MP1');
      jump(); input.moveY = 1; tick();
      if (!until(() => p.grounded, 2, () => { input.moveY = p.z > MP2.cz + 0.2 ? 1 : 0; })) return fail('land MP2');
      if (p.ground !== MP2) return fail('missed MP2');
      clearIn(); input.jumpHeld = false;
      if (!until(() => MP2.max[1] > 10.9 && MP2.dy >= 0, 8)) return fail('ride MP2');
      jump(); input.moveY = 1; tick();
      if (!until(() => p.grounded, 2, () => { input.moveY = p.z > -104.0 ? 1 : 0; })) return fail('land T3');
      if (!(p.y > 10.9 && p.z < -103) || !alive()) return fail('platforms');
      clearIn(); input.jumpHeld = false;
      log.push(`platforms t=${t.toFixed(1)}`);
      // crushers: wait in each safe zone until the next one has just risen, then run under it
      for (const c of CRUSHERS) {
        if (!until(() => c.mode === 'up' && c.ph < 0.3, 6, () => { input.moveX = -p.x * 0.5; input.moveY = 0; })) return fail('wait crusher ' + c.zc);
        input.moveX = 0; input.moveY = 1;
        if (!until(() => p.z < c.zc - c.hd - 0.6, 2)) return fail('run crusher ' + c.zc);
        clearIn();
        if (!alive()) return fail('crushed at ' + c.zc);
      }
      log.push(`crushers t=${t.toFixed(1)}`);
      clearIn(); input.moveY = 1;
      if (!until(() => p.onWall || (p.z < -120.4 && p.grounded), 4, () => { input.moveX = -p.x * 0.5; })) return fail('reach tower');
      input.moveX = 0;
      jump(); tick(); lastJump = t;
      const topped = until(() => state.cleared, 14, () => {
        if (p.onWall && !p.grounded && t - lastJump > 0.15 && p.vy < 2) { jump(); lastJump = t; }
        if (p.grounded && p.y < 12 && t - lastJump > 0.3) { jump(); lastJump = t; }
        if (t - lastJump > 0.05) input.jumpHeld = true;
      });
      if (!topped) return fail('tower / goal');
      log.push(`goal t=${t.toFixed(1)} falls=${state.falls} kos=${state.kos}`);
      return done({ ok: true, log });
    });
    log('Test Yard bot', bot);
    expect(bot.ok, 'Test Yard bot did not reach the goal');

    const sbot = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('smelter');
      const { p, input, cam, state, step, restartCourse, STEP, LEVEL } = G;
      const CR = G.CRUSHERS; const { MPA, MPB, MPC } = LEVEL.named;
      state.mode = 'bot'; restartCourse(); state.noEnemies = true; cam.yaw = 0;
      const log = [];
      let t = 0;
      const tick = () => { step(STEP); t += STEP; };
      const clearIn = () => Object.assign(input, { moveX: 0, moveY: 0, jumpHeld: false, dashHeld: false, jumpQueued: false, dashQueued: false });
      const until = (cond, max, each) => { const end = t + max; while (t < end) { if (cond()) return true; if (each) each(); tick(); } return false; };
      const jump = () => { input.jumpQueued = true; input.jumpHeld = true; };
      const done = (r) => { state.noEnemies = false; return r; };
      const fail = (why) => done({ ok: false, log: [...log, `FAIL ${why} at t=${t.toFixed(2)} pos=(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) cp=${state.cp} falls=${state.falls} kos=${state.kos} spikes=${state.spikeHits}`] });
      const alive = () => state.kos === 0 && state.falls === 0 && state.spikeHits === 0;
      const cl = (v) => Math.max(-1, Math.min(1, v));
      const center = () => { input.moveX = cl(-p.x * 0.5); };

      // 1. the yard
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -13.65 && p.grounded, 5, center)) return fail('reach pit 1');
      jump(); tick();
      if (!until(() => p.grounded && p.z < -18.5, 3)) return fail('pit 1');
      input.jumpHeld = false;
      if (!until(() => p.z < -31.2 && p.grounded, 4, center)) return fail('approach dash pit');
      input.moveX = 0; input.dashQueued = true; input.dashHeld = true;
      if (!until(() => p.z < -33.5, 1)) return fail('dash to edge');
      jump(); tick(); input.dashHeld = false;
      if (!until(() => p.grounded, 3) || p.z > -42) return fail('dash-jump pit');
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -45.9 && p.grounded, 4, center)) return fail('reach spikes');
      jump(); tick();
      if (!until(() => p.grounded && p.z < -48.6, 2)) return fail('hop spikes');
      input.jumpHeld = false;
      if (!until(() => p.z < -56.0 && p.grounded, 4, center)) return fail('reach step');
      jump(); tick();
      if (!until(() => p.grounded && p.y > 1.5, 2)) return fail('step up');
      input.jumpHeld = false;
      if (!alive()) return fail('yard');
      log.push(`yard t=${t.toFixed(1)}`);

      // 2. furnace shaft: zig-zag wall-jumps, final jump over the back wall
      const climb = (top, floorY, exitZ) => {
        let dir = 1; input.moveX = dir; jump(); tick();
        let lastJump = t, exiting = false;
        return until(() => p.grounded && p.y > top - 0.1 && p.z < exitZ, 25, () => {
          if (!exiting && p.onWall && !p.grounded && t - lastJump > 0.12 && p.vy < 3) {
            const finalJump = p.y > top - 0.6;
            dir = -dir; input.moveX = dir; jump(); lastJump = t;
            if (finalJump) exiting = true;
          }
          if (exiting && t - lastJump > 0.15) { input.moveX = 0; input.moveY = 1; }
          if (p.grounded && p.y < floorY + 0.4 && t - lastJump > 0.3) { exiting = false; input.moveY = 0; jump(); lastJump = t; }
          if (t - lastJump > 0.05) input.jumpHeld = true;
        });
      };
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -76.4, 4, center)) return fail('enter shaft A');
      clearIn(); for (let i = 0; i < 20; i++) tick();
      if (!climb(10.4, 1.6, -79.4) || !alive()) return fail('shaft A');
      clearIn(); input.moveY = 1;
      if (!until(() => p.z < -88.0, 4, center)) return fail('enter chimney');
      clearIn(); for (let i = 0; i < 20; i++) tick();
      if (!climb(25, 10.4, -91.4) || !alive()) return fail('chimney');
      clearIn();
      log.push(`shaft t=${t.toFixed(1)}`);

      // 3. crusher hall, with a spike hop in the middle
      for (let i = 0; i < CR.length; i++) {
        const c = CR[i];
        if (i === 3) {
          input.moveY = 1;
          if (!until(() => p.z < -114.4 && p.grounded, 2, center)) return fail('reach hall spikes');
          jump(); tick();
          if (!until(() => p.z < -117.2, 1)) return fail('over hall spikes');
          input.moveY = 0;
          if (!until(() => p.grounded, 1)) return fail('land after hall spikes');
          input.jumpHeld = false;
          if (!alive()) return fail('hall spikes');
        }
        if (!until(() => c.mode === 'up' && c.ph < 0.3, 6, () => { center(); input.moveY = 0; })) return fail('wait crusher ' + c.zc);
        input.moveX = 0; input.moveY = 1;
        if (!until(() => p.z < c.zc - c.hd - 0.6, 2)) return fail('run crusher ' + c.zc);
        clearIn();
        if (!alive()) return fail('crushed at ' + c.zc);
      }
      if (state.cp !== 1) return fail('checkpoint 1');
      log.push(`crushers t=${t.toFixed(1)}`);

      // 4. lava conveyor and the three platforms
      input.moveY = 1;
      if (!until(() => p.z < -149.0, 5, center)) return fail('reach belt');
      if (state.cp !== 2) return fail('checkpoint 2');
      const lean = () => { input.moveX = cl((p.ground && p.ground.belt ? -0.467 : 0) - p.x * 0.5); };
      if (!until(() => p.z < -165.4 && p.grounded, 5, () => { lean(); input.moveY = 0.88; })) return fail('cross belt');
      if (!until(() => MPA.cz > -170.2 && MPA.dz > 0, 8, () => { lean(); input.moveY = 0; })) return fail('wait for A');
      jump(); input.moveY = 1; tick();
      if (!until(() => p.grounded, 2, () => { input.moveX = cl(-p.x * 0.8); input.moveY = p.z > MPA.cz - 0.2 ? 1 : 0; })) return fail('land A');
      if (p.ground !== MPA) return fail('missed A');
      clearIn();
      if (!until(() => MPA.cz < -175.9, 8)) return fail('ride A');
      jump(); input.moveY = 1; tick();
      if (!until(() => p.grounded, 2, () => { input.moveX = cl((MPB.cx - p.x) * 0.8); input.moveY = p.z > MPB.cz + 0.2 ? 1 : 0; })) return fail('land B');
      if (p.ground !== MPB) return fail('missed B');
      clearIn();
      if (!until(() => Math.abs(MPB.cx) < 0.5 && MPC.max[1] < 26, 8)) return fail('wait on B');
      jump(); input.moveY = 1; tick();
      if (!until(() => p.grounded, 2, () => { input.moveX = cl(-p.x * 0.8 - p.vx * 0.1); input.moveY = p.z > MPC.cz + 0.2 ? 1 : 0; })) return fail('land C');
      if (p.ground !== MPC) return fail('missed C');
      clearIn();
      if (!until(() => MPC.max[1] > 28.2, 6)) return fail('ride C');
      input.moveY = 1;
      if (!until(() => p.grounded && p.ground && !p.ground.dyn && p.z < -189, 3, center)) return fail('onto final ledge');
      if (!alive()) return fail('conveyor');
      log.push(`conveyor t=${t.toFixed(1)}`);

      // 5. the boss door
      const bossDoor = LEVEL.named.bossDoor;
      if (!until(() => bossDoor.triggered && bossDoor.open === 1, 6, center)) return fail('boss door and arena opening');
      if (state.cleared) return fail('stage cleared before the boss fight');
      if (state.cp !== 3) return fail('checkpoint 3');
      log.push(`boss door t=${t.toFixed(1)} timer=${state.time.toFixed(1)} falls=${state.falls} kos=${state.kos} spikes=${state.spikeHits}`);
      return done({ ok: true, log });
    });
    log('Smelter Yard bot', sbot);
    expect(sbot.ok, 'Smelter Yard bot did not reach the boss door');
  },
};
