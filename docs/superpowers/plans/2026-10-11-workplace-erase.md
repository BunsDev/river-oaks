# Workplace: erase my workplace (#221 gap)

**Status:** implemented on `fix/workplace-erase`, which is stacked on `fix/workplace-vercel-sweep` (PR #237).
**Owner:** Claude session `river-oaks-c2` (task `workplace-erase`).
**Source:** the review gap "no single erase-everything action". Val's retention period is a separate decision. Erasing is an owner request, so it doesn't depend on that policy.

## Changes

- **Contract:** a new `erase` action. Its body must be exactly `{"confirm": "erase"}`, and anything else is refused.
- **Service** (`server/workplace.js`):
  - `erase` empties the owner document and saves it as a deletion.
  - Both stores treat a `null` value as delete, checked against the same revision. On Redis the Lua script runs `DEL`; in memory the record is removed. Either way the revision restarts at 0.
  - The existing side-write derivation turns the emptied task list into `DEL`s for every `work:` key, plus a `ZREM` from the due index, all in the same atomic save.
  - Then any desk is released and any local timer cancelled.
- **Panel:** "Erase my workplace…" leads to a plain warning, with "Erase everything" and "Keep my workplace".
- Vercel rewrite and allowlist, `docs/workplace-operations.md`, and an erase line in the adversarial probe list. An intruder's erase touches only their own empty workplace.

## Checks

- `server/tests/erase-workplace.test.js` has 5 cases (memory and Redis), and `preview/tests/panel-workplace.test.js` gains 1. All failed before the change.
  - The confirmation contract.
  - Every trace removed while a neighbour stays untouched. On Redis, no key names the owner afterwards.
  - A racing stale runner that cannot bring anything back.
  - The two-step panel control.
- Mutation check:
  - Saving the document instead of deleting it fails 4 cases.
  - Dropping the explicit desk release passes, because the state read the erase returns already reconciles desks: no companion means no desk. The release stays as defense in depth.
- `REDIS_URL=… node --test server/tests/*.test.js`: 490 pass, 0 skipped.
- `node --test preview/tests/*.test.js`: 2597 pass, 1 skip that was already there.
- `pnpm run verify`: core passed. The workplace browser journey passed.

## Gaps

- An erase does not reach Redis replicas or backups beyond what Redis itself guarantees.
- The panel's erase isn't covered by the browser journey, only by the unit test.
