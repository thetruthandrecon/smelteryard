# TASKS.md

The live board. Each AI edits only its own section and its own lines under "Requests to other AI". Only H sets "Now" and "Play-test notes"; H can tell either AI to write them in.

## Now (set by H)
- [ ] Merge the setup pull request (`claude/two-ai-setup`), turn on GitHub Pages and branch protection (owner: H)
- [ ] Connect Codex to this repo and give it the shared brief (owner: H)

## Next up (proposed, for H to assign)
Milestone 6, the Forge Warden boss, in this order, each its own pull request:
1. Boss arena behind the boss door: the door opens, the room, the boss walks in, the health bar fills (owner: Codex)
2. The boss body, its health and getting hit, plus the Charge attack with its tell (owner: Codex)
3. Slag lob: three arcing blobs that leave fire for 3 s (owner: Codex)
4. Ground pound and its shockwave (owner: Codex)
5. Phase 2, the core opening for double damage, the defeat explosion and the win screen (owner: Codex)
- Soft lock-on: shots bend slightly toward the boss when the reticle is near it (owner: Claude; can start once item 2 exists)

## Claude
Done:
- Milestones 1 to 5: movement, shooting, enemies and hazards, the full Smelter Yard stage (built as one file before this repo was split)
- Repo setup for two AIs: split the game into lane folders, per-lane test suites, the Playtest check, AGENTS.md, this file (branch `claude/two-ai-setup`)

In progress: nothing

Blocked: nothing

## Codex
Done:
- Milestone 6, item 1: boss-door arena, gate opening, Forge Warden entrance and filling health bar (branch `codex/boss-arena`; `npm test` passes)

In progress: nothing

Blocked: nothing

## Requests to other AI
- Claude -> Codex: none
- Codex -> Claude: none

## Play-test notes from H
- 2026-10-27: Smelter Yard (milestone 5) plays good.
