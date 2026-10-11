# Workplace #221: adversarial suite and operations write-up

**Status:** implemented on `test/workplace-221-adversarial`, which is stacked on `feat/workplace-slice-20261011` (PR #227) until that PR merges.
**Owner:** Claude session `river-oaks-c2` (task `workplace-221-adversarial`).
**Scope:** #221 subtask 2 (adversarial cases across real API and socket boundaries) and the kill-switch, rollback and retention part of subtask 6. Everything else in #221 belongs to `workplace-slice` or to Val. The split was agreed with `river-oaks-55` on 2026-10-11.

## Files

- `server/tests/adversarial-workplace.test.js`: new.
- `docs/workplace-operations.md`: new.
- `.env.example`: both flags, off.
- `docs/project-management/tasks.json`: register entry.

## Cases and their boundary

| #221 case | Test | Boundary |
| --- | --- | --- |
| Cross-owner reads | another account cannot read, steer or settle … | HTTP (`createGameServer`), every owner-scoped action |
| Malicious world text | hostile world text never becomes a venue … | HTTP, with hostile place ids and names (bidi, control, oversized, `javascript:`, path, markup) |
| Edited approvals | an edited approval cannot widen, extend or forge a grant … | HTTP |
| Grant revocation during work | revoking during work stops it at once … | HTTP |
| Duplicate callbacks | duplicate callbacks land once … | HTTP, concurrent requests |
| Effect completed before acknowledgment | an effect that completed before its acknowledgment … | HTTP, lost-response retry |
| Worker and gateway loss | two live gateways racing one task …; the existing gateway-replacement test in `workplace-api.test.js` | Redis, two live gateways with real timers |
| Kill switch | same Redis test | Redis, flag off then on |
| Access loss during work | a ban or an ended waitlist approval mid-task … | Redis, `security.ban` and waitlist |

## Checks

- Mutation check: I mutated the code each case guards and confirmed the case fails:
  - Gateway access check removed: the ban case fails.
  - Request-id dedupe removed: the edited-approval, duplicate and effect-before-ack cases fail.
  - Place filtering removed: the hostile-text case fails.
  - Artifact owner scoping removed: the cross-owner case fails.
- Two mutations survived, because no API path can reach those checks:
  - The step's grant-revision check: `revoke` already cancels active work in the same write.
  - Notice de-duplication: compare-and-set already stops a step from landing twice.
  - Both are defense in depth, covered at the store level by `revoking while running … a stale writer cannot commit` in `server/tests/workplace.test.js`.
- Results at the final head are in the PR.

## Gaps

- No live WorkOS, hosted Redis, or multi-region run.
- The WebSocket path is not exercised: the workplace exposes no socket actions, and occupancy is read over HTTP.
- No single erase-everything action per owner (recorded in the operations doc).

## Next step

Open the PR against `feat/workplace-slice-20261011`. Once #227 merges, rebase onto `main`, retarget, pass hosted CI and deliver.
