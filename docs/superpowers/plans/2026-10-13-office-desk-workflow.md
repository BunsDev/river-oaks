# Office desk workflow

Objective: a polished desk -> task/notes/file references -> saved result -> cross-session resume loop in the authorized office. Work is private to the authenticated resident, independent of the gated companion service. Jevica retains sole office ownership.

Owner: codex:office-desk-workflow-20261013. Branch: feat/office-desk-workflow-20261013. Sibling worktree river-oaks-office-desk-20261013.

## Design and implementation

1. Account-private bounded desk document with task title, notes, safe file links, result and open/done state. Versioned compare-and-set saves in memory and Redis; no private content in world snapshots.
2. Reuse session/waitlist/CSRF and require a current authorized office visit for desk requests. Retain work across office departure and reconnection. No uploaded binaries or external writes.
3. A responsive desk sheet within the office: task rail, focused writing area, clear saving/saved/conflict/error states, resume last task, export result, keyboard and reduced-motion support. Preserve unsaved input across errors and fence late account/scene responses.
4. Focused red/green tests, core gate with isolated Redis, desktop/mobile office journey, shared journeys, screenshot inspection and independent review.

## Owned files

New server/office-desk modules and tests; narrow route/store integrations in app, distributed-app, town and world-gateway; desk endpoint routing; preview office-desk modules/styles/tests; office-ui integration; desk browser journey and office docs.

## Evidence and gaps

Initial inventory: previous office PR #317 delivered, no active desk implementation owner. Primary live task edits preserved. Implementation and local verification complete; protected PR delivery pending. Production/live auth, real voice, human accessibility and target-device performance remain separate acceptance.

## Next action

Create the signed commit and PR, require the hosted preview gate on current main, then land through the shared protected workflow. The primary live task register records final PR/merge and retirement evidence.

## Implementation and iteration

- Added account-private desk storage outside world checkpoints, memory/Redis CAS, strict task/link bounds and same-session office visit gate under existing auth/CSRF/rate limits. No uploaded files, model calls or external effects.
- Added responsive warm-paper desk UI: task rail, wrapped title, notes, safe file links, result, autosave, completion/reopen, download, explicit delete, retry/conflict handling, keyboard shortcuts and preserved draft. Office walking pauses while the desk is open.
- Red/green service and editor regressions passed. Real HTTP/WebSocket memory + Redis tests verify denied lobby access, wrong session, guest isolation, revocation, stale-save refusal and Unicode body limits.
- Initial browser failed due to a missing Vite proxy; fixed, retained failed receipt. Office desk journey then passed 12 checks; visual inspection led to wrapping titles and stronger small-text contrast. The polish run passed 14 checks at desktop, 390px and 320px. Screenshots inspected.
- Independent review findings fixed: slow read must not replace intervening edits; UTF-8 body bound must fit advertised limits; Retry must read after a failed clean load; deletion must disable editing and restore focus. Model tests 6/6 passed after last fix. Independent final re-review found no remaining blockers.
- An intermediate combined run passed desk 15/15 then timed out at the elevator guest prompt while Vite navigated during source edits. Retained receipt `office-desk-final-experience.json`; stable-source rerun required.
- Initial core gate: agent 76 passed; client 2,878 passed with one existing skip; server 647/650 passed, with transport timeouts in distributed, office and desk tests. Focused real-transport retry passed 5/5, and distributed retry passed 11/11, no skips.
- Stable full gate: dependency audit and agent checks passed; client 2,879 passed with one existing skip; server 648/650 passed. Failures were a desk command timeout and existing voice departure timing. A two-worker server run passed 649/650, including both previous failures, but failed the existing design-library gateway assertion. Original receipts remain in `data/reports/office-desk-{core-initial,full-initial,full-limited}.json`.
- The next run uses the existing shared execution lock around all remaining full-profile checks, with normal commands/assertions, to avoid competing with local browser rendering. Initial shared-town run and final stable office journey remain pending. These retries do not turn the original failed receipts green.

## Integrated verification

- Stable office replay passed 25 checks: desk 16, elevator/access 9 (`office-desk-stable-experience.json`). Desktop 1440×1000, 390×844 and 320×700 screenshots inspected; no horizontal overflow, wrapped titles, touch-sized actions and contained footer.
- Integrated main `5725d38110d8af906a23dcff965173a471450e9c` without committing unverified work. Saved and reapplied the owned patch, compared all 14 tracked and 20 new files byte-for-byte, regenerated the plans index, then dropped only that verified temporary stash.
- `REDIS_URL=redis://127.0.0.1:16392 node scripts/browser-lock.mjs 'office desk integrated full gate' -- pnpm run verify full` is running with separate named browser receipts. Dependency audit, agent 76/76, client 2,895 passed/one existing skip, Redis/server 651/651, desktop 54/54, build, Python lint/format, Python 141/141, expected blocked synthetic-demo verification, secret scans, security browser and reflections passed. Browser experience/shared completion and integrated office replay remain pending.

## Final local evidence (2026-10-13)

- Integrated office replay: `RIVER_OAKS_E2E_REPORT=office-desk-integrated-office.json pnpm run test:experience office-desk office-visit` passed 25/25 checks, with desktop/mobile screenshots inspected again after main integration. Receipt: `data/reports/office-desk-integrated-office.json`.
- The integrated full command finished with every non-shared task passed and 18/19 shared journeys passed. The only failure was the existing seating journey's secondary context inheriting a 30-second readiness timeout. The original failed aggregate remains `data/reports/office-desk-integrated-full.json`; it is not represented as a green full run.
- Narrow harness correction: seating join now explicitly uses the same 90-second avatar-ready budget as office/resident-name journeys, preserves the `connected && playerReady` predicate and every seating assertion, records owner/guest elapsed time and captures failed guest diagnostics before context cleanup. Independent review endorsed the change; no application timeout or permission changed.
- `RIVER_OAKS_SHARED_JOURNEY=shared-seating RIVER_OAKS_SHARED_REPORT=office-desk-seating-readiness.json pnpm run test:shared development` passed all 18 assertions with zero browser exceptions. Owner readiness 3,449 ms; guest 28,694 ms. This run was close to the former limit, but did not itself exceed it. Combined with the unchanged 18 passing shared journeys, all shared scenarios are covered after the correction. Receipt: `data/reports/office-desk-seating-readiness.json`.
- `git diff --check` and `node scripts/plans-index.mjs --check` passed. No remaining implementation blockers from independent desk review.
- Retained initial/intermediate failed receipts explain the missing dev proxy, source-change elevator interruption, concurrent transport failures and seating deadline. These remain historical failures, not overwritten passes.

Production/live WorkOS, actual LiveKit voice, native Unreal, human keyboard/VoiceOver acceptance and physical-device performance are unverified. Chromium viewport checks do not establish universal pixel or accessibility acceptance. Files are safe web references; binary uploads and shared editing are future work. The worktree and ignored screenshots/logs remain preserved for delivery evidence.

The 31,781-line per-frame experience report remains intact at `data/reports/office-desk-integrated-experience.json` in this worktree. The committed `office-desk-integrated-experience-summary.json` records every journey verdict, checks and the raw report SHA-256; it is explicitly a derived summary.
