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
      const shot = (z, level = 0) => SHOTS.push({ x: 0, y: 30, z, vx: 0, vy: 0, vz: -45, level, life: 1.6, hit: new Set() });
      let eventStart = G.events.length;
      shot(-237); run(0.2);
      out.bossBlockedShot = { hp: boss.hp, impact: G.events.slice(eventStart).some((e) => e.type === 'hit' && e.blocked), shotRemoved: SHOTS.length === 0 };
      run(3.1);
      out.bossReady = { activated: boss.activated, combatReady: boss.combatReady, damageable: boss.damageable };
      eventStart = G.events.length;
      shot(-223); run(0.6);
      out.bossDamage = { hp: boss.hp, impact: G.events.slice(eventStart).some((e) => e.type === 'hit' && !e.blocked) };

      // touching the Warden hurts, and the half-second Charge warning precedes its ram
      boss.st = 'idle'; boss.cd = 100; state.noEnemies = false;
      placeAt({ x: boss.x, y: boss.y, z: boss.z }); p.iframes = 0; p.hp = 16; G.step(STEP);
      out.bossContactDamage = 16 - p.hp;
      boss.st = 'idle'; boss.cd = 0; boss.chargeDirZ = 0; p.iframes = 0; p.hp = 16;
      placeAt({ x: 0, y: boss.y, z: boss.z + 5 });
      eventStart = G.events.length; G.step(STEP);
      const bossWarned = G.events.slice(eventStart).some((e) => e.type === 'bosstelegraph' && e.attack === 'charge');
      run(0.51);
      const chargeStarted = boss.st === 'charge';
      run(0.4);
      out.bossCharge = { warned: bossWarned, started: chargeStarted, damage: 16 - p.hp, speed: boss.chargeSpeed, lane: Math.abs(boss.chargeFrontZ - boss.chargeBackZ) };
      return out;
    });
    log('enemies', r);
    await page.waitForFunction(() => {
      const track = document.querySelector('.boss-track');
      return !document.getElementById('boss-hud').hidden && track && track.getAttribute('aria-valuenow') === '99';
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
    expect(r.bossCharge.warned && r.bossCharge.started && r.bossCharge.damage === 4 && r.bossCharge.speed === 18 && r.bossCharge.lane === 18, 'the Warden should give a Charge tell, then ram for 4 HP at 18 m/s across an 18 m lane');
    expect(bossHealthBar.value === '99' && bossHealthBar.label === '99%', 'the boss health bar should show health lost to a shot');
  },
};
