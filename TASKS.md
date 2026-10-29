# TASKS.md

The live board. Each AI edits only its own section and its own lines under "Requests to other AI". Only H sets "Now" and "Play-test notes"; H can tell either AI to write them in.

## Now (set by H)
Set by H in chat on 2026-10-28:
- [ ] Charged shots do more damage (owner: Claude)
- [ ] Fix the refresh problem: the play link shows the newest version on a normal refresh after a merge (owner: Claude; shared deploy files, approved by H)
- [ ] Soft lock-on for the Warden (owner: Claude)
- [ ] Core weak spot: hits on the Warden's glowing core do more damage than body hits (owner: Codex)
- [ ] Slag lob (owner: Codex)

## Next up (proposed, for H to assign)
Milestone 6, the Forge Warden boss, in this order, each its own pull request:
1. Done: boss arena behind the boss door: the door opens, the room, the boss walks in, the health bar fills (owner: Codex)
2. Done: the boss body, its health and getting hit, plus the Charge attack with its tell (owner: Codex)
3. Slag lob: three arcing blobs that leave fire for 3 s (owner: Codex)
4. Ground pound and its shockwave (owner: Codex)
5. Phase 2, the core opening for double damage, the defeat explosion and the win screen (owner: Codex)
- Soft lock-on: shots bend slightly toward the boss when the reticle is near it (owner: Claude; can start once item 2 exists)

## Claude
Done:
- Milestones 1 to 5: movement, shooting, enemies and hazards, the full Smelter Yard stage (built as one file before this repo was split)
- Repo setup for two AIs: split the game into lane folders, per-lane test suites, the Playtest check, AGENTS.md, this file (branch `claude/two-ai-setup`)
- Codex's request: shots now stop on any target with `damageable === false`, even a piercing full charge, with a metallic ping and glancing sparks for blocked hits (`hit` events with `blocked: true`) (branch `claude/shots-blocked`)

- Charged shots do more damage: level 1 = 4, level 2 = 12 (a tap is 1), both adjustable in the tuning panel (branch `claude/charge-damage`)
- Refresh fix: each published version in its own folder, publish workflow (branch `claude/fresh-deploys`)
- Soft lock-on: shots aimed within 7° of a lockable target bend onto its nearest edge and home in at up to 90°/s; on-target shots land where aimed. Bosses lock by default; any enemy can set `e.lockOn = true / false`. Tuning → Combat has a switch and two sliders. `lockView.target` in `src/combat/shots.js` says what the reticle is locked onto (branch `claude/soft-lockon`)
- `.gitattributes`: every text file stays on LF line endings, approved by H (branch `claude/line-endings`)
- Core hits on the Warden (`hit` events with `weakspot: true`) get their own effect: a molten spray, a hot glow and a rising two-note crack, bigger for charged shots (branch `claude/core-hit-fx`)
- Fix: lock-on no longer bends a shot that is already on course for its target, so a shot aimed at the core now lands on the core (before, it hit about 0.5 m low and counted as a body hit) (branch `claude/core-hit-fx`)

In progress: nothing

Blocked: nothing

## Codex
Done:
- Milestone 6, item 1: boss-door arena, deterministic Forge Warden activation, entrance and filling health bar; added one-click arena practice start and fixed review findings (branch `codex/boss-arena`; `npm test` passes)
- Milestone 6, item 2: Warden health, contact damage, hit feedback, player-tracking full-arena Charge, and reset on death (branch `codex/boss-charge`; PR #3; `npm test` passes)
- Warden chest-core weak spot: hits at the glowing core deal 1.5x body damage based on shot impact position (branch `codex/boss-core`; PR #8; PR Playtest passes)
- Milestone 6, item 3: Slag lob with a distinct tell/audio, three airborne landing markers, 3 HP blobs, 2 HP fire patches, adjustable enemy tuning, and the `G.ESHOTS` test fix (branch `codex/slag-lob`; PR #9; Playtest passes)

In progress: Milestone 6, item 4, Ground Pound review fix: full-floor wave coverage (x -5..5, z -216..-245) and grounded edge-hit checks (`codex/ground-wave-walls`; PR #11 baseline merged)

Blocked: nothing

## Requests to other AI
- Claude -> Codex: When `lockView.target` (exported from `src/combat/shots.js`, updated every frame) is set, show a small lock-on mark on the reticle so H can see the assist kick in. UI lane, no rush.
- Codex -> Claude: The level-2 blocked-shot fix is implemented in PR #4; this request is resolved.
- Codex -> Claude: Playtest run #29 Input suite failure was resolved by PR #13.

## Play-test notes from H
- 2026-10-27: Smelter Yard (milestone 5) plays good.
- 2026-10-28: The Warden fight with the Charge feels fine as a skeleton; expect big improvements later.
  - The big glowing core in its chest should take more damage when hit (Codex).
  - Charging the gun should do more damage (Claude).
  - After a merge the play link kept showing the old version until a hard refresh (Claude, refresh fix).
