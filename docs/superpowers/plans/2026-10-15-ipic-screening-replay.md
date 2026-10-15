# #368 slice: stale and replayed playback in the two-browser screening journey (2026-10-15)

Task `ipic-screening-replay-368` · branch `test/ipic-screening-replay-20261015` · worktree `../river-oaks-ipic-screening-replay-20261015` · owner claude:river-oaks-1b (b929a625) · parent #359, package #368.

## Objective

#368 asks for "stale/replayed playback" in its end-to-end scaffolding. The server and transport already refuse these (`server/tests/screenings.test.js`, `server/tests/screenings-transport.test.js`, both on `main`), but no browser journey sent them while two real players were watching. This slice adds that step to the existing two-browser journey, so a regression in the server's receipts or in the client's revision fence shows up as a visible rewind, restart or pause.

The rest of #368 belongs to its live owner, `claude:office-seats-363`, and is not duplicated here. See **Coverage map**.

## Files owned

- `preview/e2e/ipic-screening.js`: one new step after the viewer's refused pause
- this ledger

## The step

The host's page sends real transport commands through the development-only `window.__riverMultiplayerCommand`, as a modified or retrying client could:

1. **Restart.** Stop, then start the fixture again. The step then has the whole 30 s clip even when a loaded machine paused late. Run 1 showed why: the resumed film reached 30.008 s and ended.
2. **Replay.** After 1.5 s of play, resend the same start, with the same operation id and payload. It must come back `replayed: true` at the same revision. If it applied twice, the film would restart from 0.
3. **Stale revision.** A pause written against the stopped revision is refused with `screening_stale`.
4. **Earlier epoch.** A stop for another epoch is refused with `screening_stale`.
5. **Reused operation id.** The start's operation id with a pause is refused with `screening_operation_conflict`.
6. **Watch.** Sample both pages nine times over about 2–3 s. Each film must:
   - never step backwards (it can't fall more than 50 ms below the previous sample);
   - be at 1 s or more at the first sample, so it was not restarted;
   - advance more than 1 s;
   - stay unpaused on the started revision;
   - stay within 500 ms of the other page.

## Checks

| Command | Result |
| --- | --- |
| `pnpm run verify` (core) | passed: agent 109/109, preview 3177 pass + 1 skip + 1 todo, server 572 pass + 148 Redis skips (core runs without Redis), desktop 69/69, build, Python, secrets |
| `node preview/e2e/ipic-screening-runner.mjs`, run 1 (resume-based step) | failed in the new step: `host film kept playing: 30.008 -> 30.008`. Under load the pause came late, and the resumed clip ran out. Rewritten to restart the film first. |
| run 2 (Chromium 156.0.8078.4, SwiftShader) | **passed 10/10**. The new step reached revision 4 on both pages. Over nine samples the films ran from 3.15/3.11 s to 5.17/5.16 s (host/viewer), 7–43 ms apart, never paused. Refusals: `screening_stale`, `screening_stale`, `screening_operation_conflict`. The rest of the journey: converged after 6 ms, pause spread 0 ms, panels 560/358/288 px wide. |
| Mutation proof: `server/screenings.js` revision fence loosened from `!==` to `>`, restored afterwards (`cmp` identical) | **failed as intended**: `stale and reused commands refused: {"earlierEpoch":"screening_stale","reusedOperation":"screening_operation_conflict"}`. The stale pause was accepted, so the step catches a stale command taking effect. |

## Coverage map for #368 (evidence, 2026-10-15)

| #368 item | Where it is covered | Owner |
| --- | --- | --- |
| A: office owner plus a separate cinema-host grant; B: no access. Penthouse, screening, private desk content, seat race, late join | #406 journey (30 checks) | `claude:office-seats-363` |
| Legacy office | `office-computer-shared` on `main` (owner plus an invited guest, private desk, revocation; `experience` profile), and #406's rollback test (the legacy layout admits the guest with no seats) | merged / `claude:office-seats-363` |
| Ten enter/exit soak cycles with resource counters, late join | #407 soak (11 cycles, flat counters) | `claude:office-seats-363` |
| Stale/replayed playback | Server and transport tests on `main`; this slice adds the two-browser step | this task |
| Close #367 re-entry | #407 receipts | `claude:office-seats-363` |

## Not covered

- Real GPUs, Safari, iOS and physical devices. The journey runs headless Chromium with SwiftShader.
- Redis coordinators for this step. The transport test on `main` already covers a retry through either edge with two coordinators.

## Next action

Open the PR, land it with `pnpm run land <pr> --owner claude:river-oaks-1b`, then retire the worktree with `project:prune`.
