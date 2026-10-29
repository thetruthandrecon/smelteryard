// Screenshots of key scenes for a human to look at (tests/shots/). Fails only if a scene throws.
module.exports = {
  name: 'Screens: screenshots of key scenes',
  owner: 'Codex (UI)',
  async run({ shot, page, expect, log }) {
    await shot('02-yard-enemies.png', `G.loadLevel('yard'); G.state.noEnemies = false; G.placeAt({ x: 0, y: 0, z: 6 }); G.cam.yaw = 0.25; G.cam.pitch = -0.12; for (let i = 0; i < 240; i++) G.step(G.STEP);`);
    await shot('03-flyer-swoop.png', `G.loadLevel('yard'); G.placeAt({ x: 1, y: 0, z: -2 }); G.cam.yaw = -0.9; G.cam.pitch = 0.05; for (let i = 0; i < 400 && G.ENTS[8].st !== 'swoop'; i++) G.step(G.STEP); for (let i = 0; i < 6; i++) G.step(G.STEP);`, 120);
    await shot('04-platforms.png', `G.loadLevel('yard'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 11, z: -86 }); G.cam.yaw = 0; G.cam.pitch = -0.12; for (let i = 0; i < 200; i++) G.step(G.STEP);`);
    await shot('05-crushers.png', `G.loadLevel('yard'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 11, z: -104.2 }); G.cam.yaw = 0.15; G.cam.pitch = 0.08; G.state.worldT = 1.6; for (let i = 0; i < 30; i++) G.step(G.STEP);`, 150);
    await shot('06-t1-walker.png', `G.loadLevel('yard'); G.state.noEnemies = false; G.placeAt({ x: 0, y: 11, z: -57.8 }); G.cam.yaw = 0; G.cam.pitch = -0.15; for (let i = 0; i < 120; i++) G.step(G.STEP);`);
    await shot('10-smelter-start.png', `G.loadLevel('smelter'); G.state.noEnemies = false; G.placeAt({ x: 0, y: 0, z: 6 }); G.cam.yaw = 0; G.cam.pitch = -0.1; for (let i = 0; i < 120; i++) G.step(G.STEP);`);
    await shot('11-smelter-turret.png', `G.loadLevel('smelter'); G.state.noEnemies = false; G.placeAt({ x: -1, y: 0, z: -19 }); G.cam.yaw = -0.6; G.cam.pitch = 0.02; for (let i = 0; i < 90; i++) G.step(G.STEP);`);
    await shot('12-shaft.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 1.6, z: -69 }); G.cam.yaw = 0; G.cam.pitch = 0.45; for (let i = 0; i < 60; i++) G.step(G.STEP);`);
    await shot('13-chimney.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.placeAt({ x: 0, y: 10.4, z: -80.2 }); G.cam.yaw = 0; G.cam.pitch = 0.55; for (let i = 0; i < 60; i++) G.step(G.STEP);`);
    await shot('14-crusher-hall.png', `G.loadLevel('smelter'); G.state.noEnemies = false; G.state.cp = 1; G.placeAt({ x: 0, y: 25, z: -93.5 }); G.cam.yaw = 0; G.cam.pitch = 0.02; G.state.worldT = 1.2; for (let i = 0; i < 40; i++) G.step(G.STEP);`, 200);
    await shot('15-belt.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 2; G.placeAt({ x: 0, y: 25, z: -147 }); G.cam.yaw = 0; G.cam.pitch = -0.12; for (let i = 0; i < 30; i++) G.step(G.STEP);`);
    await shot('16-platforms.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 2; G.placeAt({ x: -1.5, y: 25, z: -165 }); G.cam.yaw = 0.1; G.cam.pitch = -0.05; G.state.worldT = 3.2; for (let i = 0; i < 20; i++) G.step(G.STEP);`);
    await shot('17-boss-door.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 3; G.placeAt({ x: 0, y: 28, z: -194 }); G.cam.yaw = 0; G.cam.pitch = 0.12; for (let i = 0; i < 60; i++) G.step(G.STEP);`);
    await shot('18-boss-arena.png', `G.loadLevel('smelter'); G.state.noEnemies = true; G.state.cp = 3; G.placeAt({ x: 0, y: 28, z: -212.3 }); G.cam.yaw = 0; G.cam.pitch = 0.08; const door = G.LEVEL.named.bossDoor; door.triggered = true; door.open = 0.62; door.min[1] += 5.2 * door.open; door.max[1] += 5.2 * door.open; const boss = G.ENTS.find((e) => e.kind === 'boss'); boss.alive = true; boss.activated = true; boss.st = 'enter'; boss.introProgress = 0.62; boss.z = -234; boss.yaw = Math.PI;`, 800);
    await shot('08-gameover.png', `G.loadLevel('yard'); G.state.noEnemies = true; G.state.lives = 1; G.placeAt({ x: 0, y: 0, z: -11.5 }); G.p.hp = 4; for (let i = 0; i < 300; i++) G.step(G.STEP);`, 1700);
    await shot('09-hud-lives.png', `G.loadLevel('yard'); G.state.lives = 2; G.placeAt({ x: 0, y: 0, z: 6 }); G.p.hp = 9;`, 300);
    const lockMark = await page.evaluate(async () => {
      const G = window.__game;
      G.loadLevel('smelter');
      const [{ lockView }, { updateHud }] = await Promise.all([
        import('/src/combat/shots.js'),
        import('/src/ui/ui.js'),
      ]);
      const reticle = document.getElementById('reticle');
      lockView.target = G.ENTS.find((e) => e.kind === 'boss');
      updateHud(0);
      const shown = reticle.classList.contains('locked') && getComputedStyle(reticle, '::before').content !== 'none';
      lockView.target = null;
      updateHud(0);
      const cleared = !reticle.classList.contains('locked') && getComputedStyle(reticle, '::before').content === 'none';
      return { shown, cleared };
    });
    log('Lock-on reticle mark', lockMark);
    expect(lockMark.shown && lockMark.cleared, 'the reticle should show its lock mark only while lockView.target is set');
  },
};
