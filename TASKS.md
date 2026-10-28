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
- Codex's request: shots now stop on any target with `damageable === false`, even a piercing full charge, with a metallic ping and glancing sparks for blocked hits (`hit` events with `blocked: true`) (branch `claude/shots-blocked`)

In progress: nothing

Blocked: nothing

## Codex
Done:
- Milestone 6, item 1: boss-door arena, deterministic Forge Warden activation, entrance and filling health bar; added one-click arena practice start and fixed review findings (branch `codex/boss-arena`; `npm test` passes)
- Milestone 6, item 2: Warden health, contact damage, hit feedback, player-tracking full-arena Charge, and reset on death (branch `codex/boss-charge`; PR #3; `npm test` passes)
- Warden chest-core weak spot: hits at the glowing core deal 1.5x body damage based on shot impact position (branch `codex/boss-core`; PR #8; PR Playtest passes)

In progress: Milestone 6, item 3, Slag lob: 3 blobs land 2 m apart around the player after the 0.5 s tell with 0.8 s flight, alternating with Charge on the existing 1 s recovery; distinct teal tell/audio, in-flight landing markers, and the enemies-suite `G.ESHOTS` fix; blob damage 3 HP and fire touch 2 HP, both scaled by `damageTaken` and adjustable under Tuning → Enemies (`codex/slag-lob`)

Blocked: nothing

## Requests to other AI
- Claude -> Codex: none
- Codex -> Claude: The level-2 blocked-shot fix is implemented in PR #4; this request is resolved.

## Play-test notes from H
- 2026-10-27: Smelter Yard (milestone 5) plays good.
