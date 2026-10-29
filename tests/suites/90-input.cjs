// The real input path: click Start, hold W, tap F, using the browser's own keyboard events.
const path = require('path');
module.exports = {
  name: 'Input: keyboard and start button',
  owner: 'Claude (player)',
  async run({ page, expect, log, OUT }) {
    const live = await (async () => {
      await page.evaluate(() => { const G = window.__game; G.state.noEnemies = false; G.restartCourse(); G.state.mode = 'start'; document.getElementById('ov-start').hidden = false; });
      await page.click('#btn-start');
      await page.waitForTimeout(200);
      await page.keyboard.down('KeyW'); await page.waitForTimeout(400);
      // record the level of every shot fired from here on (0 = tap, 1 and 2 = charged)
      await page.evaluate(async () => {
        if (!window.__shotLevels) { const { on } = await import('/src/core/world.js'); window.__shotLevels = []; on('shoot', (e) => window.__shotLevels.push(e.level)); }
        window.__shotLevels.length = 0;
      });
      await page.keyboard.press('KeyF');
      // the headless browser can be slow right after a level loads, so wait for the shot rather than a fixed time
      await page.waitForFunction(() => window.__shotLevels.length > 0, null, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      // on a slow machine the game can see F held down for several frames; holding it 0.45 s or more
      // rightly adds a charged shot on release, so only the tap shots are counted
      const levels = await page.evaluate(() => window.__shotLevels.slice());
      const shots = levels.filter((l) => l === 0).length;
      await page.keyboard.up('KeyW');
      const after = await page.evaluate(() => { const G = window.__game; return { z: +G.p.z.toFixed(2), mode: G.state.mode }; });
      await page.evaluate(() => document.exitPointerLock()); await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, '07-live.png') });
      return { shots, levels, after };
    })();
    log('live input', live);
    expect(live.shots === 1, 'pressing F did not fire exactly one tap shot');
    expect(live.after.mode === 'play' && live.after.z < 6, 'Start did not begin play, or W did not move the player forward');
  },
};
