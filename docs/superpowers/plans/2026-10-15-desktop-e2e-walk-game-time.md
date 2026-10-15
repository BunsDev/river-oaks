# Desktop e2e: the W walk over game time, 2026-10-15

Objective: the Desktop workflow's macOS leg fails "W moves the player" intermittently (runs 38659435397 and 38673593628, each passing on one rerun). Make the check measure the walk itself, with the same 0.5 m threshold.

Branch and worktree: `fix/desktop-e2e-walk-game-time-20261015` in `../river-oaks-desktop-walk-check-20261015`, from `origin/main` at `c1cfd584`. Register task: `desktop-e2e-walk-game-time`. Owner: river-oaks-27 (session 16ffadb4).

Files owned: `desktop/e2e.js` (keyboard movement check), this ledger.

## Evidence

- Both CI failures ended at the same position, `[-2765.321977373157, 20.140092870626113, 1295.064162750871]`, identical in every printed digit, and the walking HUD read "0 m walked". A local probe (three runs, development town joined before W) shows that point is the spawn after the town join: in every run the player started there and then walked 3.2 to 9.5 m. In the failures the player never moved.
- The game reads keys in its frame loop (`renderer.setAnimationLoop`) and advances at most 0.08 s a frame (`preview/src/main.js`). A frame stall that covers the whole 1.2 s wall-clock hold leaves no frame that sees W. Both macOS failure logs carry bursts of ANGLE Metal "render pipeline cache limit" warnings (shader pipeline compiles) around the check. Passing runs show such bursts too, so a long stall is inferred, not observed.
- Not reproduced locally: three probe runs and one full e2e passed on this machine.

## Change

The check holds W until the page has seen 1.2 s of game time, with each frame interval counted up to the same 0.08 s cap. It stops after 30 s of wall time if frames never come. The report records `walk: { metres, game, frames, longest, wall }`, and the assertion message carries the same numbers, so a future failure says whether frames were missing (stall) or present (input or movement). The 0.5 m threshold is unchanged.

## Checks

| Check | Result |
| --- | --- |
| `node --check desktop/e2e.js` | OK |
| `pnpm run test:desktop:e2e --dev` (macOS arm64, load about 110) | Passed 13 of 13; walk 1.73 m over 1.21 s of game time, 52 frames in 1.21 s, longest frame 0.033 s |
| `pnpm run verify` (core) | Passed: scripts 95, preview 3,052 with 1 skip, server 508 with 144 Redis skips (no `REDIS_URL`), desktop 66, pytest 141 |

## Gaps and next step

- One local run is not flake proof; the Desktop runs on the PR and later macOS runs are. If the check fails again, its message distinguishes a stall from missing input.
- Next: PR, Desktop run. Merging needs Val's authorization.
