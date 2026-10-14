# Shared Dominoes Implementation Plan (PR 1: the town holds the round)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two residents seated across the café round table play dominoes held by the town: the server deals, keeps the hands, checks every move, publishes only the public view, and hands each player their own tiles through a command reply.

**Architecture:** `server/cafe-games.js` mirrors `server/table-games.js` for the café `round` table but keeps real state (from `dominoes-rules.js`) instead of a replayable move list, because draws are hidden. `world.js` routes a `tableGame` command from a café chair to it, appends its public view to `snapshot().tables`, checkpoints the full entry and validates it on restore by replaying the seed and moves.

**Tech Stack:** plain JavaScript ESM, `node:test`, the pure `preview/src/dominoes-rules.js` (already server-importable, like the chess adapters).

**Spec:** `docs/superpowers/specs/2026-10-14-shared-dominoes-design.md`. **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-shared-dominoes-20261014`, branch `feat/shared-dominoes-20261014`, task `shared-dominoes-server`.

**Conventions:** signed commits (`git commit -S`) ending with `Coven-Harness: Claude Code / claude-fable-5-1`, no vendor co-author lines; TDD; run from the worktree root.

---

### Task 1: the café games module and its tests

**Files:** create `server/cafe-games.js`, `server/tests/cafe-games.test.js`.

- [ ] **Step 1: Write the failing tests** (`server/tests/cafe-games.test.js`): sit players at café chairs through the real `sit` command (as `table-games.test.js` sits at chess chairs, with `bench:plaza-salon-round-<chair>`), then cover: invite needs the chair across; accept deals seven tiles each that never reach `snapshot().tables`; `hand` answers only its owner; the forced lead, a play, a hidden draw, a pass-blocked round, a domino, scores and `MATCH_POINTS`, `next`, `resign`; standing and leaving end or clear the round; checkpoint restore and a tampered hand; chess senders still reach the chess module.
- [ ] **Step 2: Run** `node --test server/tests/cafe-games.test.js` → fails to import.
- [ ] **Step 3: Implement** `server/cafe-games.js` with `createCafeGames({players, changed, now, random})` → `{command, prune, snapshot, checkpoint, validate, load, clear}` as in the spec's section 1.
- [ ] **Step 4: Wire** `server/world.js`: import `cafeSeat` and `createCafeGames`; construct beside `tableGames`; route the `tableGame` command by seat; prune in `step()` and before checkpoint; `tables: [...tableGames.snapshot(), ...cafeGames.snapshot()]`; `cafeGames: cafeGames.checkpoint()` in the payload; validate and load in `restore()`; clear in `reset()`. Add `'Invalid cafe game'` to `server/recovery-diagnostics.js`.
- [ ] **Step 5: Run** the new test plus `table-games`, `world`, `seating`, `world-migration`, `district-checkpoint-migration` → all pass; then `pnpm run test:server`.
- [ ] **Step 6: Commit** "Let the town deal and hold a shared dominoes round".

### Task 2: docs and verification

- [ ] `docs/multiplayer.md`: a "Café games" paragraph after the chess-table section: the command family, the hidden-hand reply, the public view, the prune rules.
- [ ] `pnpm run verify` core; record counts below; PR; `pnpm run land`.

## Results

(filled in at delivery)
