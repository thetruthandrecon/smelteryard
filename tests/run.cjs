// Automated playtest. Loads the game in headless Chromium, then runs every suite in tests/suites/
// in file-name order and prints a verdict per suite. Exits 1 if anything failed.
// Run: npm install && npx playwright install chromium && npm test   (screenshots land in tests/shots/)
//
// Each suite belongs to one lane (see AGENTS.md) and exports { name, owner, run(ctx) }, where ctx has:
//   page            the Playwright page
//   expect(ok, why) record a failure unless ok
//   log(label, v)   print a value
//   shot(file, js, waitMs)  hide overlays, run js with G = window.__game, wait, save tests/shots/file
//   OUT             the screenshot folder
// Inside the page, window.__game is the game's test hook and window.__t has helpers:
//   run(seconds, eachStep?)  step the simulation;  press()  tap fire for one step
//   fresh(...enemies)        restart the level, enemies attacking, every other enemy removed
//   only(...enemies)         remove every enemy except these
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
// Three.js is served locally so the test needs no network: from node_modules, or THREE_PATH
const threePath = process.env.THREE_PATH || [path.join(ROOT, 'node_modules/three/build/three.module.min.js')].find((f) => fs.existsSync(f));
if (!threePath) { console.error('three not found: run npm install, or set THREE_PATH to three.module.min.js (r169)'); process.exit(1); }
const three = fs.readFileSync(threePath, 'utf8');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
// the game is served from the repo as http://game.local/...
function serveRepo(route, url) {
  const rel = decodeURIComponent(new URL(url).pathname).replace(/^\/+/, '') || 'index.html';
  const file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: 'not found' });
  return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
}
const OUT = path.join(__dirname, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2); // optional: run only suites whose file name contains one of these words
const SUITES = fs.readdirSync(path.join(__dirname, 'suites')).filter((f) => f.endsWith('.cjs')).sort()
  .filter((f) => !only.length || only.some((w) => f.includes(w)));

(async () => {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith('http://game.local/')) return serveRepo(route, url);
    if (url.includes('three@0.169.0/build/three.module.min.js')) return route.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: three });
    return route.abort(); // fonts and anything else external: not needed for the test
  });
  await page.goto('http://game.local/index.html');
  try { await page.waitForFunction(() => !!window.__game, null, { timeout: 20000 }); }
  catch { console.log('FAIL: the game did not start\n- ' + errors.join('\n- ')); await browser.close(); process.exit(1); }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, '01-start.png') });

  await page.evaluate(() => {
    const G = window.__game;
    const run = (sec, each) => { for (let t = 0; t < sec; t += G.STEP) { if (each) each(t); G.step(G.STEP); } };
    const press = () => { G.input.fireQueued = true; G.input.fireHeld = true; G.step(G.STEP); G.input.fireHeld = false; };
    const only = (...keep) => { for (const e of G.ENTS) if (!keep.includes(e)) { e.alive = false; e.timer = 1e9; } };
    const fresh = (...keep) => { G.state.mode = 'bot'; G.restartCourse(); G.tuning.enemiesFire = true; G.state.noEnemies = false; only(...keep); };
    window.__t = { run, press, only, fresh };
  });
  // put the game back to a clean start screen between suites
  const reset = () => page.evaluate(() => {
    const G = window.__game;
    Object.assign(G.input, { moveX: 0, moveY: 0, jumpHeld: false, dashHeld: false, jumpQueued: false, dashQueued: false, fireHeld: false, fireQueued: false });
    G.state.noEnemies = false; G.tuning.enemiesFire = true;
    for (const e of G.ENTS) { e.alive = true; e.timer = 0; }
    G.restartCourse(); G.state.mode = 'start';
  });
  const shot = async (name, src, wait = 700) => {
    await page.evaluate((s) => {
      for (const id of ['ov-start', 'ov-pause', 'ov-clear', 'ov-over']) document.getElementById(id).hidden = true;
      window.__game.state.mode = 'bot';
      new Function('G', s)(window.__game);
    }, src);
    await page.waitForTimeout(wait);
    await page.screenshot({ path: path.join(OUT, name) });
  };

  const results = [];
  for (const file of SUITES) {
    const suite = require(path.join(__dirname, 'suites', file));
    const fails = [];
    const expect = (ok, why) => { if (!ok) fails.push(why); };
    const log = (label, v) => console.log(`  ${label}: ${JSON.stringify(v)}`);
    console.log(`${suite.name} (${suite.owner})`);
    const t0 = Date.now();
    try { await suite.run({ page, expect, log, shot, OUT }); } catch (e) { fails.push(`crashed: ${String(e.message || e).split('\n')[0]}`); }
    results.push({ file, name: suite.name, owner: suite.owner, fails, secs: ((Date.now() - t0) / 1000).toFixed(1) });
    await reset().catch(() => {});
  }
  // a failed font download is expected here (the test blocks the network); anything else is a real error
  const realErrors = errors.filter((e) => !e.includes('net::ERR_FAILED'));
  results.push({ file: '-', name: 'No errors in the browser console', owner: 'everyone', fails: realErrors, secs: '-' });
  await browser.close();

  console.log('\nVerdict');
  for (const r of results) {
    console.log(`  ${r.fails.length ? 'FAIL' : 'pass'}  ${r.name}  [${r.owner}]  ${r.secs}s`);
    for (const f of r.fails) console.log(`          - ${f}`);
  }
  const failed = results.filter((r) => r.fails.length).length;
  console.log(failed ? `\nFAIL (${failed} of ${results.length})` : '\nPASS');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
