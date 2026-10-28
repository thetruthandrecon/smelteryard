# Smelter Yard

An original over-the-shoulder 3D action platformer that runs in the browser. H playtests and decides; two AIs build it: Claude (movement, camera, combat) and Codex (enemies and bosses, levels, menus and HUD, effects and sound).

**Play:** the published link (GitHub Pages) always runs the latest `main`. Changes show up there a minute or two after a merge.

**How a change gets in:**
1. An AI makes it on its own branch and opens a pull request.
2. The **Playtest** check runs the automated playtest on that pull request. Merge only when it's green.
3. Merge it, play the link for a few minutes, and tell either AI what felt off.
4. If a merge breaks something, press **Revert** on that pull request in GitHub.

**Where things are:**
- `TASKS.md` is the board: who's doing what, what's next, and your play-test notes.
- `AGENTS.md` holds the rules both AIs follow.

**Milestones:**
1. Project and test room: done
2. Movement: done
3. Shooting and damage: done
4. Enemies and hazards: done
5. Full Smelter Yard stage: done
6. Boss fight: next
7. Art and feel pass
