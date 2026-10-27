// Headless playtest: loads the game, checks for errors, runs combat/enemy/hazard checks,
// then bots that play both levels start to finish with enemies paused. Exits 1 on any failure.
// Run: npm install && npx playwright install chromium && npm test   (screenshots land in tests/shots/)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const page_src = fs.readFileSync(process.env.GAME_FILE || path.join(ROOT, 'index.html'), 'utf8');
// index.html is a full page; a bare fragment (the published artifact format) gets wrapped
const html = /^\s*<!doctype/i.test(page_src) ? page_src : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${page_src}</body></html>`;
// Three.js is served locally so the test needs no network: from node_modules, or THREE_PATH
const threePath = process.env.THREE_PATH || (() => { try { return require.resolve('three/build/three.module.min.js', { paths: [ROOT] }); } catch { return null; } })();
if (!threePath) { console.error('three not found: run npm install, or set THREE_PATH to three.module.min.js (r169)'); process.exit(1); }
const three = fs.readFileSync(threePath, 'utf8');
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://game.local/')) return route.fulfill({ status: 200, contentType: 'text/html', body: html });
    if (url.includes('three@0.169.0/build/three.module.min.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: three });
    return route.abort();
  });
  await page.goto('http://game.local/index.html');
  await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '01-start.png') });

  // --- combat, enemy and hazard checks (pure simulation; mode 'bot' keeps the render loop from stepping) ---
  const checks = await page.evaluate(() => {
    const G = window.__game; G.loadLevel('yard');
    const { p, input, cam, state, step, placeAt, STEP, ENTS, SHOTS, CAPSULES, tuning, restartCourse, MP1, MP2, CRUSHERS } = G;
    const out = {};
    const run = (sec, each) => { for (let t = 0; t < sec; t += STEP) { if (each) each(t); step(STEP); } };
    const press = () => { input.fireQueued = true; input.fireHeld = true; step(STEP); input.fireHeld = false; };
    const only = (...keep) => { for (const e of ENTS) if (!keep.includes(e)) { e.alive = false; e.timer = 1e9; } };
    const fresh = (...keep) => { state.mode = 'bot'; restartCourse(); tuning.enemiesFire = true; state.noEnemies = false; only(...keep); };

    // shots on a dummy
    const d2 = ENTS[1]; fresh(d2);
    placeAt({ x: -4, y: 0, z: 2.5 + tuning.camShoulder }); cam.yaw = Math.PI / 2; cam.pitch = 0; run(0.2);
    press(); run(0.35); const one = d2.hp;
    press(); run(0.35); press(); run(0.35);
    out.shots = { afterOne: one, killedAfterThree: !d2.alive };
    cam.pitch = 0.6; let maxLemons = 0;
    for (let i = 0; i < 6; i++) { press(); maxLemons = Math.max(maxLemons, SHOTS.filter((s) => s.level === 0).length); run(0.02); }
    out.shots.lemonsOutFrom6Taps = maxLemons;
    // full charge
    const d1 = ENTS[0]; fresh(d1);
    placeAt({ x: -4, y: 0, z: 6 + tuning.camShoulder }); cam.yaw = Math.PI / 2; cam.pitch = 0; run(0.2);
    let maxLevel = -1;
    input.fireQueued = true; input.fireHeld = true; run(tuning.chargeTime2 + 0.1); input.fireHeld = false;
    run(0.5, () => { for (const s of SHOTS) maxLevel = Math.max(maxLevel, s.level); });
    out.charge = { maxLevel, dummyDestroyed: !d1.alive };

    // turret hits, knockback, knockout and revive
    const tur = ENTS[5]; fresh(tur);
    placeAt({ x: 3, y: 0, z: -9.5 }); cam.yaw = 0;
    let hits = 0, prev = p.hp, firstKnock = 0;
    run(5, () => { if (p.hp < prev) { hits++; if (!firstKnock) firstKnock = +Math.hypot(p.vx, p.vz).toFixed(2); } prev = p.hp; });
    out.turret = { hits, hpAfter5s: p.hp, firstKnock };
    placeAt({ x: 3, y: 0, z: -9.5 }); p.hp = 2;
    let died = false, revived = false;
    run(6, () => { if (p.dead > 0) died = true; else if (died) revived = true; });
    out.turretKO = { died, revived, hp: p.hp, backAtStart: Math.abs(p.z - 8) < 0.5 };

    // walker: patrols the same way every time and turns at both ends
    const wk = ENTS[7];
    const trace = () => { fresh(wk); placeAt({ x: 10, y: 0, z: 9 }); const xs = []; let flips = 0, lastDir = wk.dir; run(20, (t) => { if (Math.round(t / STEP) % 60 === 0) xs.push(+wk.x.toFixed(4)); if (wk.dir !== lastDir) { flips++; lastDir = wk.dir; } }); return { xs, flips }; };
    const a = trace(), b = trace();
    out.walker = { repeatable: JSON.stringify(a.xs) === JSON.stringify(b.xs), flips: a.flips, minX: Math.min(...a.xs), maxX: Math.max(...a.xs), stuck: new Set(a.xs).size < 10 };
    // walker contact damage
    fresh(wk); placeAt({ x: 1.5, y: 0, z: -1.2 }); const hp0 = p.hp;
    run(3, () => { input.moveX = 0; });
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

    // spikes: a quarter of your health and back to the checkpoint, unless you're still flashing
    fresh(); placeAt({ x: 0, y: 1.6, z: -4.5 }); run(1.6);
    out.spikes = { hp: p.hp, lives: state.lives, backAtStart: Math.abs(p.z - 8) < 0.01 };
    fresh(); placeAt({ x: 0, y: 1.6, z: -4.5 }, 3); run(0.6);
    out.spikes.survivesWhileFlashing = p.hp === G.MAX_HP && state.spikeHits === 0;

    // crusher: slam on top of you = knockout; safe zone = fine
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

    // lava: game over, no checkpoint, then a restart puts you back at the start with full health
    // lava: a quarter of your health and back to the checkpoint; at 0 health it costs a life; the last life ends the run
    fresh(); state.cp = 1; placeAt({ x: 0, y: 0, z: -11.5 }); p.hp = 10; run(2.5);
    out.lives = { lavaHp: p.hp, livesAfterLava: state.lives, backAtCheckpoint: Math.abs(p.z - G.CHECKPOINTS[1].z) < 0.01 && p.dead <= 0 };
    fresh(); state.cp = 1; placeAt({ x: 0, y: 0, z: -11.5 }); p.hp = 3; run(3);
    out.lives.lowHpLavaCostsLife = state.lives === tuning.lives - 1 && p.hp === G.MAX_HP;
    fresh(); placeAt({ x: 3, y: 0, z: -9.5 }); state.lives = 1; p.hp = 1; ENTS[5].alive = true; ENTS[5].timer = 0; run(4);
    out.lives.lastKoGameOver = state.mode === 'over';
    fresh(); state.lives = 1; placeAt({ x: 0, y: 0, z: -11.5 }); p.hp = 4; run(2);
    out.lives.lastFallGameOver = state.mode === 'over';
    restartCourse(); out.lives.restartResets = state.cp === 0 && state.lives === tuning.lives && Math.abs(p.z - 8) < 0.01 && p.hp === G.MAX_HP;
    fresh(); for (const e of ENTS) { e.alive = true; e.timer = 0; } restartCourse(); state.mode = 'start';
    return out;
  });
  console.log('checks', JSON.stringify(checks));

  // --- course bot: enemies frozen so this checks the layout, platforms and crushers ---
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
  console.log('bot', JSON.stringify(bot));

  // --- Smelter Yard: layout checks and a full run to the boss door (enemies frozen) ---
  const schecks = await page.evaluate(() => {
    const G = window.__game; G.loadLevel('smelter');
    const { p, input, cam, state, step, placeAt, STEP, LEVEL, ENTS, tuning } = G;
    const out = { checkpoints: LEVEL.cpCount, ents: ENTS.length, crushers: G.CRUSHERS.length };
    const run = (sec) => { for (let t = 0; t < sec; t += STEP) step(STEP); };
    state.mode = 'bot'; G.restartCourse(); state.noEnemies = true;
    placeAt({ x: -2, y: 25, z: -158 }); run(0.05); const x0 = p.x; run(0.5);
    out.belt = { pushed: +(p.x - x0).toFixed(2), grounded: p.grounded };
    run(2); out.belt.offEdgeIsLava = state.falls === 1;
    G.restartCourse(); state.noEnemies = true;
    placeAt({ x: 0, y: 25, z: -158 }); Object.assign(input, { moveX: -0.467, moveY: 0 }); run(2);
    out.belt.leanHolds = Math.abs(p.x) < 0.2; Object.assign(input, { moveX: 0, moveY: 0 });
    // platform cycle lines up: A far end with B centred, C lowest on B's next centre pass
    const { MPA, MPB, MPC } = LEVEL.named;
    const at = (t) => { state.worldT = t; step(STEP); };
    G.restartCourse(); at(2.5 - STEP); out.cycle = { aFar: +MPA.cz.toFixed(2) }; at(2.95 - STEP); out.cycle.bMid = +MPB.cx.toFixed(2); at(5.6 - STEP); out.cycle.cLowTop = +MPC.max[1].toFixed(2);
    // walking into the boss door clears the stage
    G.restartCourse(); state.noEnemies = true; state.cp = 3; placeAt({ x: 0, y: 28, z: -209 }); input.moveY = 1; run(1.5); input.moveY = 0;
    out.door = { cleared: state.cleared, z: +p.z.toFixed(2) };
    G.restartCourse(); state.mode = 'start'; state.noEnemies = false;
    return out;
  });
  console.log('smelter checks', JSON.stringify(schecks));

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
    if (!until(() => state.cleared, 6, center)) return fail('boss door');
    if (state.cp !== 3) return fail('checkpoint 3');
    log.push(`boss door t=${t.toFixed(1)} timer=${state.time.toFixed(1)} falls=${state.falls} kos=${state.kos} spikes=${state.spikeHits}`);
    return done({ ok: true, log });
  });
  console.log('smelter bot', JSON.stringify(sbot));

  // --- visuals ---
  const scene = async (name, src, wait = 700) => {
    await page.evaluate((s) => {
      for (const id of ['ov-start', 'ov-pause', 'ov-clear', 'ov-over']) document.getElementById(id).hidden = true;
      window.__game.state.mode = 'bot';
      new Function('G', s)(window.__game);
    }, src);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, name) });
  };
  await scene('02-yard-enemies.png', `G.loadLevel('yard'); G.state.noEnemies = false; G.placeAt({ x: 0, y: 0, z: 6 }); G.cam.yaw = 0.25; G.cam.pitch = -0.12; for (let i = 0; i < 240; i++) G.step(G.STEP);`);
  await scene('03-flyer-swoop.png', `G.loadLevel('yard'); G.placeAt({ x: 1, y: 0, z: -2 }); G.cam.yaw = -0.9; G.cam.pitch = 0.05; for (let i = 0; i < 400 && G.ENTS[8].st !== 'swoop'; i++) G.step(G.STEP); for (let i = 0; i < 6; i++) G.step(G.STEP);`, 120);
  await scene('04-platforms.png', `G.loadLevel('yard'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 11, z: -86 }); G.cam.yaw = 0; G.cam.pitch = -0.12; for (let i = 0; i < 200; i++) G.step(G.STEP);`);
  await scene('05-crushers.png', `G.loadLevel('yard'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 11, z: -104.2 }); G.cam.yaw = 0.15; G.cam.pitch = 0.08; G.state.worldT = 1.6; for (let i = 0; i < 30; i++) G.step(G.STEP);`, 150);
  await scene('06-t1-walker.png', `G.loadLevel('yard'); G.state.noEnemies = false; G.placeAt({ x: 0, y: 11, z: -57.8 }); G.cam.yaw = 0; G.cam.pitch = -0.15; for (let i = 0; i < 120; i++) G.step(G.STEP);`);

  await scene('10-smelter-start.png', `G.loadLevel('smelter'); G.state.noEnemies = false; G.placeAt({ x: 0, y: 0, z: 6 }); G.cam.yaw = 0; G.cam.pitch = -0.1; for (let i = 0; i < 120; i++) G.step(G.STEP);`);
  await scene('11-smelter-turret.png', `G.loadLevel('smelter'); G.state.noEnemies = false; G.placeAt({ x: -1, y: 0, z: -19 }); G.cam.yaw = -0.6; G.cam.pitch = 0.02; for (let i = 0; i < 90; i++) G.step(G.STEP);`);
  await scene('12-shaft.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 1.6, z: -69 }); G.cam.yaw = 0; G.cam.pitch = 0.45; for (let i = 0; i < 60; i++) G.step(G.STEP);`);
  await scene('13-chimney.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 10.4, z: -80.2 }); G.cam.yaw = 0; G.cam.pitch = 0.55; for (let i = 0; i < 60; i++) G.step(G.STEP);`);
  await scene('14-crusher-hall.png', `G.loadLevel('smelter'); G.state.noEnemies = false; G.state.cp = 1; G.placeAt({ x: 0, y: 25, z: -93.5 }); G.cam.yaw = 0; G.cam.pitch = 0.02; G.state.worldT = 1.2; for (let i = 0; i < 40; i++) G.step(G.STEP);`, 200);
  await scene('15-belt.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 2; G.placeAt({ x: 0, y: 25, z: -147 }); G.cam.yaw = 0; G.cam.pitch = -0.12; for (let i = 0; i < 30; i++) G.step(G.STEP);`);
  await scene('16-platforms.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 2; G.placeAt({ x: -1.5, y: 25, z: -165 }); G.cam.yaw = 0.1; G.cam.pitch = -0.05; G.state.worldT = 3.2; for (let i = 0; i < 20; i++) G.step(G.STEP);`);
  await scene('17-boss-door.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 3; G.placeAt({ x: 0, y: 28, z: -194 }); G.cam.yaw = 0; G.cam.pitch = 0.12; for (let i = 0; i < 60; i++) G.step(G.STEP);`);
  await scene('18-smelter-clear.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 3; G.state.timing = true; G.state.time = 201.3; G.placeAt({ x: 0, y: 28, z: -211 }); G.input.moveY = 1; for (let i = 0; i < 120; i++) G.step(G.STEP); G.input.moveY = 0;`, 1100);
  await scene('08-gameover.png', `G.loadLevel('yard'); G.state.noEnemies = true; G.state.lives = 1; G.placeAt({ x: 0, y: 0, z: -11.5 }); G.p.hp = 4; for (let i = 0; i < 300; i++) G.step(G.STEP);`, 1700);
  await scene('09-hud-lives.png', `G.loadLevel('yard'); G.state.lives = 2; G.placeAt({ x: 0, y: 0, z: 6 }); G.p.hp = 9;`, 300);
  // real input path
  const live = await (async () => {
    await page.evaluate(() => { const G = window.__game; G.state.noEnemies = false; G.restartCourse(); G.state.mode = 'start'; document.getElementById('ov-start').hidden = false; });
    await page.click('#btn-start');
    await page.waitForTimeout(200);
    await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
    const before = await page.evaluate(() => window.__game.state.shotsFired);
    await page.keyboard.press('KeyF'); await page.waitForTimeout(250);
    const shots = (await page.evaluate(() => window.__game.state.shotsFired)) - before;
    await page.keyboard.up('KeyW');
    const after = await page.evaluate(() => { const G = window.__game; return { z: +G.p.z.toFixed(2), mode: G.state.mode }; });
    await page.evaluate(() => document.exitPointerLock()); await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, '07-live.png') });
    return { shots, after };
  })();
  console.log('live', JSON.stringify(live));
  await page.setViewportSize({ width: 390, height: 800 });
  await page.waitForTimeout(300);
  console.log('phone horizontal overflow:', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
  console.log('errors', JSON.stringify(errors));
  await browser.close();

  // verdict
  const fails = [];
  const expect = (cond, what) => { if (!cond) fails.push(what); };
  expect(bot.ok, 'Test Yard bot did not reach the goal');
  expect(sbot.ok, 'Smelter Yard bot did not reach the boss door');
  expect(!errors.some((e) => e.startsWith('pageerror')), 'page threw an error');
  expect(checks.shots.killedAfterThree && checks.charge.maxLevel === 2, 'shooting or charge broken');
  expect(checks.turretKO.died && checks.turretKO.revived, 'knockout or revive broken');
  expect(checks.walker.repeatable && !checks.walker.stuck && checks.walker.destroyedBy3Shots, 'walker broken');
  expect(checks.flyer.states === 'hover>tele>swoop>return' && checks.flyer.backHome, 'flyer broken');
  expect(checks.spikes.hp === 12 && checks.spikes.backAtStart, 'spikes broken');
  expect(checks.crusher.koUnderSlam && checks.crusher.safeBetween && checks.crusher.blocksWhenDown, 'crusher broken');
  expect(checks.platforms.mp1Carry && checks.platforms.mp2Carry, 'platform riding broken');
  expect(Object.values(checks.lives).every((v) => v === true || typeof v === 'number'), 'lives checks broken');
  expect(checks.lives.backAtCheckpoint && checks.lives.lowHpLavaCostsLife && checks.lives.lastKoGameOver && checks.lives.lastFallGameOver && checks.lives.restartResets, 'lives rules broken');
  expect(schecks.belt.grounded && Math.abs(schecks.belt.pushed - 1.75) < 0.1 && schecks.belt.offEdgeIsLava && schecks.belt.leanHolds, 'conveyor belt broken');
  expect(schecks.door.cleared, 'boss door does not end the stage');
  expect(live.shots === 1 && live.after.mode === 'play', 'real keyboard input broken');
  console.log(fails.length ? `FAIL\n- ${fails.join('\n- ')}` : 'PASS');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
