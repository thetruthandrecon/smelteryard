// Enemies behave the same way every time: turret fire, walker patrol and contact damage, flyer swoop.
module.exports = {
  name: 'Enemies: turret, walker, flyer',
  owner: 'Codex (enemies)',
  async run({ page, expect, log }) {
    const r = await page.evaluate(async () => {
      const G = window.__game; G.loadLevel('yard');
      const { p, cam, state, placeAt, ENTS, SHOTS, STEP, tuning } = G; const { run, press, fresh } = window.__t;
      const { GROUND_WAVES } = await import('/src/enemies/enemies.js');
      const out = {};
      // turret hits and knockback
      const tur = ENTS[5]; fresh(tur);
      placeAt({ x: 3, y: 0, z: -9.5 }); cam.yaw = 0;
      let hits = 0, prev = p.hp, firstKnock = 0;
      run(5, () => { if (p.hp < prev) { hits++; if (!firstKnock) firstKnock = +Math.hypot(p.vx, p.vz).toFixed(2); } prev = p.hp; });
      out.turret = { hits, hpAfter5s: p.hp, firstKnock };
      // walker: patrols the same way every time and turns at both ends
      const wk = ENTS[7];
      const trace = () => { fresh(wk); placeAt({ x: 10, y: 0, z: 9 }); const xs = []; let flips = 0, lastDir = wk.dir; run(20, (t) => { if (Math.round(t / STEP) % 60 === 0) xs.push(+wk.x.toFixed(4)); if (wk.dir !== lastDir) { flips++; lastDir = wk.dir; } }); return { xs, flips }; };
      const a = trace(), b = trace();
      out.walker = { repeatable: JSON.stringify(a.xs) === JSON.stringify(b.xs), flips: a.flips, minX: Math.min(...a.xs), maxX: Math.max(...a.xs), stuck: new Set(a.xs).size < 10 };
      // walker contact damage
      fresh(wk); placeAt({ x: 1.5, y: 0, z: -1.2 }); const hp0 = p.hp;
      run(3);
      out.walker.contactDamage = hp0 - p.hp;
      // walker destroyed by 3 shots (frozen in place), then respawns at home
      fresh(wk); state.noEnemies = true; wk.x = 0;
      placeAt({ x: -tuning.camShoulder, y: 0, z: 5 }); cam.yaw = 0; cam.pitch = -0.08; run(0.2);
      press(); run(0.3); press(); run(0.3); press(); run(0.3);
      out.walker.destroyedBy3Shots = !wk.alive;
      run(6.2); out.walker.respawnedHome = wk.alive && wk.x === wk.x0;
      state.noEnemies = false;
      // flyer: hover -> telegraph -> swoop -> return, then home again
      const fl = ENTS[8]; fresh(fl);
      placeAt({ x: 3, y: 0, z: -3 }); cam.yaw = 0;
      const seen = new Set(); const hpA = p.hp;
      run(6, () => seen.add(fl.st));
      out.flyer = { states: [...seen].join('>'), hurtPlayer: p.hp < hpA };
      placeAt({ x: -10, y: 0, z: 10 }); run(5);
      out.flyer.backHome = fl.st === 'hover' && Math.hypot(fl.x - fl.x0, fl.z - fl.z0) < 0.01;

      // boss shots bounce with impact while the intro makes it invulnerable, then damage health
      G.loadLevel('smelter'); state.mode = 'bot'; state.noEnemies = true; G.restartCourse();
      state.cp = 3; state.started = true; placeAt({ x: 0, y: 28, z: -216.2 }); G.step(STEP);
      const boss = ENTS.find((e) => e.kind === 'boss');
      const shot = (z, level = 0, y = 30, x = 0) => SHOTS.push({ x, y, z, vx: 0, vy: 0, vz: -45, level, life: 1.6, hit: new Set() });
      let eventStart = G.events.length;
      shot(-237); run(0.2);
      out.bossBlockedShot = { hp: boss.hp, impact: G.events.slice(eventStart).some((e) => e.type === 'hit' && e.blocked), shotRemoved: SHOTS.length === 0 };
      run(3.1);
      out.bossReady = { activated: boss.activated, combatReady: boss.combatReady, damageable: boss.damageable };
      eventStart = G.events.length;
      shot(-223, 0, boss.y + 0.6); run(0.6);
      out.bossDamage = { hp: boss.hp, impact: G.events.slice(eventStart).some((e) => e.type === 'hit' && !e.blocked) };

      // the core sphere takes 1.5x damage compared to the same level body hit
      let bossHp = boss.hp;
      eventStart = G.events.length;
      shot(boss.z + 4, 0, boss.y + 2.12); run(0.2);
      out.bossCoreHit = { damage: +(bossHp - boss.hp).toFixed(1), weakspot: G.events.slice(eventStart).some((e) => e.type === 'hit' && e.weakspot) };
      bossHp = boss.hp;
      eventStart = G.events.length;
      shot(boss.z + 4, 0, boss.y + 0.6); run(0.2);
      out.bossBodyHit = { damage: +(bossHp - boss.hp).toFixed(1), weakspot: G.events.slice(eventStart).some((e) => e.type === 'hit' && e.weakspot) };

      // Slag alternates with Charge, targets the player's position at the end of its tell, and leaves damaging fire
      const savedDamageTaken = tuning.damageTaken;
      out.slagDamageSliders = { blob: tuning.slagBlobDamage, fire: tuning.slagFireDamage };
      state.noEnemies = false; boss.combatReady = true; boss.st = 'idle'; boss.cd = 0; boss.nextAttack = 'slag';
      p.dead = 0; p.returning = 0; p.iframes = 10; p.hp = 16;
      placeAt({ x: -2, y: boss.y, z: boss.z + 8 });
      eventStart = G.events.length; G.step(STEP);
      const slagWarned = boss.st === 'slagTell' && G.events.slice(eventStart).some((e) => e.type === 'bosstelegraph' && e.attack === 'slag');
      run(0.49);
      const slagTellHeld = boss.st === 'slagTell';
      const slagTargetZ = boss.z + 8;
      placeAt({ x: 0.5, y: boss.y, z: slagTargetZ });
      eventStart = G.events.length; run(0.02);
      const slagTargets = G.ESHOTS.filter((s) => s.kind === 'slag').map((s) => ({ x: s.targetX, z: s.targetZ }));
      out.bossSlagVolley = { warned: slagWarned, tellHeld: slagTellHeld, count: slagTargets.length, targetXs: slagTargets.map((s) => +s.x.toFixed(1)).sort((a, b) => a - b), targetZs: slagTargets.map((s) => +s.z.toFixed(1)), nextAttack: boss.nextAttack };
      placeAt({ x: 4, y: boss.y, z: slagTargetZ + 4 });
      run(0.75);
      const slagLandedEarly = G.events.slice(eventStart).some((e) => e.type === 'slagland');
      run(0.12);
      out.bossSlagLandings = { early: slagLandedEarly, count: G.events.slice(eventStart).filter((e) => e.type === 'slagland').length };

      tuning.damageTaken = 1.5;
      p.iframes = 0; p.hp = 16;
      placeAt({ x: 0.5, y: boss.y, z: slagTargetZ });
      eventStart = G.events.length; G.step(STEP);
      const fireHurt = G.events.slice(eventStart).find((e) => e.type === 'hurt');
      out.bossSlagFireHit = { damage: fireHurt?.amount ?? 0, hp: p.hp, effect: G.events.slice(eventStart).some((e) => e.type === 'slagfirehit') };

      // let the patches expire without another boss attack, then return to the center to verify they are gone
      boss.activated = false; placeAt({ x: 4, y: boss.y, z: slagTargetZ + 4 });
      run(3.05);
      p.hp = 16; p.iframes = 0; placeAt({ x: 0.5, y: boss.y, z: slagTargetZ });
      eventStart = G.events.length; G.step(STEP);
      out.bossSlagExpired = p.hp === 16 && !G.events.slice(eventStart).some((e) => e.type === 'slagfirehit');

      // a direct blob hit uses hurt(), including the normal damage multiplier and knockback
      boss.activated = true; boss.combatReady = true; boss.st = 'idle'; boss.cd = 0; boss.nextAttack = 'slag';
      p.hp = 16; p.iframes = 0; placeAt({ x: 0.5, y: boss.y, z: slagTargetZ });
      tuning.damageTaken = 1.5; eventStart = G.events.length;
      let blobKnockback = false;
      G.step(STEP); run(0.52); run(0.8, () => {
        if (!blobKnockback && G.events.slice(eventStart).some((e) => e.type === 'slagblobhit')) blobKnockback = Math.hypot(p.vx, p.vz) > 0;
      });
      const blobHurt = G.events.slice(eventStart).find((e) => e.type === 'hurt');
      out.bossSlagBlobHit = { damage: blobHurt?.amount ?? 0, hp: p.hp, impact: G.events.slice(eventStart).some((e) => e.type === 'slagblobhit'), knockedBack: blobKnockback };
      tuning.damageTaken = savedDamageTaken;

      out.groundWaveTuning = { damage: tuning.groundWaveDamage, speed: tuning.groundWaveSpeed };
      const groundMidZ = (boss.chargeFrontZ + boss.chargeBackZ) * 0.5;
      const prepareGroundPound = ({ x = 0, z = groundMidZ - 6 } = {}) => {
        G.ESHOTS.length = 0; GROUND_WAVES.length = 0; state.noEnemies = false; state.started = true;
        boss.activated = true; boss.alive = true; boss.damageable = true; boss.combatReady = true;
        boss.x = 0; boss.y = 28; boss.z = groundMidZ; boss.st = 'idle'; boss.cd = 0; boss.t2 = 0;
        boss.nextAttack = 'groundpound'; boss.introEntering = false; boss.groundWaveDirZ = 0;
        p.dead = 0; p.returning = 0; p.iframes = 0; p.hp = 16;
        Object.assign(G.input, { moveX: 0, moveY: 0, jumpHeld: false, jumpQueued: false, dashHeld: false, dashQueued: false });
        placeAt({ x, y: boss.y, z });
        const start = G.events.length; G.step(STEP);
        return { start, groundedAtTell: p.grounded };
      };

      // a grounded player is hit when the visible floor wave reaches them
      let pound = prepareGroundPound();
      const groundWarned = boss.st === 'groundTell' && G.events.slice(pound.start).some((e) => e.type === 'bosstelegraph' && e.attack === 'groundpound');
      run(0.49);
      const groundTellHeld = boss.st === 'groundTell';
      run(0.02);
      const groundLaunched = G.events.slice(pound.start).some((e) => e.type === 'bossgroundslam');
      const nextAttackAfterPound = boss.nextAttack;
      boss.combatReady = false;
      run(0.7);
      const groundPass = G.events.slice(pound.start).find((e) => e.type === 'groundwavepass');
      out.groundWaveStanding = { warned: groundWarned, tellHeld: groundTellHeld, launched: groundLaunched, groundedAtTell: pound.groundedAtTell, groundedAtPass: groundPass?.grounded, hit: G.events.slice(pound.start).some((e) => e.type === 'groundwavehit'), damage: 16 - p.hp, nextAttack: nextAttackAfterPound };
      run(0.5);

      // the full-width wave also reaches players at the side wall and the door wall
      pound = prepareGroundPound({ x: 4.6, z: groundMidZ - 6 });
      run(0.49); run(0.02); boss.combatReady = false;
      const sideWallWave = GROUND_WAVES[0];
      const sideWallWaveShape = { x: sideWallWave?.x, width: sideWallWave?.width, endZ: sideWallWave?.endZ };
      run(1.5);
      out.groundWaveSideWall = { groundedAtTell: pound.groundedAtTell, hit: G.events.slice(pound.start).some((e) => e.type === 'groundwavehit'), damage: 16 - p.hp, ...sideWallWaveShape };
      run(0.2);

      pound = prepareGroundPound({ x: 0, z: -216.6 });
      run(0.49); run(0.02); boss.combatReady = false;
      const doorWallWave = GROUND_WAVES[0];
      const doorWallWaveShape = { x: doorWallWave?.x, width: doorWallWave?.width, endZ: doorWallWave?.endZ };
      run(1.5);
      out.groundWaveDoorWall = { groundedAtTell: pound.groundedAtTell, hit: G.events.slice(pound.start).some((e) => e.type === 'groundwavehit'), damage: 16 - p.hp, ...doorWallWaveShape };
      run(0.2);

      // jump with no dash as the wave approaches; it passes while the player is airborne
      pound = prepareGroundPound();
      const jumpGroundWarned = boss.st === 'groundTell' && G.events.slice(pound.start).some((e) => e.type === 'bosstelegraph' && e.attack === 'groundpound');
      run(0.49); run(0.02); boss.combatReady = false; run(0.25);
      const jumpStart = G.events.length;
      G.input.jumpQueued = true; G.input.jumpHeld = true; G.step(STEP); run(0.4);
      G.input.jumpHeld = false;
      const airbornePass = G.events.slice(pound.start).find((e) => e.type === 'groundwavepass');
      out.groundWaveJump = { warned: jumpGroundWarned, jumped: G.events.slice(jumpStart).some((e) => e.type === 'jump'), groundedAtPass: airbornePass?.grounded, hit: G.events.slice(pound.start).some((e) => e.type === 'groundwavehit'), damage: 16 - p.hp };
      run(0.9);
      boss.combatReady = true;

      // touching the Warden hurts, and the half-second Charge warning precedes its ram
      boss.activated = true; boss.nextAttack = 'charge';
      boss.st = 'idle'; boss.cd = 100; state.noEnemies = false;
      placeAt({ x: boss.x, y: boss.y, z: boss.z }); p.iframes = 0; p.hp = 16; G.step(STEP);
      out.bossContactDamage = 16 - p.hp;
      boss.st = 'idle'; boss.cd = 0; boss.chargeDirZ = 0; boss.x = -3; p.iframes = 0; p.hp = 16;
      placeAt({ x: 3.5, y: boss.y, z: boss.z + 5 });
      eventStart = G.events.length; G.step(STEP);
      const bossWarned = G.events.slice(eventStart).some((e) => e.type === 'bosstelegraph' && e.attack === 'charge');
      run(0.25);
      const linedUpDuringTell = boss.x > -3;
      placeAt({ x: 2.5, y: boss.y, z: p.z });
      run(0.26);
      const chargeStarted = boss.st === 'charge';
      const lockedX = boss.x;
      run(0.2);
      const chargeDamage = 16 - p.hp;
      placeAt({ x: -3.5, y: boss.y, z: p.z }); run(0.1);
      const laneLocked = Math.abs(boss.x - lockedX) < 0.001;
      run(0.6);
      const frontReached = boss.st === 'idle' && boss.z === boss.chargeFrontZ;
      const nextAttackAfterCharge = boss.nextAttack;
      boss.st = 'idle'; boss.cd = 0; boss.z = boss.chargeFrontZ; boss.chargeDirZ = -1; boss.nextAttack = 'charge'; p.iframes = 10;
      placeAt({ x: boss.x, y: boss.y, z: boss.z - 5 }); G.step(STEP); run(0.51);
      const reverseChargeStarted = boss.st === 'charge';
      run(1.5);
      out.bossCharge = { warned: bossWarned, linedUpDuringTell, alignedX: +lockedX.toFixed(1), started: chargeStarted, laneLocked, frontReached, nextAttackAfterCharge, reverseChargeStarted, fullCross: boss.st === 'idle' && boss.z === boss.chargeBackZ, damage: chargeDamage, speed: boss.chargeSpeed, lane: +Math.abs(boss.chargeFrontZ - boss.chargeBackZ).toFixed(1), frontZ: boss.chargeFrontZ, backZ: boss.chargeBackZ };
      return out;
    });
    log('enemies', r);
    await page.waitForFunction(() => {
      const track = document.querySelector('.boss-track');
      return !document.getElementById('boss-hud').hidden && track && track.getAttribute('aria-valuenow') === '94';
    }, null, { timeout: 3000 });
    const bossHealthBar = await page.evaluate(() => ({ count: document.querySelectorAll('.boss-track').length, value: document.querySelector('.boss-track').getAttribute('aria-valuenow'), label: document.getElementById('boss-health-label').textContent }));
    log('boss health bar after hit', bossHealthBar);
    expect(r.turret.hits >= 1 && r.turret.firstKnock > 0, 'the turret should hit and knock back a player standing in front of it');
    expect(r.walker.repeatable && !r.walker.stuck && r.walker.flips >= 2, 'the walker should patrol the same way every time and turn at both ends');
    expect(r.walker.contactDamage > 0, 'touching a walker should hurt');
    expect(r.walker.destroyedBy3Shots && r.walker.respawnedHome, 'a walker should die to 3 shots and respawn at home');
    expect(r.flyer.states === 'hover>tele>swoop>return' && r.flyer.hurtPlayer && r.flyer.backHome, 'the flyer should hover, telegraph, swoop, hit, and return home');
    expect(r.bossBlockedShot.hp === 180 && r.bossBlockedShot.impact && r.bossBlockedShot.shotRemoved, 'an intro-blocked boss shot should spark and stop without damaging the boss');
    expect(r.bossReady.activated && r.bossReady.combatReady && r.bossReady.damageable && r.bossDamage.hp === 179 && r.bossDamage.impact, 'the Warden should become damageable at full intro and show impacts while losing health');
    expect(r.bossContactDamage === 3, 'touching the Warden should deal 3 HP contact damage');
    expect(r.bossCharge.warned && r.bossCharge.linedUpDuringTell && r.bossCharge.alignedX === 2.5 && r.bossCharge.started && r.bossCharge.laneLocked && r.bossCharge.frontReached && r.bossCharge.reverseChargeStarted && r.bossCharge.fullCross && r.bossCharge.damage === 4 && r.bossCharge.speed === 18 && r.bossCharge.lane === 25.8 && r.bossCharge.frontZ === -218 && r.bossCharge.backZ === -243.8, 'the Warden should track the player during its tell, lock the lane, and Charge across the full arena for 4 HP at 18 m/s');
    expect(r.bossCoreHit.damage === 1.5 && r.bossCoreHit.weakspot && r.bossBodyHit.damage === 1 && !r.bossBodyHit.weakspot, 'a chest-core hit should deal 1.5x the damage of an otherwise identical body hit');
    expect(r.slagDamageSliders.blob === 3 && r.slagDamageSliders.fire === 2, 'the Slag blob and fire damage sliders should default to 3 HP and 2 HP');
    expect(r.bossSlagVolley.warned && r.bossSlagVolley.tellHeld && r.bossSlagVolley.count === 3 && JSON.stringify(r.bossSlagVolley.targetXs) === JSON.stringify([-1.5, 0.5, 2.5]) && r.bossSlagVolley.targetZs.every((z) => z === -223) && r.bossSlagVolley.nextAttack === 'groundpound', 'the Warden should hold the Slag tell, lob three blobs 2 m apart around the player, and alternate to Ground Pound');
    expect(!r.bossSlagLandings.early && r.bossSlagLandings.count === 3 && r.bossSlagFireHit.damage === 3 && r.bossSlagFireHit.hp === 13 && r.bossSlagFireHit.effect && r.bossSlagExpired, 'Slag blobs should take about 0.8 s to land, leave three-second fire patches, and deal scaled 2 HP touch damage through hurt()');
    expect(r.bossSlagBlobHit.damage === 4.5 && r.bossSlagBlobHit.hp === 11.5 && r.bossSlagBlobHit.impact && r.bossSlagBlobHit.knockedBack, 'a Slag blob should deal scaled 3 HP damage and apply normal knockback');
    expect(r.bossCharge.nextAttackAfterCharge === 'slag', 'the Warden should alternate to Slag after a Charge');
    expect(r.groundWaveTuning.damage === 3 && r.groundWaveTuning.speed === 12, 'Ground wave damage and speed should default to 3 HP and 12 m/s and be adjustable in Tuning → Enemies');
    expect(r.groundWaveStanding.warned && r.groundWaveStanding.tellHeld && r.groundWaveStanding.launched && r.groundWaveStanding.groundedAtTell && r.groundWaveStanding.groundedAtPass && r.groundWaveStanding.hit && r.groundWaveStanding.damage === 3 && r.groundWaveStanding.nextAttack === 'charge', 'the Warden should telegraph Ground Pound for 0.5 s, hit a grounded player for the tuned damage, and alternate to Charge');
    expect(r.groundWaveSideWall.groundedAtTell && r.groundWaveSideWall.hit && r.groundWaveSideWall.damage === 3 && r.groundWaveSideWall.x === 0 && r.groundWaveSideWall.width === 10 && r.groundWaveSideWall.endZ === -245, 'the full-width Ground Pound wave should hit a grounded player beside the side wall and travel to the back wall');
    expect(r.groundWaveDoorWall.groundedAtTell && r.groundWaveDoorWall.hit && r.groundWaveDoorWall.damage === 3 && r.groundWaveDoorWall.x === 0 && r.groundWaveDoorWall.width === 10 && r.groundWaveDoorWall.endZ === -216, 'the Ground Pound wave should hit a grounded player beside the door wall and travel to its endpoint');
    expect(r.groundWaveJump.warned && r.groundWaveJump.jumped && r.groundWaveJump.groundedAtPass === false && !r.groundWaveJump.hit && r.groundWaveJump.damage === 0, 'a normal jump timed to the wave should pass over it without taking damage');
    expect(bossHealthBar.count === 1 && bossHealthBar.value === '94' && bossHealthBar.label === 'Phase 1 · 57 / 60 HP', 'the single boss bar should show Phase 1 and its remaining HP');
    const phases = await page.evaluate(async () => {
      const G = window.__game;
      const { damageEnt, FIRE_PATCHES, GROUND_WAVES } = await import('/src/enemies/enemies.js');
      const { dispatchEvents } = await import('/src/core/world.js');
      const { updateHud } = await import('/src/ui/ui.js');
      const { run } = window.__t;
      G.loadLevel('smelter'); G.state.mode = 'bot'; G.state.noEnemies = true; G.restartCourse();
      G.step(G.STEP);
      G.state.cp = 3; G.state.started = true;
      G.placeAt({ x: 0, y: 28, z: -216.2 }); G.step(G.STEP); run(3.1);
      const boss = G.ENTS.find((e) => e.kind === 'boss');
      const bodyHit = () => [boss.x, boss.y + 0.5, boss.z + boss.hz];
      const bar = () => {
        updateHud(G.STEP);
        const track = document.querySelector('.boss-track');
        return { count: document.querySelectorAll('.boss-track').length,
          value: Number(track.getAttribute('aria-valuenow')),
          label: document.getElementById('boss-health-label').textContent,
          aria: track.getAttribute('aria-label') };
      };
      const initial = { hp: boss.hp, max: boss.maxHp, perBar: boss.hpPerBar, bar: bar() };
      boss.hp = 121; boss.st = 'chargeTell'; boss.t2 = 0.4;
      let eventStart = G.events.length;
      damageEnt(boss, 12, ...bodyHit(), 0);
      const first = {
        hp: boss.hp, phase: boss.bossPhase, cancelledTell: boss.st === 'phaseTransition' && boss.t2 === 0,
        event: G.events.slice(eventStart).some((e) => e.type === 'bossphase2'), bar: bar(),
      };
      eventStart = G.events.length;
      damageEnt(boss, 4, ...bodyHit(), 0);
      first.blocked = boss.hp === 120 && G.events.slice(eventStart).some((e) => e.type === 'hit' && e.blocked);
      G.placeAt({ x: 4, y: 28, z: -220 }); G.p.iframes = 99; G.state.noEnemies = false;
      eventStart = G.events.length; run(2.75);
      first.refill = bar().value;
      first.held = boss.st === 'phaseTransition' && !boss.damageable &&
        !G.events.slice(eventStart).some((e) => ['bosscharge', 'bossslag', 'bossgroundslam', 'bosssteamspin'].includes(e.type));
      G.state.noEnemies = true; run(0.35);
      first.resumed = boss.st === 'idle' && boss.damageable;
      first.full = bar().value;

      // Phase 2 keeps the existing faster Charge, fire trail, and open-core window.
      boss.st = 'charge'; boss.x = 0; boss.z = -231; boss.chargeX = 0;
      boss.chargeDirZ = 1; boss.chargeTargetZ = boss.chargeFrontZ; boss.fireTrailDistance = 0;
      G.state.noEnemies = false;
      const phase2FromZ = boss.z; G.step(G.STEP);
      const phase2Step = boss.z - phase2FromZ;
      run(0.25);
      const trail = FIRE_PATCHES.filter((fire) => fire.source === 'charge');
      const fire = trail[0], fireLife = fire?.life ?? 0;
      let fireDamage = 0, fireHit = false;
      if (fire) {
        G.placeAt({ x: fire.x, y: 28, z: fire.z }); G.p.hp = 16; G.p.iframes = 0;
        eventStart = G.events.length; G.step(G.STEP);
        fireDamage = 16 - G.p.hp;
        fireHit = G.events.slice(eventStart).some((e) => e.type === 'bossfirehit');
      }
      G.state.noEnemies = true; G.p.iframes = 99; run(0.6);
      const phase2Recovery = boss.cd;
      FIRE_PATCHES.length = 0;
      boss.st = 'groundTell'; boss.t2 = G.STEP; boss.groundWaveDirZ = 1;
      boss.z = -231; boss.yaw = Math.PI; boss.hp = 110;
      G.events.length = 0; G.step(G.STEP);
      const coreOpened = G.events.some((e) => e.type === 'bosscoreopen');
      const corePoint = [boss.x, boss.y + 2.12, boss.z + 0.72];
      const hpBeforeCore = boss.hp;
      damageEnt(boss, 4, ...corePoint, 0);
      const openDamage = hpBeforeCore - boss.hp;
      GROUND_WAVES.length = 0;

      // The second threshold can be reached during a Charge; it completes first.
      boss.hp = 61; boss.st = 'charge'; boss.x = 0; boss.z = -231; boss.chargeX = 0;
      boss.chargeDirZ = 1; boss.chargeTargetZ = boss.chargeFrontZ; boss.fireTrailDistance = 0;
      eventStart = G.events.length;
      damageEnt(boss, 12, ...bodyHit(), 0);
      const pending = boss.pendingPhase === 3 && boss.st === 'charge' && !boss.damageable && boss.hp === 60;
      damageEnt(boss, 4, ...bodyHit(), 0);
      const pendingBlocked = boss.hp === 60 && G.events.slice(eventStart).some((e) => e.type === 'hit' && e.blocked);
      G.placeAt({ x: 4, y: 28, z: -220 }); G.p.iframes = 99;
      const beforePendingZ = boss.z; G.step(G.STEP);
      const pendingStep = boss.z - beforePendingZ;
      run(0.8);
      const second = {
        pending, pendingBlocked, phase: boss.bossPhase,
        event: G.events.slice(eventStart).some((e) => e.type === 'bossphase3'),
        afterCharge: boss.st === 'phaseTransition' && !boss.damageable,
        bar: bar(),
      };
      eventStart = G.events.length;
      G.state.noEnemies = false;
      run(Math.max(0, boss.phaseTransitionTimer - 0.15));
      second.refill = bar().value;
      second.held = boss.st === 'phaseTransition' && !boss.damageable &&
        !G.events.slice(eventStart).some((e) => ['bosscharge', 'bossslag', 'bossgroundslam', 'bosssteamspin'].includes(e.type));
      damageEnt(boss, 4, ...bodyHit(), 0);
      second.blocked = boss.hp === 60 && G.events.slice(eventStart).some((e) => e.type === 'hit' && e.blocked);
      G.state.noEnemies = true; run(0.25);
      second.resumed = boss.st === 'idle' && boss.damageable;
      second.full = bar().value;

      // Phase 3 speeds every attack and increases damage, including the fire.
      boss.st = 'charge'; boss.x = 0; boss.z = -231; boss.chargeX = 0;
      boss.chargeDirZ = 1; boss.chargeTargetZ = boss.chargeFrontZ; boss.fireTrailDistance = 0;
      G.placeAt({ x: 0, y: 28, z: -230 }); G.p.iframes = 0; G.p.hp = 16;
      G.state.noEnemies = false;
      const beforeZ = boss.z; G.step(G.STEP);
      const phase3Step = boss.z - beforeZ, chargeDamage = 16 - G.p.hp;
      G.placeAt({ x: 4, y: 28, z: -220 }); G.p.iframes = 99; run(0.25);
      const phase3Fire = FIRE_PATCHES.find((patch) => patch.source === 'charge');
      G.state.noEnemies = true; run(0.5);
      const phase3Recovery = boss.cd;
      FIRE_PATCHES.length = 0;

      boss.st = 'slagTell'; boss.t2 = G.STEP; boss.z = -231; boss.yaw = Math.PI;
      G.placeAt({ x: 0, y: 28, z: -223 }); G.step(G.STEP);
      const slag = G.ESHOTS.find((s) => s.kind === 'slag');
      const slagFlight = slag ? slag.life + G.STEP - 0.15 : 0;
      G.ESHOTS.length = 0;
      boss.st = 'groundTell'; boss.t2 = G.STEP; boss.groundWaveDirZ = 1;
      boss.z = -231; boss.yaw = Math.PI; G.step(G.STEP);
      const wave = GROUND_WAVES[0];
      const waveSpeed = wave?.speed ?? 0, waveDamage = wave?.damage ?? 0;
      GROUND_WAVES.length = 0;

      // Steam spin is a Phase 3 move with a 0.5 s tell and 3.5 m reach.
      boss.st = 'idle'; boss.cd = 0; boss.nextAttack = 'steam'; boss.x = 0; boss.z = -231;
      G.placeAt({ x: 4.6, y: 28, z: -231 }); G.p.iframes = 99;
      G.state.noEnemies = false; eventStart = G.events.length; G.step(G.STEP);
      const steamWarned = boss.st === 'steamTell' && G.events.slice(eventStart).some((e) => e.type === 'bosstelegraph' && e.attack === 'steam');
      run(0.49); const steamTellHeld = boss.st === 'steamTell';
      run(0.02); const steamStarted = boss.st === 'steamSpin';
      boss.x = 0; boss.z = -231;
      G.placeAt({ x: 3, y: 28, z: -231 }); G.p.iframes = 0; G.p.hp = 16;
      eventStart = G.events.length; G.step(G.STEP);
      const steamInside = { damage: 16 - G.p.hp, event: G.events.slice(eventStart).some((e) => e.type === 'bosssteamhit') };
      boss.x = 0; boss.z = -231; boss.st = 'steamSpin'; boss.t2 = 1.5;
      G.placeAt({ x: 4.6, y: 28, z: -231 }); G.p.iframes = 0; G.p.hp = 16;
      eventStart = G.events.length; G.step(G.STEP);
      const steamOutside = { damage: 16 - G.p.hp, event: G.events.slice(eventStart).some((e) => e.type === 'bosssteamhit'), slide: boss.x };
      G.state.noEnemies = true; run(1.6);

      boss.hp = 1; G.events.length = 0;
      const killed = damageEnt(boss, 1, ...bodyHit(), 0);
      const explosion = G.events.some((e) => e.type === 'bossdefeat');
      const cleared = G.state.cleared && !G.state.timing;
      dispatchEvents();
      return {
        tuning: { transition: G.tuning.bossPhaseTransitionTime, speed2: G.tuning.bossPhase2SpeedMult,
          speed3: G.tuning.bossPhase3SpeedMult, damage3: G.tuning.bossPhase3DamageMult,
          charge: boss.chargeSpeed, wave: G.tuning.groundWaveSpeed, openTime: G.tuning.bossCoreOpenDuration },
        initial, first, second, phase2Step, phase2Recovery, pendingStep, phase3Step, phase3Recovery,
        phase2Fire: { count: trail.length, life: fireLife, damage: fireDamage, hit: fireHit },
        core: { opened: coreOpened, damage: openDamage },
        phase3: { chargeDamage, fireMultiplier: phase3Fire?.damageMult, slagFlight,
          slagMultiplier: slag?.damageMult, waveSpeed, waveDamage },
        steam: { warned: steamWarned, tellHeld: steamTellHeld, started: steamStarted, inside: steamInside, outside: steamOutside },
        defeat: { killed, explosion, cleared, mode: G.state.mode },
      };
    });
    log('Warden three phases and defeat', phases);
    expect(phases.initial.hp === 180 && phases.initial.max === 180 && phases.initial.perBar === 60 &&
      phases.initial.bar.count === 1 && phases.initial.bar.value === 100 && phases.initial.bar.label === 'Phase 1 · 60 / 60 HP',
      'the Warden should start with three full 60 HP bars');
    expect(phases.first.hp === 120 && phases.first.phase === 2 && phases.first.event && phases.first.cancelledTell &&
      phases.first.blocked && phases.first.held && phases.first.resumed && phases.first.bar.count === 1 &&
      phases.first.bar.value === 0 && phases.first.bar.label.startsWith('Phase 2 ·') &&
      phases.first.refill > 80 && phases.first.refill < 100 && phases.first.full === 100,
      'emptying Phase 1 should refill the single Phase 2 bar during the blocked power-up');
    expect(phases.tuning.transition === 3 && phases.tuning.speed2 === 1.33 &&
      Math.abs(phases.phase2Step - phases.tuning.charge * phases.tuning.speed2 / 120) < 0.01 &&
      Math.abs(phases.phase2Recovery - 1 / phases.tuning.speed2) < 0.02 &&
      phases.phase2Fire.count >= 4 && phases.phase2Fire.life > 2 && phases.phase2Fire.damage === 2 &&
      phases.phase2Fire.hit && phases.core.opened && phases.core.damage === 8,
      'Phase 2 should keep its faster Charge, fire trail and double-damage open core');
    expect(phases.second.pending && phases.second.pendingBlocked && phases.second.phase === 3 &&
      phases.second.event && phases.second.afterCharge && phases.second.held && phases.second.blocked &&
      phases.second.resumed && phases.second.bar.count === 1 && phases.second.bar.value === 0 &&
      phases.second.bar.label.startsWith('Phase 3 ·') && phases.second.refill > 80 &&
      phases.second.refill < 100 && phases.second.full === 100 &&
      Math.abs(phases.pendingStep - phases.tuning.charge * phases.tuning.speed2 / 120) < 0.01,
      'emptying Phase 2 during a Charge should finish it, then refill the single Phase 3 bar through the blocked power-up');
    expect(phases.tuning.speed3 === 1.6 && phases.tuning.damage3 === 1.5 &&
      Math.abs(phases.phase3Step - phases.tuning.charge * phases.tuning.speed3 / 120) < 0.01 &&
      Math.abs(phases.phase3Recovery - 1 / phases.tuning.speed3) < 0.02 &&
      phases.phase3.chargeDamage === 6 && phases.phase3.fireMultiplier === 1.5 &&
      Math.abs(phases.phase3.slagFlight - 0.8 / phases.tuning.speed3) < 0.02 &&
      phases.phase3.slagMultiplier === 1.5 &&
      Math.abs(phases.phase3.waveSpeed - phases.tuning.wave * phases.tuning.speed3) < 0.01 &&
      phases.phase3.waveDamage === 4.5,
      'Phase 3 should scale movement, Charge, Slag, wave, recovery and attack damage');
    expect(phases.steam.warned && phases.steam.tellHeld && phases.steam.started &&
      phases.steam.inside.damage === 4.5 && phases.steam.inside.event &&
      phases.steam.outside.damage === 0 && !phases.steam.outside.event &&
      Math.abs(phases.steam.outside.slide - 4 / 120) < 0.01,
      'Steam spin should hold its 0.5 s tell, slide at 4 m/s, hurt inside the ring and spare a player outside it');
    expect(phases.defeat.killed && phases.defeat.explosion && phases.defeat.cleared && phases.defeat.mode === 'win',
      'defeating the Warden in Phase 3 should still explode and show the win screen');
    await page.waitForFunction(() => !document.getElementById('ov-win').hidden, null, { timeout: 3000 });
    const win = await page.evaluate(() => ({
      title: document.getElementById('win-title').textContent,
      time: document.getElementById('win-time').textContent,
      visible: !document.getElementById('ov-win').hidden,
    }));
    log('Warden win screen', win);
    expect(win.visible && win.title === 'Forge Warden defeated' && /^\d+:\d\d\.\d\d$/.test(win.time), 'the win screen should show after the defeat explosion');
    const bestTime = await page.evaluate(async () => {
      const G = window.__game;
      const { beginPlay } = await import('/src/ui/ui.js');
      const { damageEnt } = await import('/src/enemies/enemies.js');
      const { dispatchEvents } = await import('/src/core/world.js');
      const { store } = await import('/src/core/util.js');
      const oldKey = 'smelter-yard:best:smelter:v3';
      const key = 'smelter-yard:best:smelter:v4';
      const priorOld = store.get(oldKey, null), priorBest = store.get(key, null);
      store.set(oldKey, 5.7); store.set(key, null);
      G.loadLevel('yard'); dispatchEvents();
      G.loadLevel('smelter'); dispatchEvents();
      const legacyIgnored = G.state.best === null && document.getElementById('best-label').textContent === 'No best yet';
      store.set(key, 100);
      G.loadLevel('yard'); dispatchEvents();
      G.loadLevel('smelter'); dispatchEvents();
      const defeat = (time) => {
        const boss = G.ENTS.find((e) => e.kind === 'boss');
        boss.activated = boss.alive = boss.damageable = boss.combatReady = true;
        boss.bossPhase = 3; boss.phaseTwo = boss.phaseThree = true; boss.pendingPhase = 0;
        boss.hp = 1; G.state.time = time; G.state.timing = true;
        damageEnt(boss, 1, boss.x, boss.y + 0.5, boss.z + boss.hz, 0);
        dispatchEvents();
        return { detail: document.getElementById('win-detail').textContent, best: G.state.best, saved: store.get(key, null) };
      };
      beginPlay(true, 'smelter', 3);
      const practice = defeat(5.7);
      beginPlay(true, 'smelter', 0);
      const full = defeat(90);
      store.set(oldKey, priorOld); store.set(key, priorBest);
      return { legacyIgnored, practice, full };
    });
    log('Boss practice best-time guard', bestTime);
    expect(bestTime.legacyIgnored, 'the old v3 best-time value should be ignored');
    expect(bestTime.practice.best === 100 && bestTime.practice.saved === 100 && bestTime.practice.detail.includes('Practice win') && !bestTime.practice.detail.includes('New best') && !bestTime.practice.detail.includes('Best '), 'a quick practice win should neither compare nor replace the full-stage best time');
    expect(bestTime.full.best === 90 && bestTime.full.saved === 90 && bestTime.full.detail.includes('New best time'), 'a full-stage win should still record a new best time');


  },
};
