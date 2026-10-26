# Garden campus #510: truthful outcomes and honest public spaces

Task `garden-campus-510-20261024`, owner `claude:river-oaks-a8 (e333fcb6)`, branch
`feat/garden-campus-510-20261024`, worktree `../river-oaks-campus-510`, from
`origin/main` `f33c914b`.

## Objective

Make the Gardens rental campus truthful and useful end to end (#510, parent #505):

1. **Truthful outcomes.** The suites dialog tells an account what happened to its own
   leases and requests: every end reason and closed-request reason in plain words,
   bounded and never another account's. A guest learns that their access ended.
2. **Honest public spaces.** Every public seat, table, bench, counter, prompt and
   button in the halls, café and pergola does what its label says. No dead controls,
   no new games.
3. **Remaining automatable #510 boxes.** An account change at a workstation resets
   the desk, a stale reply after revocation never reads as success, and repeated entry
   keeps privacy and honest state.
4. **Proof.** Draft PRs with exact evidence, the hosted campus shards green, a #510
   evidence comment, and a short human checklist for Val.

## Files owned

- `preview/src/garden-campus-ui.js`, `preview/src/garden-campus-model.js`,
  `preview/src/garden-campus.css`
- `preview/tests/garden-campus-dialog.test.js`, `preview/tests/garden-campus-model.test.js`
- `preview/e2e/garden-campus-suite.js`, `preview/e2e/garden-campus-office.js`
- `shared/garden-campus-fitout.js` (hall titles and labels only)
- `docs/garden-campus.md`, `docs/garden-campus-leases.md`, this ledger

Not touched (other owners): `garden-campus-district.js` flight volumes,
`garden-campus-finish.js` and repeated-visit resource stability (codex
`campus-flight-511-20261024`); `office-ui.js` (#623 integration); touch input in
`walking-ui.js` (river-oaks-f1, #288); `next-district-586-20261024`'s small edit in
`garden-campus-district.js`.

## Baseline (main f33c914b, 2026-10-24 19:04Z)

- `server/campus-leases.js` `list` returns the caller's own leases, ended ones
  included with `endedAt`/`endedReason` (tenant view), and the caller's own requests,
  closed ones with `status` set to the closed reason. Up to 128 ended leases and 128
  closed requests are kept campus-wide.
- `preview/src/garden-campus-model.js` and `garden-campus-ui.js` drop both: only
  live leases and pending requests are rendered. A tenant whose lease expired or was
  revoked sees only the suite back in the directory. A tenant with only ended leases
  sees an empty "Your suites" heading.
- When a lease ends, the server clears its guests, so a former guest's `list` no
  longer mentions it. `world.campusAccessEnded` walks an occupant out of the suite
  but sends no notice.
- `preview/tests/garden-campus-dialog.test.js` has 2 tests.

## Increments

### 1. Truthful outcomes

Done on the branch:
- `campusDirectory` returns `outcomes`: the account's own ended leases (tenant view) and
  closed requests, newest first, last 30 days, at most 5, with a plain sentence for each
  end reason (`expired`, `revoked`, `released`, `declined`, `withdrawn`, `superseded`,
  `offer_expired`, `retired`) and closed-request reason (`cancelled`, `declined`,
  `expired`, `retired`). A request closed as `offered` is left out; its offer row continues
  it. Unknown future reasons fall back to "ended on <date>".
- The dialog shows them under **Ended recently** in "Your suites". An account whose only
  records have ended no longer gets an empty heading.
- **Guest decision:** the server clears guests when a lease ends and keeps no record of
  them, so the page compares its own lists (`campusLostGuestAccess`). Guest access it last
  saw and no longer sees reads "Your guest access ended: <tenant> removed you, or the lease
  ended." Leaving on purpose is not reported. This lasts only while the page is open
  (Decision 1).
- **Walk-out:** while the page holds suite access, a change in the public `leased` set
  lists once in the background (one at a time, fenced against late answers) and announces
  lost access: dialog status when open, otherwise the campus panel status and the walking
  notice (`notify`, wired in `main.js`). A page on the suite floors that never listed lists
  once to learn its access.
- **Stale success:** a replayed retry answers with the record as it is now. If an accepted,
  requested, granted, renewed or issued record has ended since, the dialog says "<action>
  earlier, but since then: <what happened>" (`campusReplayChange`).

### 2. Honest public spaces

Inventory (main f33c914b):

| Place | Controls and seats | What they do |
| --- | --- | --- |
| Play panel | Go to the Grove Offices hall; Suites and leases | Travel to T1 hall; the dialog |
| T1 Grove hall | 2 tables × 4 chairs; reception counter | Each chair opens the sitter's own private desk; the counter is furniture only (no prompt) |
| T2 The Commons hall | 2 tables × 4 chairs; workbench × 3 stools | Same: the sitter's own private desk |
| T3 Atelier hall | 2 tables × 4 chairs; workbench × 3 stools | Same |
| Garden café | 4 tables × 2 chairs; counter | Same; counter is furniture only |
| Social pergola | no seats or controls | Walkable shade |

Every public seat is a workstation and opens only the sitter's private desk (existing
fitout test). No dead button or prompt was found. Labels that over-promised:
- seat titles "Collaboration and project review table" (T2), "Atelier workbenches table"
  and stools titled "Atelier workbenches". **Fixed:** "Shared project table", "Shared
  project workbench", "Atelier work table", "Atelier workbench", with a test that every
  public seat title names its furniture and promises no review, demo, presentation,
  booking, meeting or creator activity.
- The T2 room name "The Commons · Shared collaboration and project demo space" and T3's
  "Atelier and creator workspace" come from the approved layout contract
  (`shared/garden-campus-layout.js` `groundUse`, generated into
  `docs/design/garden-campus/layout-contract.json` and the view packet). #647 left them
  unchanged (Decision 2). The draft PR on `fix/garden-campus-hall-names-510-20261025`
  renames them to "Shared project tables and workbench" and "Atelier work tables and
  workbench", regenerates the packet (only the two `use` strings and the manifest hash
  change; `node scripts/garden-campus-views.mjs --check` is clean) and adds a test that no
  hall name promises an activity. It waits for Val's choice and does not land without it.

### 3. Remaining automatable boxes

- Account change at a workstation resets the desk; standing suspends it; an open desk
  offers no second desk; dispose releases it: dialog test with an injected desk
  (`createDesk`). This behavior already existed; the test now guards it.
- Stale reply after revocation: see increment 1 (replay change).
- Repeated entry privacy: covered by the existing office journey (neighbour sees only
  their own desk) and desk model tests. Resource stability on repeated visits belongs to
  `campus-flight-511-20261024`.

## Commands and results

At 2026-10-24 ~19:15Z, source before commit:
- `node --test preview/tests/garden-campus-dialog.test.js preview/tests/garden-campus-model.test.js`:
  29 pass (22 dialog, 7 model), 0 fail. The 15 new dialog behavior tests failed first on
  main's source.
- `node --test preview/tests/garden-campus-fitout.test.js`: 7 pass after the title fix; the
  title test failed first.
- Campus and world-manifest tests: preview 141/141; server 56 pass, 8 skipped (Redis).
- `pnpm test`: 4034 pass, 0 fail, 1 skipped (pre-existing). `pnpm run build`: passed.
  (Ran before the seat-title and replay edits; rerun at the commit.)

At signed commit `098eb42f` (draft PR #647):
- `pnpm run verify` (core): passed before commit on the identical tree (receipt
  `.runtime/agent/core.json`, `dirty: true`).
- Hosted checks: 29/29 complete, 24 success, 5 skipped, 0 failed, including the aggregate
  `preview`, `preview experience (campus)` (garden-campus-office, garden-campus-suite with
  the new "told why" check) and `preview experience (campus-traversal)`.
- A standalone local campus journey run was queued behind other sessions' browser runs for
  about 75 minutes and never started; I stopped it because `verify full` runs the same
  journeys. Not counted as evidence.
- `pnpm run verify full` with an isolated Redis (127.0.0.1:6411, no persistence), run 1
  (19:28–20:14Z, clean tree at 098eb42f): every non-browser stage passed, including Redis
  server tests, the dependency audit, Python 156, desktop 115 and the secret-history scan,
  and `security-browser` passed 2/2. Then the run was killed by a signal (exit 144):
  `reflections` shows `ABORT_ERR` with 0 ms run time after 75 s in the browser queue, and
  `experience`, `shared` and `ipic-screening` were never run. No test failed, but the run
  is incomplete, not a pass. Receipt preserved as `full-1-receipt.json` in the session
  scratchpad.
- Run 2 (20:15:12–20:15:43Z, same clean revision): failed in `agent-tests` (236/237).
  The failure was `scripts/tests/land-pr.test.js:122` "a queued lander wakes on release
  without waiting for the fallback…" (`queue release did not wake the lander`, 5 s budget),
  and every later stage was skipped. The suite imports only `scripts/land-pr.mjs`; this
  branch changes nothing under `scripts/`. Run alone three times right after, it passed
  29/29 each time. This matches the known host-load timing flake on that test (seen on
  #636 the same day); the cause is not established here. Receipt `full-2-receipt.json`.
- Run 3 (from about 20:20Z, same clean revision): every non-browser stage passed this time,
  `agent-tests` included (237/237); `security-browser`, `reflections` and `experience`
  passed, the last with all 17 journeys, among them garden-campus-office,
  garden-campus-traversal and garden-campus-suite ("The resident is told the operator ended
  the lease (Suite T1-201: The lease ended on 2026-10-24: the campus operator ended it.)").
  At 23:50Z it was still waiting in the shared browser queue for `shared` and
  `ipic-screening`, so it is not yet a full pass. The final result goes in the #510 comment.

### Review (2026-10-24, about 23:40Z)

An independent review of the #647 diff found four defects, all fixed in `7418b41a` with a
failing test first:
1. **Account switch (privacy).** Another account signing in on the same page kept the former
   account's lists: it could see the former account's guest suites and hear false "access
   ended" notices. The page now keeps its lists for the account and world that asked; a
   change drops them, closes an open dialog, clears the door prediction, and ignores answers
   for an account that has left.
2. **Overtaken announcement.** A background list overtaken by a newer list (the dialog
   opened meanwhile) lost its announcement. The newer list now makes it.
3. **Operator wording.** A replayed offer or extension told the operator "you gave the suite
   up". Operator actions now get operator wording ("the tenant gave the suite up").
4. **Unrealistic test.** The guest test changed the town's leased suites while its list still
   showed them. It now matches what the server sends; a new test pins that a guest the tenant
   removes learns it at the next list (already listed under Gaps).

At signed commit `7418b41a`:
- Focused: `node --test preview/tests/garden-campus-dialog.test.js
  preview/tests/garden-campus-model.test.js preview/tests/garden-campus-fitout.test.js`:
  40 pass, 0 fail. The account-switch, overtaken-list and operator-wording tests failed first.
- `pnpm run verify` (core), clean tree: passed. agent 237/0/0, preview 4043 (0 fail,
  1 skipped), server 1111 (0 fail, 223 skipped: Redis and browser), desktop 118 (0 fail,
  3 skipped), build, Python lint/format/tests (156), demo, secrets.
- Local campus journeys at this commit were queued behind other sessions' browser runs when
  this ledger was written; the result goes in the #510 comment. Hosted shards at the pushed
  head are the browser evidence for it.

## Gaps

- A guest removed by the tenant doesn't change the public `leased` set, so their page
  learns at its next list, not at the moment of removal.
- A former guest's notice is page-local (Decision 1).
- No human, device or screen-reader check has run (checklist below).

## Decisions for Val

1. **Former-guest notices across reloads.** Keeping them needs the server to record
   former guests on an ended lease (or a removal), which is a campus checkpoint version
   change. Proposed: not now; the page-local notice covers the live case.
2. **T2/T3 room names.** "Shared collaboration and project demo space" and "Atelier and
   creator workspace" promise activities the halls do not run (every seat is a private
   desk). Either approve relabelling the layout contract (for example "Shared project
   tables" and "Atelier workbenches", regenerating the design packet with
   `node scripts/garden-campus-views.mjs`), or approve a real shared activity for T2
   (a new activity type, which this lane does not add). The rename is ready as a draft PR
   (`fix/garden-campus-hall-names-510-20261025`): merge it to choose the rename, close it
   to keep the names for a future activity.
3. **Paid offers** stay unconfigured (see `docs/garden-campus-leases.md`). Computer stays
   with #486/#487.

## Human checklist for Val (≤10 min)

Two accounts (one operator from `RIVER_OAKS_CAMPUS_OPERATOR_IDS`), the Gardens revision.
Mark each step pass or fail, with a note.

1. **Keyboard only, desktop (2 min).** Tab to Play → The Gardens offices → Suites and
   leases. Every button reachable with Tab; focus starts on the heading; Escape closes the
   dialog and returns focus to the world; walking keys do nothing while it is open. Ask
   for a suite, then withdraw: the row moves to **Ended recently** with "You withdrew your
   request…".
2. **Ending while away (2 min).** Operator offers, resident accepts and walks into the
   suite. Operator ends the lease with the resident's dialog closed. Resident: walked out,
   a notice reads "Suite T1-…: The lease ended on …: the campus operator ended it.", and
   the dialog lists it under Ended recently. Is the wording clear?
3. **Nested Escape (1 min).** Sit at a hall table, Use this desk, open the suites dialog
   from Play if reachable; Escape closes only the top layer each time; no held movement
   after closing.
4. **Held keys (1 min).** Hold W (or an arrow key), open Suites and leases, release the
   key while the dialog is open, then close it: the avatar must not keep walking. Repeat
   with the desk open, and with a key held while switching apps (Cmd-Tab) and back.
5. **VoiceOver, Mac Safari (2 min).** The status line is announced after each action and
   after the walk-out notice; Ended recently reads as a list with its label.
6. **Phone touch (2 min).** Phone-width dialog: no horizontal scroll, every button tappable,
   the date and length pickers usable; reduced motion on: nothing animates.

Not covered here: paid mode (not built), Computer (#486/#487), physical-GPU budgets (#511).

## Next action

Push, hosted checks at the new head, #510 evidence comment, then hand #647 to the landing
train (river-oaks-71). Merging is theirs under Val's landing authorization.
