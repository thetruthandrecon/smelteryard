// Enemies behave the same way every time: turret fire, walker patrol and contact damage, flyer swoop.
module.exports = {
  name: 'Enemies: turret, walker, flyer',
  owner: 'Codex (enemies)',
  async run({ page, expect, log }) {
    const r = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('yard');
      const { p, cam, state, placeAt, ENTS, SHOTS, STEP, tuning } = G; const { run, press, fresh } = window.__t;
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
      state.cp = 3; state.started = true; placeAt({ x: 0, y: 28, z: -211.2 }); G.step(STEP);
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
      const slagTargets = ESHOTS.filter((s) => s.kind === 'slag').map((s) => ({ x: s.targetX, z: s.targetZ }));
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
      return !document.getElementById('boss-hud').hidden && track && track.getAttribute('aria-valuenow') === '97';
    }, null, { timeout: 3000 });
    const bossHealthBar = await page.evaluate(() => ({ value: document.querySelector('.boss-track').getAttribute('aria-valuenow'), label: document.getElementById('boss-health-label').textContent }));
    log('boss health bar after hit', bossHealthBar);
    expect(r.turret.hits >= 1 && r.turret.firstKnock > 0, 'the turret should hit and knock back a player standing in front of it');
    expect(r.walker.repeatable && !r.walker.stuck && r.walker.flips >= 2, 'the walker should patrol the same way every time and turn at both ends');
    expect(r.walker.contactDamage > 0, 'touching a walker should hurt');
    expect(r.walker.destroyedBy3Shots && r.walker.respawnedHome, 'a walker should die to 3 shots and respawn at home');
    expect(r.flyer.states === 'hover>tele>swoop>return' && r.flyer.hurtPlayer && r.flyer.backHome, 'the flyer should hover, telegraph, swoop, hit, and return home');
    expect(r.bossBlockedShot.hp === 100 && r.bossBlockedShot.impact && r.bossBlockedShot.shotRemoved, 'an intro-blocked boss shot should spark and stop without damaging the boss');
    expect(r.bossReady.activated && r.bossReady.combatReady && r.bossReady.damageable && r.bossDamage.hp === 99 && r.bossDamage.impact, 'the Warden should become damageable at full intro and show impacts while losing health');
    expect(r.bossContactDamage === 3, 'touching the Warden should deal 3 HP contact damage');
    expect(r.bossCharge.warned && r.bossCharge.linedUpDuringTell && r.bossCharge.alignedX === 2.5 && r.bossCharge.started && r.bossCharge.laneLocked && r.bossCharge.frontReached && r.bossCharge.reverseChargeStarted && r.bossCharge.fullCross && r.bossCharge.damage === 4 && r.bossCharge.speed === 18 && r.bossCharge.lane === 25.8 && r.bossCharge.frontZ === -218 && r.bossCharge.backZ === -243.8, 'the Warden should track the player during its tell, lock the lane, and Charge across the full arena for 4 HP at 18 m/s');
    expect(r.bossCoreHit.damage === 1.5 && r.bossCoreHit.weakspot && r.bossBodyHit.damage === 1 && !r.bossBodyHit.weakspot, 'a chest-core hit should deal 1.5x the damage of an otherwise identical body hit');
    expect(r.slagDamageSliders.blob === 3 && r.slagDamageSliders.fire === 2, 'the Slag blob and fire damage sliders should default to 3 HP and 2 HP');
    expect(r.bossSlagVolley.warned && r.bossSlagVolley.tellHeld && r.bossSlagVolley.count === 3 && JSON.stringify(r.bossSlagVolley.targetXs) === JSON.stringify([-1.5, 0.5, 2.5]) && r.bossSlagVolley.targetZs.every((z) => z === -223) && r.bossSlagVolley.nextAttack === 'charge', 'the Warden should hold the Slag tell, lob three blobs 2 m apart around the player, and alternate back to Charge');
    expect(!r.bossSlagLandings.early && r.bossSlagLandings.count === 3 && r.bossSlagFireHit.damage === 3 && r.bossSlagFireHit.hp === 13 && r.bossSlagFireHit.effect && r.bossSlagExpired, 'Slag blobs should take about 0.8 s to land, leave three-second fire patches, and deal scaled 2 HP touch damage through hurt()');
    expect(r.bossSlagBlobHit.damage === 4.5 && r.bossSlagBlobHit.hp === 11.5 && r.bossSlagBlobHit.impact && r.bossSlagBlobHit.knockedBack, 'a Slag blob should deal scaled 3 HP damage and apply normal knockback');
    expect(r.bossCharge.nextAttackAfterCharge === 'slag', 'the Warden should alternate to Slag after a Charge');
    expect(bossHealthBar.value === '97' && bossHealthBar.label === '97%', 'the boss health bar should show health lost to body and core hits');
  },
};
