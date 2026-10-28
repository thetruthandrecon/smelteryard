// The page fits a phone-width screen without sideways scrolling. Runs last: it resizes the window.
module.exports = {
  name: 'Layout: phone width',
  owner: 'Codex (UI)',
  async run({ page, expect, log }) {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    log('horizontal overflow at 390 px', overflow);
    expect(!overflow, 'the page scrolls sideways at phone width');
  },
};
