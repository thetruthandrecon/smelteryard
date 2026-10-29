// Level pieces: crushers, moving platforms, health capsules, the conveyor belt, the platform cycle,
// checkpoints and the boss door.
module.exports = {
  name: 'Levels: hazards, platforms, pickups, goal',
  owner: 'Codex (levels)',
  async run({ page, expect, log }) {
    const practice = await page.evaluate(() => {
      document.getElementById('btn-boss-practice').click();
      const G = window.__game;
      return { level: G.LEVEL.id, checkpoint: G.state.cp, x: G.p.x, y: G.p.y, z: G.p.z, mode: G.state.mode };
    });
    log('Boss arena practice start', practice);
    expect(practice.level === 'smelter' && practice.checkpoint === 3 && practice.x === 0 && practice.y === 28 && practice.z === -192 && practice.mode === 'play', 'the practice button should start Smelter Yard at checkpoint 3');

    const yard = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('yard');
      const { p, input, state, placeAt, tuning, CRUSHERS, MP1, MP2 } = G; const { run, fresh } = window.__t;
      const out = {};
      // crusher: slam on top of you = knockout; safe zone = fine; blocks you while down
      const c0 = CRUSHERS[0];
      fresh(); state.worldT = (1.8 - c0.offset) / tuning.crusherSpeed; placeAt({ x: 0, y: 11, z: -107 }); run(0.6);
      out.crusher = { koUnderSlam: state.kos > 0 };
      fresh(); state.worldT = (1.8 - c0.offset) / tuning.crusherSpeed; placeAt({ x: 0, y: 11, z: -109.3 }); run(1.5);
      out.crusher.safeBetween = state.kos === 0;
      fresh(); state.worldT = (2.2 - c0.offset) / tuning.crusherSpeed; placeAt({ x: 0, y: 11, z: -105 }); input.moveY = 1; run(0.5); input.moveY = 0;
      out.crusher.blocksWhenDown = p.z > -106 + 0.3;
      // moving platforms carry you
      fresh(); run(0.05); placeAt({ x: 0, y: 11.05, z: MP1.cz }); run(0.2);
      const off0 = p.z - MP1.cz; let maxOff = 0; run(3, () => { maxOff = Math.max(maxOff, Math.abs(p.z - MP1.cz - off0)); });
      out.platforms = { mp1Carry: maxOff < 0.05 && p.grounded };
      fresh(); run(0.05); placeAt({ x: 0, y: MP2.max[1] + 0.05, z: MP2.cz }); run(0.2);
      let maxOffY = 0; run(4, () => { maxOffY = Math.max(maxOffY, Math.abs(p.y - MP2.max[1])); });
      out.platforms.mp2Carry = maxOffY < 0.05 && p.grounded;
      // health capsule
      fresh(); placeAt({ x: -3.5, y: 0, z: 5.5 }); p.hp = 6; run(0.2);
      out.pickup = { hp: p.hp };
      return out;
    });
    log('Test Yard pieces', yard);
    expect(yard.crusher.koUnderSlam && yard.crusher.safeBetween && yard.crusher.blocksWhenDown, 'crusher: should knock you out under a slam, leave you alone between, and block you while down');
    expect(yard.platforms.mp1Carry && yard.platforms.mp2Carry, 'moving platforms should carry a standing player');
    expect(yard.pickup.hp === 12, 'a health capsule should give 6 HP');

    const sm = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('smelter');
      const { p, input, state, step, placeAt, STEP, LEVEL, ENTS, events } = G; const { run } = window.__t;
      const out = { checkpoints: LEVEL.cpCount, ents: ENTS.length, crushers: G.CRUSHERS.length };
      state.mode = 'bot'; G.restartCourse(); state.noEnemies = true;
      // the conveyor pushes you toward the edge, off it is the lava, leaning against it holds you in place
      placeAt({ x: -2, y: 25, z: -158 }); run(0.05); const x0 = p.x; run(0.5);
      out.belt = { pushed: +(p.x - x0).toFixed(2), grounded: p.grounded };
      let fellAtX = null;
      run(5, () => { if (fellAtX === null && state.falls > 0) fellAtX = p.x; });
      out.belt.offEdgeIsLava = state.falls === 1 && fellAtX > 4;
      G.restartCourse(); state.noEnemies = true;
      placeAt({ x: 0, y: 25, z: -158 }); Object.assign(input, { moveX: -0.467, moveY: 0 }); run(2);
      out.belt.leanHolds = Math.abs(p.x) < 0.2; Object.assign(input, { moveX: 0, moveY: 0 });
      // platform cycle lines up: A far end with B centred, C lowest on B's next centre pass
      const { MPA, MPB, MPC } = LEVEL.named;
      const at = (t) => { state.worldT = t; step(STEP); };
      G.restartCourse(); at(2.5 - STEP); out.cycle = { aFar: +MPA.cz.toFixed(2) }; at(2.95 - STEP); out.cycle.bMid = +MPB.cx.toFixed(2); at(5.6 - STEP); out.cycle.cLowTop = +MPC.max[1].toFixed(2);
      // reaching the boss door opens it into the arena instead of clearing the stage
      G.restartCourse(); state.noEnemies = true; state.cp = 3; state.started = true;
      Object.assign(input, { moveX: 0, moveY: 0, jumpHeld: false, dashHeld: false, fireHeld: false });
      const spawnEventStart = events.length;
      run(0.1);
      out.inactiveBossSpawns = events.slice(spawnEventStart).filter((event) => event.type === 'entspawn' && event.e.kind === 'boss').length;
      placeAt({ x: 0, y: 28, z: -211.2 }); step(STEP);
      const door = LEVEL.named.bossDoor;
      out.door = { triggered: door.triggered, open: door.open, cleared: state.cleared, bossActivated: ENTS.find((e) => e.kind === 'boss').activated };
      return out;
    });
    log('Smelter Yard pieces', sm);
    expect(sm.checkpoints === 3, 'Smelter Yard should have 3 checkpoints');
    expect(sm.inactiveBossSpawns === 0, 'an inactive boss should not emit respawn events');
    expect(sm.belt.grounded && Math.abs(sm.belt.pushed - 1.75) < 0.1 && sm.belt.offEdgeIsLava && sm.belt.leanHolds, 'conveyor belt: push 3.5 m/s, lava off the edge, leaning holds you');
    expect(Math.abs(sm.cycle.aFar + 176.5) < 0.05 && Math.abs(sm.cycle.bMid) < 0.05 && Math.abs(sm.cycle.cLowTop - 25) < 0.05, 'the three conveyor platforms should stay in sync');
    expect(sm.door.triggered && !sm.door.bossActivated && !sm.door.cleared, 'approaching the boss door should open it without starting the fight or clearing the stage');

    const doorway = await page.evaluate(() => {
      const G = window.__game, boss = G.ENTS.find((e) => e.kind === 'boss');
      const door = G.LEVEL.named.bossDoor;
      G.state.noEnemies = false;
      G.placeAt({ x: 0, y: 28, z: -214 });
      let activatedDuringWait = false, attackingDuringWait = false;
      window.__t.run(12, () => {
        activatedDuringWait ||= boss.activated;
        attackingDuringWait ||= ['tellCharge', 'charge', 'tellSlag', 'slag', 'tellGround', 'ground'].includes(boss.st);
      });
      return { doorOpen: door.open === 1, activatedDuringWait, attackingDuringWait, bossActivated: boss.activated };
    });
    log('Boss doorway wait', doorway);
    expect(doorway.doorOpen && !doorway.activatedDuringWait && !doorway.attackingDuringWait && !doorway.bossActivated, 'standing in the doorway should leave the door open without starting the Warden or its attacks');

    const doorSeal = await page.evaluate(async () => {
      const G = window.__game, door = G.LEVEL.named.bossDoor, boss = G.ENTS.find((e) => e.kind === 'boss');
      const { moveAxis } = await import('/src/player/physics.js');
      Object.assign(G.input, { moveX: 0, moveY: 0, jumpHeld: false, dashHeld: false, fireHeld: false });
      G.placeAt({ x: 0, y: 28, z: -216.2 });
      G.step(G.STEP);
      const openWhileSliding = door.open > 0;
      const solidImmediately = door.min[1] === door.closedMin[1] && door.max[1] === door.closedMax[1];
      let collision = false;
      for (let i = 0; i < 20; i++) collision = moveAxis(2, 0.1) > 0 || collision;
      const remainsInside = G.p.z < door.min[2];
      G.placeAt({ x: 0, y: 28, z: -216.2 });
      window.__t.run(3.1);
      return {
        bossActivated: boss.activated,
        bossReady: boss.combatReady,
        enteredArena: door.enteredArena,
        openWhileSliding, solidImmediately, collision: collision > 0, remainsInside,
        doorClosed: door.open === 0 && door.min[1] === door.closedMin[1] && door.max[1] === door.closedMax[1],
        stageStillActive: !G.state.cleared,
        bossWalkedIn: boss.z > boss.z0,
        introFilled: boss.introProgress === 1,
        bossDamageable: boss.damageable,
      };
    });
    await page.waitForFunction(() => {
      const track = document.querySelector('.boss-track');
      return !document.getElementById('boss-hud').hidden && track && track.getAttribute('aria-valuenow') === '100';
    }, null, { timeout: 10000 });
    const bossHud = await page.evaluate(() => ({ hidden: document.getElementById('boss-hud').hidden, value: document.querySelector('.boss-track').getAttribute('aria-valuenow') }));
    log('Boss arena entry and door seal', { ...doorSeal, bossHud });
    expect(doorSeal.enteredArena && doorSeal.bossActivated && doorSeal.openWhileSliding && doorSeal.solidImmediately && doorSeal.collision && doorSeal.remainsInside && doorSeal.doorClosed, 'turning back immediately after entering should leave the player inside while the door slides shut');
    expect(doorSeal.stageStillActive && doorSeal.bossWalkedIn && doorSeal.introFilled && doorSeal.bossReady && doorSeal.bossDamageable, 'entering the arena should start the Warden intro and fill its health bar');
    expect(!bossHud.hidden && bossHud.value === '100', 'the boss health bar should stay visible and full after its intro');

    const deathReset = await page.evaluate(() => {
      const G = window.__game, boss = G.ENTS.find((e) => e.kind === 'boss'), door = G.LEVEL.named.bossDoor;
      boss.hp = 37; boss.st = 'charge'; door.open = 1; door.triggered = true;
      door.min[1] = door.closedMin[1] + 5.2; door.max[1] = door.closedMax[1] + 5.2;
      G.p.dead = 0; G.p.returning = 0; G.p.iframes = 0; G.p.hp = 3;
      G.hurt(3, 0, 1); G.step(G.STEP);
      return {
        playerDied: G.p.dead > 0,
        bossReset: !boss.activated && !boss.alive && boss.hp === boss.maxHp,
        doorOpenAgain: door.open === 1 && !door.triggered && door.min[1] === door.closedMin[1] + 5.2 && door.max[1] === door.closedMax[1] + 5.2,
      };
    });
    log('Boss arena reset after death', deathReset);
    expect(deathReset.playerDied && deathReset.bossReset && deathReset.doorOpenAgain, 'dying during the boss fight should reset the boss and reopen the arena door');
  },
};
