# Office desk defaults to TypeSafe Computer

## Objective and scope

Val requested exploration of useful TypeSafe Place widgets and replacement of the
existing task-list entry with computer.typesafe.place. This change reuses the
existing desk embed: Computer is the default view and first tab, with a permanent
separate-tab link. Saved Place tasks stay accessible; retained unsaved drafts open
on Tasks. No task data is migrated and no new widget or world-data bridge is shipped.

Baseline: BunsDev/river-oaks main `59981778a4e99c766b816692a71bb5c227a2e542`.
Branch: `feat/desk-computer-default-20261106`.
Owner: `codex:06c0aec8df8a`.

## Files and behavior

- `preview/src/office-computer-protocol.js`: hosted default; explicit off/invalid
  override remains fail closed; loopback still requires development fixture flags.
- `preview/src/office-desk-ui.js`, `office-desk.css`: Computer-first entry, permanent
  safe separate-tab link, retained-draft exception and late-load session fence.
- Focused protocol tests and Computer fixture/real-child journeys: updated entry
  expectations; task-only fixture explicitly disables Computer.
- Shared browser fixture: all synthetic journeys explicitly disable production Computer,
  including the standalone office/IPIC runner; embed journeys override with loopback.
- `.env.example`, `docs/office-computer-embed.md`: current behavior and explicit-off rollback.

## Validation

- `node --test preview/tests/office-desk-ui.test.js preview/tests/office-computer-frame.test.js preview/tests/office-desk-model.test.js`: 33 passed, 0 failed/skipped. Six new controller regressions use a DOM stand-in, not a real browser.
- `pnpm test`: 5,255 passed, 0 failed, 1 skipped, 30 existing contrast TODOs (5,286 total). This full run preceded the final shared-load fix; the final focused suite validates that fix.
- `pnpm run build`: passed after the shared-load fix; existing large-chunk warnings remain.
- `pnpm run verify server`: 1,120 passed, 290 skipped (Redis and optional-service coverage not proven).
- `pnpm run verify python`: passed; 215 Python tests, lint/format and the synthetic demo. The demo verifier's expected blocked result is part of that profile, not real-world acceptance.
- `pnpm run verify security`: passed; no leaks. History coverage is the one-commit shallow clone only.
- `pnpm run verify`: stopped at tooling (301 passed, 6 failed). All six unchanged cancellation tests invoke `ps`, which fails because this execution host reports namespace PIDs with no matching `/proc/<pid>`. The unchanged test file reproduces the same failure in isolation.
- `pnpm run verify desktop`: 127 passed, 1 failed, 4 skipped. Its unchanged live-process test hits the same `/proc/<pid>/status` mismatch.
- Browser prerequisite download via Playwright returned an invalid archive. Chrome for Testing 157.0.8103.38 was obtained separately without changing dependencies; running the named journeys through a local launcher failed before any page test because Chromium's process-singleton Unix socket is forbidden (`Operation not permitted`). No browser or visual pass is claimed.
- Header probe: hosted Computer returned HTTP 200 and CSP frame-ancestors allowing
  https://typesafe.place. No signed-in production account was exercised.
- Fresh checkout only: no prior local worktrees to retire. Repository inventory's
  GitHub query is unavailable because this host has no gh CLI; remote reads use the
  connected GitHub service. Historical task records are preserved.

## Authorized delivery — 2026-11-06

After receiving the implementation and its environment-blocked verification report,
Val explicitly requested: "Please merge to main." Publish the reviewed increment
and use hosted CI to complete the checks this workspace cannot execute. The prior
local failures remain recorded above; no failed check is relabeled as passed.

The default branch was rechecked at the same baseline. All 33 focused tests passed
again before publication. Require the current main base, verified commit signature,
passing hosted checks (including the office Computer journey), and no unresolved
review blockers before the exact-head merge. Record PR and merge evidence in the
live register and handoff rather than creating a documentation-only follow-up commit.

Review resolved two findings: use the shared browser-fixture default so standalone
journeys cannot contact production, and share an in-flight task load across desk
reentry while keeping stale sessions fenced. Merge and hosted acceptance are still
pending at the time of this source checkpoint.

## Widget exploration — proposal, not shipped scope

Recommend an opt-in **My Place** desktop preset using Computer's existing movable
widgets and responsive phone shell. First milestone:

| Widget | Player outcome | Existing foundation / new work |
| --- | --- | --- |
| My session | Keep a plan, creative notes and the next step for today's visit | Reuse Computer Note + Checklist + Clock. No new task backend or automatic import. |
| Places | Find a venue and return to the world to visit it | Place has public destinations, private landmarks and validated travel. New Computer widget and explicit navigation contract required; start with public destinations. |
| What's on | See upcoming gatherings, local time, venue and capacity | Existing event service; the former Map panel was removed. Read-only widget is proposed; RSVP stays an explicit Place action. |
| Friends & invitations (later) | See accepted contacts and invitations | Reuse social permissions and both-way blocking; no private location or message history by default. |
| Companion work (later) | Inspect progress/results and pause or revoke a task | Current workplace is flag-controlled and limited; do not imply general agent execution. |

Computer main inspected: `c6f7a2c3a4890f724cf795ab4974ed794b84efaf`.
Relevant seams: `src/renderer/components/desktop/WidgetBody.tsx`,
`src/core/layout.ts`, `src/shared/sync.js`, `docs/PLACE_EMBED.md`.
Place seams: `preview/src/places.js`, `server/events-api.js`,
`docs/world-events.md`, `server/social-api.js`, `preview/src/workplace-contract.js`.

The current embed protocol carries lifecycle only. World widgets need a separate
versioned, narrow contract with exact origin/source/instance checks. Place supplies
bounded, authorized data and owns navigation and all shared mutations. No cookies,
tokens or identity inference across products. Clear live data on disconnect or
revocation. Persist widget preferences/layout, not presence or event snapshots.
Unknown widget types are rejected by Computer's shared/server sync validator, so
update registry, renderer, phone shell and validation together. Standalone Computer
must explain when a live Place session is required.

Acceptance for a follow-on: notes survive sign-out/reopen under the correct account;
public destinations navigate only on explicit selection and server approval;
events show timezone and an honest disconnected/stale state; revocation clears live
data; keyboard, 320px layout, reduced motion and teardown pass. No new paid inference
or integration with external messaging is needed for this milestone.
