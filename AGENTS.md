# AGENTS.md

Two AI developers, Claude (Anthropic) and Codex (OpenAI), build this game in one repo. H, the owner, is the only person who merges, playtests and sets direction. The AIs can't talk to each other; this file (rules, architecture) and `TASKS.md` (ownership, status, next steps) are the only channel. Read both before doing anything.

## Game
An original over-the-shoulder 3D action platformer in the spirit of Mega Man X5: run, dash, wall-jump, charge shot, one stage (Smelter Yard), then one boss.
- Own hero, enemies, names and world. No Capcom names, characters, art, music or sounds, even as placeholders.
- H plays in short sessions between work calls and doesn't write code.

## Stack and how to run
- Plain JavaScript ES modules and Three.js r169. There is no build step and no framework.
- **Play:** serve the repo folder over http and open `index.html`; the published link (GitHub Pages) does this. Opening the file straight from disk won't work, because browsers block module imports from `file://`.
- **Test:** `npm install`, then `npx playwright install chromium`, then `npm test`. It must end with `PASS`. Run one suite with `npm test -- levels` (any part of a suite's file name). Screenshots go to `tests/shots/` (not committed).
- **The GitHub check "Playtest"** runs `npm test` on every pull request. If you can't run the tests in your own environment, say so in the PR and point to that check.
- **Publishing.** `.github/workflows/publish.yml` publishes `main` to GitHub Pages on every merge, using `tools/build-site.cjs`.
  - Each version goes in its own folder, `v/<commit>/`, and the published `index.html` reloads itself once if a newer version exists, so a normal refresh always shows the latest.
  - The publisher rewrites two lines of `index.html`: the stylesheet link `href="src/ui/style.css"` and the script line `<script type="module" src="src/main.js"></script>`. Keep both exactly as they are; the Playtest check fails if it can't find them.

## Folder map and lanes
Each lane is a set of files that only its owner edits.

| Folder or file | What lives there | Owner |
|---|---|---|
| `src/player/` | movement (`player.js`), collision (`physics.js`), health and lives (`health.js`), camera (`camera.js`), controls (`input.js`), hero model and animation (`model.js`) | Claude |
| `src/combat/` | aiming, tap shots, charge shots, shot flight and hits (`shots.js`) | Claude |
| `src/enemies/` | enemy kinds and behaviour (`enemies.js`), enemy models (`models.js`); bosses go here too | Codex |
| `src/levels/` | level building blocks (`builders.js`), the levels (`smelter.js`, `test-yard.js`, `index.js`), platforms and crushers (`hazards.js`), checkpoints, goal, lava, capsules (`course.js`), level looks (`visuals.js`) | Codex |
| `src/ui/`, `index.html` markup | HUD, menus, pause, clear and game-over screens, tuning panel, styles | Codex |
| `src/fx/` | particles (`particles.js`), sound building blocks (`audio.js`) | Codex |
| `src/core/`, `src/main.js`, the `<script>` line and stylesheet link in `index.html`, `tests/run.cjs`, `tools/`, `package.json`, `.github/`, this file, `CLAUDE.md`, `README.md` | shared: Three.js import, helpers, tuning registry, world state and events, the step order, rendering setup, entry point, test runner, build and CI | Nobody without H's approval in chat |
| `tests/suites/` | one test file per lane: `10-combat` and `20-player` and `90-input` (Claude); `30-enemies`, `40-levels`, `50-courses`, `80-screens`, `95-layout` (Codex) | per the suite's `owner` |
| `TASKS.md` | the live board | each AI edits only its own section and its own request lines |

Feel belongs with Claude: movement, camera and combat decide how the game feels. Enemies, levels and UI plug into those systems.

If your task needs a change in the other lane, don't edit it. Write the request under "Requests to other AI" in `TASKS.md` and tell H. If it needs a shared file, ask H in chat first and say in the PR that H approved it.

## How the code fits together (read before writing code)
- **The fixed step.** `src/core/sim.js` runs the game 120 times a second in this order:
  1. `updateHazards` (levels)
  2. `updatePlayer` (player; calls `updateFire` in combat)
  3. `updateShots` (combat)
  4. `updateEnemies` (enemies)
  5. `updatePickups` (levels)
  6. `updateCourse` (levels: lava, checkpoints, goal)

  Game logic must be deterministic: no `Math.random()`, `Date` or `performance.now()` inside update functions. The test bots depend on this. Randomness is fine in rendering and effects.
- **Rendering.** Each frame `src/main.js` calls `renderPlayer`, `renderShots`, `renderEnemies`, `renderLevel`, `renderEmbers`, `renderWorld` and `updateHud`. Draw from the simulation state; never change it while rendering.
- **Hooks the core calls.** Keep these names and signatures: `updatePlayer`, `placeAt`, `updateFire`, `updateShots`, `resetShots`, `renderShots`, `updateEnemies`, `resetEnemies`, `renderEnemies`, `buildEnemyVisuals`, `setupLevel`, `updateHazards`, `resetHazards`, `updateCourse`, `updatePickups`, `resetPickups`, `buildLevelVisuals`, `renderLevel`, `markCheckpoints`, `gatherInput`, `updateCamera`, `renderPlayer`, `updateParticles`, `renderEmbers`, `initUI`, `updateHud`, `initTuningPanel`. Grow a feature inside your lane's hook. For example, a boss updates from inside `updateEnemies`, renders from `renderEnemies` and resets in `resetEnemies`. If you truly need a new hook, ask through `TASKS.md`.
- **Events, not direct calls, for effects.**
  - The simulation pushes `events.push({ type: 'jump', ... })`. Any lane reacts with `on('jump', (e) => ...)` from `src/core/world.js`.
  - Put a sound or effect in the lane that owns the event's meaning. Several lanes can react to one event (e.g. `die`: the player lane plays the sound, the UI shows the toast).
  - Current event types are `jump`, `walljump`, `dash`, `airdash`, `land`, `hurt`, `die`, `revive`, `return`, `spikes`, `lava`, `shoot`, `charge`, `hit`, `shotwall`, `kill`, `entspawn`, `efire`, `eshotwall`, `eshothit`, `touch`, `swoop`, `slam`, `checkpoint`, `pickup`, `clear`, `restart` and `level`.
- **APIs between lanes.**
  - Damage the player only with `hurt(amount, dirX, dirZ)`, `hazardHit('spikes' | 'lava')` and `ko()` from `src/player/health.js`. Scale enemy damage by `tuning.damageTaken`.
  - Player shots damage anything in `ENTS` through `damageEnt()` in `src/enemies/enemies.js`. A boss that is an entry in `ENTS` gets hit automatically.
- **Tuning.** Register adjustable values in your own lane file with `defineTuning('Section', rows)` from `src/core/tuning.js`. The tuning panel (T key) builds itself from them. Read live values from `tuning.yourKey`.
- **Levels.** A level is a function that calls the helpers in `src/levels/builders.js`; register it in `src/levels/index.js`. Stages run toward −Z and Y is up. Smelter Yard spans z ≈ 12 to −216, with floor heights 0, 1.6, 10.4, 25 and 28.
- **Module rules.**
  - Import Three.js only as `import * as THREE from '../core/three.js'`.
  - Lanes import each other freely, so imports form cycles. **Top-level code must never call a function from another lane, and must never read another lane's values.** Use them inside functions only. Core modules (`three`, `util`, `tuning`, `world`, `render`) import no lanes.
  - Wrap all `localStorage` access in the `store` helper.
  - The only external sources allowed are Three.js from jsdelivr (exact version) and Google Fonts. Everything else is drawn in code: textures on canvases, sound with WebAudio. No new dependencies without H's approval.
- **Test hook.** `window.__game` in `src/main.js` exposes state for the tests. Keep its fields.

## Git rules
1. Before anything, read `AGENTS.md` and `TASKS.md`, then `git pull` on `main`. Check open pull requests so you know what the other AI is changing.
2. Work only in your lane (see above).
3. Never push to `main`, never force-push `main`, never delete the other AI's branch. Work on `claude/<short-task>` or `codex/<short-task>` and open a pull request into `main`.
4. Keep it small: one task per branch, one focused PR. Don't reformat or rename files you weren't asked to touch.
5. The PR description says what changed and which files, how H can test it in under a minute (exact steps in the game), and what you could not test.
6. H merges one PR at a time and plays `main` between merges. If your open PR now conflicts, rebase it onto the new `main`, fix the conflict in your own files, re-run the tests and push. H never resolves conflicts by hand.
7. If a merge breaks the game, H reverts that PR in GitHub and its owner fixes it on a new branch.

## Definition of done
- `npm test` ends with `PASS` and the Playtest check on the PR is green.
- No errors in the browser console.
- The feature works as the task describes. A new mechanic gets a check in your lane's suite in `tests/suites/`.
- If you changed a level's layout on purpose, update that level's bot route in `tests/suites/50-courses.cjs` in the same PR.
- Your section of `TASKS.md` is updated.

## Session routine
**Start of every session:**
1. Read `AGENTS.md` and `TASKS.md`.
2. `git pull` on `main`; look at open PRs.
3. Tell H in one line what you're doing and in which files ("I'm doing X in files Y").
4. Branch.

**End of every session:**
1. Run the tests.
2. Commit, push your branch, open the PR.
3. Update your section of `TASKS.md` (done, in progress, blocked) and add any requests for the other AI.
4. Report to H in three parts: what changed, exact steps to test it, the suggested next task.

## Working with H
- H likes short, direct, execution-focused updates. No long explanations unless asked.
- If a task is unclear, ask H one short question. Don't guess on anything that changes how the game feels or plays: speed, jump height, camera, hit timing and difficulty are H's call. The AIs propose, H decides.
- Don't invent progress. If something is untested or broken, say so plainly.
- When the AIs disagree on a design question, each writes a two-line proposal in `TASKS.md`. H picks, and the choice goes into "Decisions H has made" below.

## Decisions H has made (don't undo)
Either AI may add a line here when H states a decision; mention it in the PR.
- Wall-jump values: wallKick 4, wallJumpHeight 2.6.
- Removed at H's request:
  - the circular charge meter
  - the movement-state label (e.g. "Wall slide")
  - the limit of 3 shots on screen
- Hazards and lives:
  - Spikes and lava take a quarter of health (4 of 16 HP) and send you back to the last checkpoint. Neither shows a damage message or a "Back to checkpoint" message.
  - Running out of health, or being crushed, costs a life. There are 3 lives per run, and losing the last one is game over (restart from the beginning).
  - The "N lives left" message after losing a life stays.
- Lanes as in the table above: the boss belongs to Codex; movement, camera and combat belong to Claude.
- 2026-10-28:
  - Charged shots must beat tapping for the same time: level 1 = 4, level 2 = 12 damage (a tap is 1), adjustable in the tuning panel.
  - The Warden's glowing core is a weak spot: hits there do more damage than body hits.
  - Soft lock-on for the boss: yes.
- 2026-10-29:
  - Below half health the Warden pauses for a short power-up (about 2 s) in which it can't be hurt, then fights slightly faster (default 1.33×). Every attack keeps its 0.5 s tell.
  - The camera shakes when the Warden slams and at each power-up roar, the Phase 3 roar harder (sliders in Tuning → Camera).
  - A practice win doesn't count as a Smelter Yard best time.
  - The Forge Warden has three sequential health bars (default 60 HP each) and two invulnerable power-ups (default 3 s). Phase 2 is 1.33× faster; Phase 3 is 1.6× faster, deals 1.5× damage, and adds Steam spin with a 0.5 s tell.

## Milestone 6: the boss (Forge Warden, working name)
A heavy furnace mech with a glowing core, in an arena behind the boss door at the end of Smelter Yard.

| Attack | What it does | How the player beats it |
|---|---|---|
| Charge | Rams across the whole arena | Dash sideways out of its path at the last moment |
| Slag lob | Arcs 3 molten blobs that leave fire for 3 s | Read the arc and keep moving |
| Ground pound | Sends a shockwave along the floor | Jump the wave |
| Phase 2 (after first 60 HP bar) | 1.33× faster, and the charge leaves fire behind | The core opens after each pound for double damage |
| Phase 3 (after second 60 HP bar) | 1.6× faster, 1.5× attack damage, and Steam spin | Dash out of the steam ring |

The fight also needs:
- an intro with the health bar filling up
- a clear tell (a flash or a sound) about half a second before every attack
- a defeat explosion and a win screen

The original plan also has a soft lock-on for the boss (shots bend slightly toward it); that is combat, so Claude.

**Done when:** every hit the player takes feels like their own mistake, not a cheap shot.

## Milestone 7: art and feel pass
Better models and effects, hit-stop, more screen shake, a win screen. Split by lane when it starts.
