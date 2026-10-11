# Workplace: exact retention and truthful panel status (#221 gaps)

**Status:** implemented on `fix/workplace-retention-status`, which is stacked on `test/workplace-221-adversarial` (PR #230).
**Owner:** Claude session `river-oaks-c2` (task `workplace-retention-status`).
**Source:** findings 2, 5 and 10 of the independent #221 evidence review, recorded in [`2026-10-11-workplace-221-adversarial.md`](2026-10-11-workplace-221-adversarial.md).
**Decision:** the user chose per-draft keys on 2026-10-11. The alternatives were expiring the whole owner key early, which loses the companion and grant, or documenting the gap and waiting for Val's retention decision.

## Changes

- **Per-task private keys** (`server/workplace.js`):
  - Each task's brief, and later its draft and receipt, live in `{ns}:workplace:v1:work:<sha256(userId)>:<taskId>`. The owner document keeps only metadata.
  - Both are written in one atomic save. On Redis this is a Lua compare-and-set, which works because every key shares the `{ns}` hash tag. In memory it is a single synchronous step.
  - A wrapper derives the private-key writes from each owner change. A task that finishes gets an exact expiry of `finishedAt` plus retention, and a task that is dropped gets its key deleted. So cancel, revoke, ban, tidy, delete and forget are all covered without per-path code.
  - An unfinished brief expires 30 days after submission. If it lapses, the validating step fails closed with `brief_expired`.
- **`forget` action** (contract, service, Vercel allowlist, panel): the owner deletes a finished task's brief, draft, receipt, notice and request id.
- **Panel health** (`preview/src/workplace-ui.js`): a failed refresh, a disconnect or a hidden tab marks the panel stale. The companion then reads "Connection lost — progress unknown", never "Working on your plan", until a fresh state arrives. The shared label changed from "work is not progressing", because a long-running service can still advance the task while the page can't see it. `data/reports/workplace-room.json` is evidence from an earlier run and keeps the old wording.
- The panel shows "brief no longer kept" when a task's brief has expired.

## Checks

- New: `server/tests/retention-workplace.test.js` (13 cases, memory and Redis) and `preview/tests/panel-workplace.test.js` (3 cases). All failed before the change.
- Mutation check:
  - Dropping the derived private-key writes fails 5 retention cases.
  - Removing the stale mark after a failed refresh fails 1 panel case.
- Results at the final head are in the PR.

## Gaps

- Hosted Redis under load and multi-region are not tested.
- Metadata for an expired task stays in the owner document until the next owner read or write. It holds no private text.
- There is still no single "erase my workplace" action.
