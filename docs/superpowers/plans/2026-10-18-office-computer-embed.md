# #486 Office desk: Tasks and Computer (Place side)

## Goal

Add Computer beside Tasks in the existing office desk dialog, issue
[#486](https://github.com/BunsDev/river-oaks/issues/486). It uses one separate-origin
frame, the five-message lifecycle contract, honest normal close and immediate forced
teardown. Local fixture work proceeds now; hosted proof belongs to #487.

## Ownership

- **Register task:** `office-computer-embed-486`, owner `claude:office-computer-embed-486 (4fad2031)`.
- **Branch:** `feat/office-computer-embed-486-20261018`, from `origin/main` 153471bc.
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-office-computer-embed-486`.
- **Files owned:**
  - `preview/src/office-computer-protocol.js` (new)
  - `preview/src/office-computer-frame.js` (new)
  - `preview/src/office-desk-ui.js`
  - `preview/src/office-desk.css`
  - `preview/tests/office-computer-frame.test.js` (new)
  - `preview/e2e/office-computer-embed.js` (new)
  - `preview/e2e/fixtures/office-computer-child/` (new)
  - `preview/e2e/experience-runner.js` (fixture registration)
  - `config/agent-workflow.json` and `.github/workflows/verify.yml` (journey lists)
  - `docs/office-computer-embed.md` (new)
  - `docs/offices.md` (desk paragraph)
  - this ledger
- **Not changed:**
  - server desk APIs;
  - `office-ui.js`, whose existing `suspend`/`reset`/`dispose` hooks already cover
    forced teardown;
  - Place CSP, Vercel configuration, production environment.

## Versions and dependencies

- **Contract:** `typesafe-place-embed` version 1, defined in `docs/office-computer-embed.md`.
  Place's proposal; Computer has not published `docs/PLACE_EMBED.md`.
- **Computer:** main 062ba495 (inspected 2026-10-18). No embed branch or PR exists
  (#33 open). Sign-in is `/api/auth/login`, followed by `/api/auth/callback`, then `/`.
  The session cookie is `SameSite=Lax`, and there is no `frame-ancestors` (CSP comes
  from a meta tag).
- **Hosting #21:** staging WorkOS client still invalid or unregistered as of 2026-10-03;
  no origin pair proven.
- **Continuity #27:** decision open.

## Decisions

1. **The issue's file map is out of date.** The issue baseline c17f9f1c predates #496
   (2b5062b6, 2026-10-18). #496 removed personal offices, shared Office tasks,
   `office-workspaces-api.js` and the `office-computer-shared` journey. Tasks therefore
   means My tasks, in Jevica's office only. The shared scope is not resurrected, and
   `office-computer-shared` cannot run.
2. **Frame owner.** `office-computer-frame.js` owns the frame, timers, listener and
   fence. The desk UI owns views and choices. `office-ui.js` already routes
   leave/revoke/disconnect to `desk.suspend()`, account change to `desk.reset()` and
   world teardown to `desk.dispose()`. All three now destroy Computer first.
3. **Lifecycle choices:**
   - Sign-in-required and error states remove the frame. No hidden runtime is kept, and
     sign-in is top-level in a new tab.
   - Departure before `usable` removes the frame without `prepare-close`: no document
     was shown in that instance.
   - Computer answers `attention` immediately when it needs a decision, instead of
     holding `prepare-close` past the timeout.
4. **Timeouts:** 15 s load, 1 s `init` repeat, 8 s close (`COMPUTER_TIMEOUTS`).
5. **Policy:**
   - Sandbox without top navigation, modals or downloads.
   - Permissions denied with `allow`; `no-referrer`.
   - The child must send `frame-ancestors <place origin>`.
6. **Test loopback exception:** a development build plus
   `VITE_TYPESAFE_COMPUTER_TEST_LOOPBACK=1` only.
7. **Production frame policy unchanged.** Place `frame-src` stays Turnstile-only until
   #21 proves the origin; the change is staged, see the doc.

## Review

A separate-agent review on 2026-10-18 found no breach of the message fence or forced
teardown. Fixed:

- **Departure after use.** Departure now asks Computer whenever the instance was ever
  usable, not only when it is usable now.
- **Computer tab fencing.** The click is fenced by a desk session after the async Tasks
  save. It hides a stale confirm, refuses while the task is busy and stops autosave.
- **Dialog close listener.** The `closingDesk` flag was dead because `close` events are
  queued; the listener now relies on `close()` switching to Tasks first. An unexpected
  close with no frame finishes the bookkeeping, and `open()` destroys any frame.
- **Departure outcomes.** A `destroyed` result mid-departure finishes the departure; a
  cancelled close refocuses the frame.
- **Resume and cancel.** Both restore the child's last reported state.
- **Small fixes:**
  - The receipt is cleared when the desk opens.
  - Status text is re-announced only when it changes, and the tab/tabpanel roles are fixed.
  - The frame is inert while closing.
  - Instance ids use `getRandomValues`.
- **Docs.** Contract and doc wording is aligned: loopback hosts, a local copy before
  sign-in/error after use, re-checking before `ready`, popups and the fixture's cookie
  limitation.

## Verification

All commands run from the worktree.

| Check | Result |
| --- | --- |
| `node --test preview/tests/office-computer-frame.test.js` | 13/13 pass. Mutating the two review fixes back fails exactly the two new tests. After the Codex fix: 15/15; the pre-fix module fails both reload tests. |
| `pnpm test` (before the review fixes) | 3534 tests: 3533 pass, 0 fail, 1 skipped (already on main) |
| `pnpm run build` (before the review fixes) | exit 0 |
| `pnpm run test:experience office-computer-embed` (before the review fixes) | passed, 38 checks, 64 s; forced teardown 146 ms (visit end) and 290 ms (revocation) with a hung child |
| `pnpm test` (after the review fixes) | 3537 tests: 3536 pass, 0 fail, 1 skipped; exit 0 |
| `pnpm run build` (after the review fixes) | exit 0 |
| `pnpm run test:experience office-visit office-desk office-computer-embed` (after the review fixes, 2026-10-18 15:31Z) | all passed: office-visit 11 checks, office-desk 17, office-computer-embed 40. Forced teardown 135 ms (visit end, close pending) and 291 ms (revocation, hung child). Receipt: `data/reports/office-computer-embed-browser.json` |
| `pnpm run verify` (core, 15:36–15:49Z, `nice -n 19`, load 96–244) | failed. `agent-tests` passed. `preview-tests` was SIGKILLed at the 600 s step timeout, with one failure: the penthouse furnishings "short idle slices" wall-clock test, a known load flake. The later steps did not run. |
| Idle-slice A/B at load ~200 (10:51 local) | fails 3/3 on untouched main da74c6e9 and 3/3 on this branch (3.0–5.8 s). This change does not touch that module. |
| Merged with origin/main 1d8740ad (signed merge 9d46bd24, clean); gates run one at a time at load 83–244 | |
| `pnpm test` (merged) | 3547 tests: 3545 pass, 1 fail (the idle-slice load flake, 79.6 ms), 1 skipped |
| `pnpm run test:server` (merged) | first run: load timeouts (browser fixture startup, screening command). Rerun: 872 tests, 668 pass, 0 fail, 204 skipped (Redis-only without `REDIS_URL`) |
| `pnpm run test:desktop` (merged) | 76/76 |
| `pnpm run build` (merged) | exit 0 |
| `uv run --locked ruff check .` / `ruff format --check .` / `pytest -q` | pass / pass / 141 passed |
| `uv run --locked python scripts/check_secrets.py --all` | exit 0 |
| `pnpm run test:experience office-visit office-desk office-computer-embed` (audit head 52fb3118, 2026-10-18T17:03Z) | all passed: office-visit 11, office-desk 18, office-computer-embed 50 checks. Forced teardown with a hung child: 291 ms (visit end, close pending), 269 ms (revocation), 142 ms (Place sign-out). Receipt refreshed. |
| Not rerun locally | `river-oaks demo` and `demo-verify` (Python untouched); `verify full` (Redis, audit, browser matrix). Hosted CI is the merge gate. |

## Audit (2026-10-18, second pass)

PR #524 head b40cb536 passed hosted Verify: every check green, including the `places`
shard that runs `office-computer-embed` in software rendering.

**Review findings, fixed:**
- **CodeQL alert** on PR #524: the fixture's 500 response echoed exception text without a
  content type. Fixture responses now default to `text/plain` with `nosniff`, and the
  500 body is generic.
- **Independent review** (Codex CLI 0.163.0, read-only), one P2: a reload or navigation
  inside the frame kept the old document's readiness and save status and never re-armed
  the load timeout. A later `load` now starts a fresh, ungated instance and reports a
  pending close as unanswered. Two unit regressions cover it (the bounded await makes a
  regression fail instead of hang), plus a browser check. Codex found the fence, teardown,
  save honesty, navigation and Tasks paths clean.
- **This ledger:** an earlier edit had truncated the "Gaps and next step" section; it is
  restored below.

**New browser regressions:**
- repeated Computer visits leave one frame at a time and no message listener (window
  listener counter);
- a URL-bearing forged message navigates nothing;
- a reload inside Computer gates again;
- a second Place account in the same browser sees its own tasks and a fresh Computer gate;
- Place sign-out (the fixture's `/auth/logout` disconnects the user) removes a hung Computer;
- the public snapshot never holds Computer notes;
- an unconfigured desk shows no Computer tab (`office-desk` journey).

**Traced in code, not by a browser check:**
- **World teardown:** `populateWorld` → `officeUI.reset` → `close` → `desk.suspend` →
  `computer.destroy`.
- **Place account change on a live socket:** `sync` → `desk.reset`.
- **Disconnect:** `update` closes the office when not connected, then `desk.suspend`. The
  sign-out check exercises this path through a server disconnect.
- **Pointer lock:** the office uses drag with pointer capture, not pointer lock, so there
  is no gesture-dependent re-lock.
- **Monitors:** no scene, monitor, layout or server file changed.

### Evidence by criterion

| #486 criterion | Evidence |
| --- | --- |
| Tasks and Computer tabs in the existing dialog | fixture journey; hosted CI |
| My tasks drafts, retries and conflicts across switches | fixture journey (failed-save draft and retry survive Computer). Office tasks were removed by #496. |
| No request before the tab; one frame; no hidden frame | fixture journey (request log, frame count, listener counter); unit tests |
| Only validated active-child messages count | unit tests (shapes, origin, source, instance, request, reload); fixture journey (forged, stale, URL, wrong origin, reload) |
| Fresh gate on every frame; a Place account change gates again | fixture journey (reentry, reload, second Place account); real Computer not tested |
| Honest pending, failed, offline, cancel and timeout closes | fixture journey; unit tests |
| Forced teardown with an unresponsive child | fixture journey: visit end, revocation, sign-out. World teardown and live account change are traced in code. |
| Denial, timeout and unavailable keep Tasks, retry, open-separately and exit | fixture journey (framing denied); unit tests (error codes) |
| Input, voice and focus; nested Escape; desktop and narrow touch | fixture journey (keys, menu Escape, keyboard return, 390/320 px); no physical touch or Safari evidence |
| No private content or credentials in messages, tasks, snapshots or monitors | fixture journey; no monitor change |
| Regressions, gates and review | this ledger; hosted CI on #524 |
| Hosted, real Computer, device and human acceptance | none (#487) |

## Gaps and next step

- **Delivered:** PR #524 merged as 97304fb7, and its worktree was retired
  (`retirement-vNfNHv`). The final audit (below) lands separately; Val authorized landing
  it when green.
- **Resume:** the Place side is complete until Computer publishes an embed build. Then run
  `office-computer-embed` against that build, record its revision and the contract
  version here and in #487, and move to #21's origin-pair proof.
- Contract proposal posted to Computer #33; status posted to #486 and #487. No reply yet.
- Staged and not in this PR:
  - the real Computer candidate (#33);
  - the origin pair, auth and frame policy (#21);
  - continuity (#27);
  - the Place `frame-src` and environment change.

## Final audit (after merge 97304fb7)

**Branch:** `test/office-computer-embed-audit-486-20261018`, task
`office-computer-embed-audit-486`.

This pass adds browser regressions for the three teardown paths that were only traced
in code: a dropped town connection, a world rebuild (Reload world data), and a live
Place account change on one page (the socket returns as another account). Each runs with
a hung Computer. Timing checks are strict: under 5 s, or 10 s for the rebuild, which
waits for world data.

**Computer side refreshed (2026-10-18 17:28Z):**
- main is still 062ba495 (2026-10-03), with no open PRs and no embed branch;
- #21's latest evidence is the 2026-10-03 staging WorkOS blocker;
- #27 has no decision;
- #33 has Place's contract and addendum, unanswered.

There is still no deployed Computer contract version to compare against.

### Evidence map

How to read the evidence column:

- **Fixture:** local Chromium (macOS, Metal) against the child fixture.
- **CI:** the same journey on hosted Linux CI in software rendering, on PR #524.
- **Unit:** `office-computer-frame` and `office-ui` tests.
- **Code:** a code trace only.
- **Incomplete:** no evidence yet.

| Criterion | Evidence | Missing |
| --- | --- | --- |
| Tasks and Computer tabs in the existing dialog | Fixture, CI | real Computer |
| My tasks drafts and failed-save retry survive Computer | Fixture, CI | — |
| Conflict state across a view switch | Unit (desk model), Code (view switch leaves the model untouched) | browser check |
| Office tasks, accepted permissions, shared scope | not applicable: removed by #496 before this work | — |
| Missing, invalid or disabled config: Tasks only, nothing loaded | Unit (config), Fixture and CI (`office-desk`: no tab, no frame) | — |
| Exact origin; fixed sign-in and open-separately links; message URLs never navigate | Unit, Fixture | real hosts |
| Forged origin, wrong window, malformed, unsupported version, stale instance | Unit, Fixture | — |
| Duplicate or late close results, timeout races, reloads inside the frame | Unit, Fixture (reload) | — |
| Usable only after Computer's own gate on a fresh instance; not from load, popup or Place login | Unit, Fixture (fixture child) | real Computer (#33) |
| Two successive Place accounts and two or more Computer accounts | Fixture (owner with Ada/Ben; guest, then bob, then guest in one browser; Cy) | real Computer |
| Visit end, revocation, sign-out, dropped connection, world rebuild, live account change with a hung child | Fixture (timings recorded on the audit PR) | real Computer |
| Reentry never flashes the previous desktop | Fixture (reentry, reload, next account) | real Computer |
| Computer's account-switch and local-copy choices; nothing stored in Place state | Fixture (models Switch and Keep in this browser); Fixture (task requests and snapshot clean) | real Computer (#33, #17) |
| Pending, failed and offline closes; ready, cancel, attention, timeout | Unit, Fixture | real Computer |
| Frame removed after departure; note recovered after recreation | Fixture (fixture account store) | real Computer and hosts (#487) |
| Account acknowledgement labelled apart from local-only recovery | Fixture | real Computer |
| Nested Escape: menus and dialogs | Fixture (menu) | real Computer |
| Nested Escape: drag and phone shell | Incomplete (Computer-side behavior) | real Computer |
| Keys, held keys, push-to-talk | Fixture (no key reaches the parent; position unchanged), Code (keys cleared, transmit off on desk open) | — |
| Return controls and keyboard focus | Fixture | human review |
| Narrow touch layout | Fixture (390 and 320 px viewports, mouse and keyboard) | physical touch device |
| Reduced motion | Fixture (journey runs reduced; no new animation) | — |
| Pointer lock | not applicable: the office uses drag with pointer capture | — |
| One frame, listeners and timers removed over repeated cycles | Fixture (frame count, message-listener counter), Unit (fake timers empty) | — |
| Neutral `SCREEN_DYNAMIC` monitors | Code (no scene or monitor file changed) | — |
| No private content in messages, task requests or snapshots | Fixture | real Computer |
| Safari, iOS and physical devices | Incomplete | device runs |
| Human accessibility review | Incomplete | Val or a reviewer |
| Hosted embedded persistence and live pilot | Incomplete: Place CSP `frame-src` blocks Computer; no origin configured | #33, #21, #27, then a Place policy change |
