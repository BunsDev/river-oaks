# Main Ribbon spine closeout (#740)

Objective: Val's goal of 2026-11-03, from the 11-04 plan on #740: clear the main-spine conflicts, prove
the corridor, land #883 alone, publish an extension boundary, pass the current-head gates, and hand Val a
signed-in production walk packet. Allowed: bounded tree and bench moves that keep IDs. Stop before any
removal. Landing holds until `river-oaks-28` pins the v0.3.0 head (confirmed by message, 11-04).

Owner: `claude:river-oaks-38 (4dbeca)`. Task: `ribbon-spine-closeout-740-20261103`. Worktree:
`river-oaks-ribbon-spine-740`. Base: `f7d22cff`.

## Reproduced on `f7d22cff`

The new corridor regression failed 6 of 8 tests before the fix, the 2 passes being the unchanged route and
the two-person walk (nothing solid stood in it: pits, trunks and the bench are not walking solids, so a
player walked through them). The geometry probe showed 8 pits in the walk or under a post, 7 crowns below
the canopy top, 4 stems standing on the walk itself, and the bench body under modules 018-019.

## What changed

See [spine-boundary.md](../../design/five-rooms/spine-boundary.md).

- Eight pits moved at most 1.90 m; the bench 0.76 m; no tree or ID removed; `district-vegetation.json` untouched.
- Crowns cleared in the fragment shader over the walk: no new mesh, draw call or texture.
- `five-rooms.json` is `five-rooms-v3`. The spine is `clear` because the validator accepts it against the live
  site. South and link-studios stay `blocked`.
- The planted edge stays off behind a new flag, `clearSegmentPlanting`, because clearing a segment would otherwise have planted it.
- The bench's lamp column moved to the bench's north end: straight out would have been too close to the road.

**Found on the way: an occupied-checkpoint failure.** A player seated on the moved bench made the whole town
checkpoint `invalid_checkpoint`, in both directions. Checkpoints now keep that seat at its previous spot and
restoring seats the player on the moved bench.

## Independent review, before the first commit

| Finding | Severity | Outcome |
| --- | --- | --- |
| The carve's `&&` and `\|\|` bound wrongly: a full-height slit through crowns on the north run | High | Fixed with parentheses; a test now evaluates the emitted expression, and the harness compares above the volume box by box |
| An object on the bench's old seat spot still invalidated the checkpoint | Medium | Fixed: restore seats the player before validating position. On rollback, the earlier build still fails closed in this narrow case |
| Bark in the AO pass kept drawing inside the carved volume | Medium | Fixed: batches that reach the volume are excluded from AO. Unit-covered only, the pixel effect is not browser-verified |
| A resident on the bench stays at the other build's seat spot until they stand | Low | Documented, not fixed |

## Results

| Check | Result |
| --- | --- |
| Corridor regression (`ribbon-spine-corridor.test.js`) failing first on the unfixed tree | 6 failed, 2 passed |
| Tightened `ribbon-crown-clearance.js` against a snapshot with the slit, Chromium | Failed as intended: `aboveMismatch` on 5 north-run boxes, 0 px against 6,556-16,388 control |
| `pnpm run test:ribbon:crowns` on the fixed tree | Pending |
| `pnpm run verify` (core) on the fixed tree, before commit | Passed: agent 307/307, preview 5,275 tests 0 fail 1 skip 30 todo, server 1,126 pass 285 skip, desktop 127 pass 5 skip, python 215, build, ruff, secrets |
| `node scripts/rehearse-spine-seat-rollback.mjs <earlier build>` against `f7d22cff`, local worlds | 4 of 4 `ok`: player seated and resident resting, both ways |

The numbers below this line were measured before the review fixes and are not evidence for the final head:
core verify (server 1126 pass/285 skip, desktop 127/5 skip, python 215) and `pnpm test` (5270 tests, 0 fail, 1 skip, 30 todo).

## Gaps and next step

Pending: see the live register row for the next action. Not yet evidence: core and full verify, hosted checks,
journeys on the final head, #883, signed-in production walk, real-service occupied rollback, human and device acceptance.
