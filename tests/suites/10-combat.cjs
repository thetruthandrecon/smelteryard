// Shooting: tap damage, no limit on shots in the air, full charge.
module.exports = {
  name: 'Combat: shots and charge',
  owner: 'Claude (combat)',
  async run({ page, expect, log }) {
    const r = await page.evaluate(() => {
      const G = window.__game; G.loadLevel('yard');
      const { cam, input, placeAt, ENTS, SHOTS, tuning } = G; const { run, press, fresh } = window.__t;
      const out = {};
      // three taps on a shooting-range dummy
      const d2 = ENTS[1]; fresh(d2);
      placeAt({ x: -4, y: 0, z: 2.5 + tuning.camShoulder }); cam.yaw = Math.PI / 2; cam.pitch = 0; run(0.2);
      press(); run(0.35); const one = d2.hp;
      press(); run(0.35); press(); run(0.35);
      out.shots = { afterOne: one, killedAfterThree: !d2.alive };
      cam.pitch = 0.6; let maxOut = 0;
      for (let i = 0; i < 6; i++) { press(); maxOut = Math.max(maxOut, SHOTS.filter((s) => s.level === 0).length); run(0.02); }
      out.shots.outFrom6Taps = maxOut;
      // full charge
      const d1 = ENTS[0]; fresh(d1);
      placeAt({ x: -4, y: 0, z: 6 + tuning.camShoulder }); cam.yaw = Math.PI / 2; cam.pitch = 0; run(0.2);
      let maxLevel = -1;
      input.fireQueued = true; input.fireHeld = true; run(tuning.chargeTime2 + 0.1); input.fireHeld = false;
      run(0.5, () => { for (const s of SHOTS) maxLevel = Math.max(maxLevel, s.level); });
      out.charge = { maxLevel, dummyDestroyed: !d1.alive };
      // a full charge pierces a line of two dummies, but stops on one that can't be hurt right now
      const front = ENTS[1], back = ENTS[3]; // both at x -10.5
      const trial = (blockFront) => {
        fresh(front, back);
        if (blockFront) front.damageable = false;
        placeAt({ x: -10.5 - tuning.camShoulder, y: 0, z: 9 }); cam.yaw = 0; cam.pitch = 0; run(0.2);
        input.fireQueued = true; input.fireHeld = true; run(tuning.chargeTime2 + 0.1); input.fireHeld = false;
        run(0.6);
        const res = { frontHit: front.hp < front.maxHp || !front.alive, backHit: back.hp < back.maxHp || !back.alive };
        delete front.damageable;
        return res;
      };
      out.pierce = { open: trial(false), blocked: trial(true) };
      // damage per charge level, on a dummy with plenty of health (each press also fires a 1-damage tap first)
      const big = ENTS[0];
      const charged = (holdFor) => {
        fresh(big); big.hp = 100;
        placeAt({ x: -4, y: 0, z: 6 + tuning.camShoulder }); cam.yaw = Math.PI / 2; cam.pitch = 0; run(0.2);
        input.fireQueued = true; input.fireHeld = true; run(holdFor); input.fireHeld = false;
        run(0.5);
        return 100 - big.hp;
      };
      // soft lock-on, on a dummy 17.5 m away that opts in with lockOn = true
      const tgt = ENTS[1]; // at x -10.5, z 2.5
      const lockTrial = ({ lockOn, offDeg, dodge = 0, turn }) => {
        fresh(tgt); tgt.lockOn = lockOn; tuning.lockOnTurn = turn ?? 90;
        placeAt({ x: -10.5 - tuning.camShoulder, y: 0, z: 20 }); cam.yaw = offDeg * Math.PI / 180; cam.pitch = 0; run(0.2);
        press(); if (dodge) { tgt.x += dodge; tgt.x0 += dodge; } run(0.8);
        const hit = tgt.hp < tgt.maxHp || !tgt.alive;
        if (dodge) { tgt.x -= dodge; tgt.x0 -= dodge; }
        delete tgt.lockOn; tuning.lockOnTurn = 90;
        return hit;
      };
      out.lock = {
        beside: lockTrial({ lockOn: true, offDeg: 5 }),
        besideNotLockable: lockTrial({ lockOn: false, offDeg: 5 }),
        farOff: lockTrial({ lockOn: true, offDeg: 12 }),
        homing: lockTrial({ lockOn: true, offDeg: 0, dodge: 1.2 }),
        noHoming: lockTrial({ lockOn: true, offDeg: 0, dodge: 1.2, turn: 0 }),
      };
      out.damage = { level1: charged((tuning.chargeTime1 + tuning.chargeTime2) / 2), level2: charged(tuning.chargeTime2 + 0.1), expect1: 1 + tuning.chargeDamage1, expect2: 1 + tuning.chargeDamage2 };
      return out;
    });
    // aiming the real gun at the Warden: shots aimed at its core land on the core (lock-on doesn't bend them off it)
    // and get the core effect; shots aimed at its chest below get the ordinary hit effect
    r.core = await page.evaluate(async () => {
      const { hitFeedback } = await import('/src/combat/shots.js');
      const { dispatchEvents } = await import('/src/core/world.js');
      const G = window.__game; const { state, STEP, placeAt, ENTS, cam, input, tuning } = G; const { run } = window.__t;
      G.loadLevel('smelter'); state.mode = 'bot'; state.noEnemies = true; G.restartCourse();
      state.cp = 3; state.started = true; placeAt({ x: 0, y: 28, z: -211.2 }); G.step(STEP); run(3.2);
      const boss = ENTS.find((e) => e.kind === 'boss');
      const aimAt = (x, y, z) => { for (let i = 0; i < 6; i++) { const a = G.aimRay(); cam.yaw = Math.atan2(a.ox - x, a.oz - z); cam.pitch = Math.atan2(y - a.oy, Math.hypot(x - a.ox, z - a.oz)); } };
      const trial = (dist, offY, hold) => {
        placeAt({ x: boss.x, y: boss.y, z: boss.z + dist }); G.p.iframes = 99; run(0.05);
        aimAt(boss.x - 0.72 * Math.sin(boss.yaw), boss.y + 2.12 + offY, boss.z - 0.72 * Math.cos(boss.yaw));
        dispatchEvents(); const before = { ...hitFeedback }, from = G.events.length;
        input.fireQueued = true; input.fireHeld = true; G.step(STEP); run(hold); input.fireHeld = false; run(0.6);
        const hits = G.events.slice(from).filter((e) => e.type === 'hit' && e.level === (hold ? 2 : 0));
        dispatchEvents();
        return { weakspot: hits.length === 1 && hits[0].weakspot, coreFx: hitFeedback.core - before.core, bodyFx: hitFeedback.body - before.body };
      };
      return { tap: trial(8, 0, 0), tapFar: trial(20, 0, 0), full: trial(8, 0, tuning.chargeTime2 + 0.1), chest: trial(8, -0.8, 0) };
    });
    log('combat', r);
    expect(r.shots.afterOne === 2, 'one tap should do 1 damage to a 3 HP dummy');
    expect(r.shots.killedAfterThree, 'three taps should destroy a dummy');
    expect(r.shots.outFrom6Taps === 6, 'there should be no limit on shots in the air (6 quick taps = 6 shots)');
    expect(r.charge.maxLevel === 2 && r.charge.dummyDestroyed, 'a full charge should fire a level 2 shot that destroys a dummy');
    expect(r.pierce.open.frontHit && r.pierce.open.backHit, 'a full charge should pierce through to a second target');
    expect(r.damage.level1 === r.damage.expect1 && r.damage.level2 === r.damage.expect2, 'charged shots should do the damage set in the tuning panel (level 1 and level 2)');
    expect(r.lock.beside && !r.lock.besideNotLockable, 'soft lock-on: a shot 5° beside a lockable target should hit it, but not an ordinary enemy');
    expect(!r.lock.farOff, 'soft lock-on: a shot 12° off (outside the 7° cone) should miss');
    expect(r.lock.homing && !r.lock.noHoming, 'soft lock-on: a locked shot should follow a target that sidesteps 1.2 m (and miss with homing off)');
    expect(r.damage.expect2 - 1 > 8, 'a full charge should beat tapping for the same 1.3 s (about 8 damage)');
    expect(r.pierce.blocked.frontHit && !r.pierce.blocked.backHit, 'a full charge should stop on a target that can\'t be hurt right now (damageable === false)');
    expect(r.core.tap.weakspot && r.core.tapFar.weakspot && r.core.full.weakspot, 'a shot aimed at the Warden\'s core (tap from 8 m and 20 m, full charge) should hit the core');
    expect(r.core.tap.coreFx === 1 && r.core.tap.bodyFx === 0 && r.core.full.coreFx >= 1, 'a core hit should get the core spark and sound, not the ordinary hit effect');
    expect(!r.core.chest.weakspot && r.core.chest.bodyFx === 1 && r.core.chest.coreFx === 0, 'a shot aimed at the Warden\'s chest below the core should be an ordinary hit');
  },
};
