# Smelter Yard: instructions for AI agents

This repository is worked on by two AI agents, Claude (Anthropic) and Codex/ChatGPT (OpenAI). The owner, H, playtests and decides. Read this whole file before changing anything.

## How we work together
- `main` is the version H plays. Never push straight to `main`.
- Each change goes on its own branch, named for the agent and the task, e.g. `codex/boss-slag-lob` or `claude/boss-arena`. Open a pull request into `main`.
- Keep pull requests to one task each and say in the description what changed and how you tested it. H or Claude merges them.
- Before starting, pull the latest `main`. If another agent's open pull request touches the same area, coordinate through H instead of building on top of it.
- After a merge, Claude publishes `main` to the playable link H uses.

## Files
- `index.html` is the whole game (see the rules below).
- `tests/run.cjs` is the automated playtest. Run it before every pull request: `npm install`, then `npx playwright install chromium`, then `npm test`. It must end with `PASS`. Screenshots go to `tests/shots/` (not committed).
  - The bots play both levels start to finish with enemies paused, using the `window.__game` hook. If you change level geometry on purpose, update the bot's route in the same pull request.
- `README.md` is for H.

## What it is
An original over-the-shoulder 3D action platformer in the style of the Mega Man X games, but with its own hero, enemies and stage. It is one self-contained HTML file using Three.js r169, loaded from `https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js`, with no other assets.
- Open `index.html` in Chrome to play.
- The owner, H, playtests and gives feedback; he doesn't write code.
- The build follows a 7-milestone plan:
  - Milestones 1 to 5 are done: movement, shooting, enemies and hazards, and the full Smelter Yard stage up to the boss door.
  - **Next is milestone 6, the boss fight** (see the end of these notes).

## Rules for changes
- Keep the game one HTML file (`index.html`). The only allowed external sources are Three.js from jsdelivr (exact version) and Google Fonts. Everything else is drawn in code: textures on canvases, sound with WebAudio.
- Collision is custom: axis-aligned boxes against a capsule-ish player box. There is no physics engine. Don't add one.
- The simulation runs at a fixed 120 Hz step (`step(dt)` with `STEP = 1/120`) and rendering interpolates between steps. Keep the game logic deterministic and inside `step`, separate from rendering.
- Keep the `window.__game` test hook and its fields; the automated playtest uses them.
- Wrap all `localStorage` access in try/catch (the `store` helper already does).
- Add a check to `tests/run.cjs` for any new mechanic, in the same style as the existing ones.

## Map of the code (in file order)
- **Tuning:** `DEFAULTS` holds every adjustable value. `SPEC` builds the in-game tuning panel (press T). New tunable values go in both.
- **Level data:**
  - Builder helpers: `box()` (a static solid; `kind` is floor, wall, crate, spike, belt or door), `dynBox()` (a moving platform or crusher), `addEnt()` (an enemy), `capsule()` (a health pickup), `checkpoint()`, `sign()`.
  - `defineTestYard()` and `defineSmelter()` build each level. `LEVELS` lists them, and `setupLevel(id)` and `loadLevel(id)` switch between them.
  - Coordinates: the stage runs toward −Z and Y is up. Smelter Yard spans z ≈ 12 to −216, and its floor heights are 0, 1.6, 10.4, 25 and 28.
- **Player and physics:** `p` holds the player state.
  - Movement: `moveAxis`, `probeWall` (wall-slide and wall-jump), `updateDynamics` (platforms and crushers), `pushOut`.
  - Damage: `hurt`, `hazardHit` (spikes and lava), `die`, `loseLife`.
- **Combat:** `aimRay`, `fireShot` (charge levels 0, 1 and 2), `updateShots`, `damageEnt`.
- **Enemies:** `updateEnemies` runs one state machine per kind:
  - walker: patrols back and forth
  - flyer: hovers, telegraphs, swoops, returns
  - turret: needs line of sight, telegraphs, fires
  - dummy and mover: shooting-range targets
- **`step(dt)`:** the main simulation tick.
- **Rendering:**
  - Hero model: `makePlayer`.
  - Enemy models: `makeEntityMesh`.
  - Level meshes: `buildLevelVisuals`, rebuilt on each level change.
  - Effects: particles via `emit` and `burst`; dash afterimages ("ghosts").
- **Audio:** `sfx` contains procedural WebAudio sounds.
- **Game events:** `handleEvents` turns simulation `events` into effects and sounds. The game logic only pushes events and never touches visuals directly.
- **UI:** the start, pause, clear and game-over overlays, the tuning panel, and the HUD (`updateHud`).

## Design decisions H has already made (don't undo)
- Wall-jump values: wallKick 4, wallJumpHeight 2.6.
- Removed at H's request:
  - the circular charge meter
  - the movement-state label (e.g. "Wall slide")
  - the limit of 3 shots on screen
- Hazards and lives:
  - Spikes and lava take a quarter of health (4 of 16 HP) and send you back to the last checkpoint. Neither shows a damage message or a "Back to checkpoint" message.
  - Running out of health, or being crushed, costs a life. There are 3 lives per run, and losing the last one is game over (restart from the beginning).
  - The "N lives left" message after losing a life stays.

## Milestone 6: the boss (Forge Warden, working name)
A heavy furnace mech with a glowing core, in an arena behind the boss door at the end of Smelter Yard. Its moves:

| Attack | What it does | How the player beats it |
|---|---|---|
| Charge | Rams across the whole arena | Dash sideways out of its path at the last moment |
| Slag lob | Arcs 3 molten blobs that leave fire for 3 s | Read the arc and keep moving |
| Ground pound | Sends a shockwave along the floor | Jump the wave |
| Phase 2 (below 50% HP) | Faster, and the charge leaves fire behind | The core opens after each pound for double damage |

The fight also needs:
- an intro with the health bar filling up
- a clear tell (a flash or a sound) about half a second before every attack
- a defeat explosion and a win screen

**Done when:** every hit the player takes feels like their own mistake, not a cheap shot.
