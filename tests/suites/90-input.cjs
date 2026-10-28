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
      const before = await page.evaluate(() => window.__game.state.shotsFired);
      await page.keyboard.press('KeyF');
      // the headless browser can be slow right after a level loads, so wait for the shot rather than a fixed time
      await page.waitForFunction((b) => window.__game.state.shotsFired > b, before, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      const shots = (await page.evaluate(() => window.__game.state.shotsFired)) - before;
      await page.keyboard.up('KeyW');
      const after = await page.evaluate(() => { const G = window.__game; return { z: +G.p.z.toFixed(2), mode: G.state.mode }; });
      await page.evaluate(() => document.exitPointerLock()); await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, '07-live.png') });
      return { shots, after };
    })();
    log('live input', live);
    expect(live.shots === 1, 'pressing F did not fire exactly one shot');
    expect(live.after.mode === 'play' && live.after.z < 6, 'Start did not begin play, or W did not move the player forward');
  },
};
