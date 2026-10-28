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
      out.damage = { level1: charged((tuning.chargeTime1 + tuning.chargeTime2) / 2), level2: charged(tuning.chargeTime2 + 0.1), expect1: 1 + tuning.chargeDamage1, expect2: 1 + tuning.chargeDamage2 };
      return out;
    });
    log('combat', r);
    expect(r.shots.afterOne === 2, 'one tap should do 1 damage to a 3 HP dummy');
    expect(r.shots.killedAfterThree, 'three taps should destroy a dummy');
    expect(r.shots.outFrom6Taps === 6, 'there should be no limit on shots in the air (6 quick taps = 6 shots)');
    expect(r.charge.maxLevel === 2 && r.charge.dummyDestroyed, 'a full charge should fire a level 2 shot that destroys a dummy');
    expect(r.pierce.open.frontHit && r.pierce.open.backHit, 'a full charge should pierce through to a second target');
    expect(r.damage.level1 === r.damage.expect1 && r.damage.level2 === r.damage.expect2, 'charged shots should do the damage set in the tuning panel (level 1 and level 2)');
    expect(r.damage.expect2 - 1 > 8, 'a full charge should beat tapping for the same 1.3 s (about 8 damage)');
    expect(r.pierce.blocked.frontHit && !r.pierce.blocked.backHit, 'a full charge should stop on a target that can\'t be hurt right now (damageable === false)');
  },
};
