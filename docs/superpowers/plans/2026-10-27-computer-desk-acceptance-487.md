# #487 Combined TypeSafe Computer desk acceptance

## Goal

Advance [#487](https://github.com/BunsDev/river-oaks/issues/487): prove the office desk
opens the real TypeSafe Computer child, keeps a user's work across real frame
destruction and recreation, and hand off a narrow pilot with a tested Tasks-only
rollback. This round delivers Computer's embed mode (Computer #33), runs the Place desk
against that real child locally, and prepares the staged origin-pair change for
authorization. Staged acceptance is not production activation.

## Ownership

- **Register tasks** (owner `claude:river-oaks-487 (3cc3bd93)`):
  - `computer-desk-487-20261027`: the Place side, this branch.
  - `computer-embed-33-20261027`: the Computer side, in TypeSafeAI/typesafe-computer.
- **Place branch:** `test/computer-desk-487-20261027`, from `origin/main` f4dd959a.
  Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-computer-desk-487`.
- **Computer branch:** `feat/place-embed-33-20261027`, from Computer main 062ba495,
  in the external clone `/Users/buns/Documents/GitHub/TypeSafeAI/typesafe-computer`.
  Draft [TypeSafeAI/typesafe-computer#34](https://github.com/TypeSafeAI/typesafe-computer/pull/34).
- **Place files owned:**
  - `preview/e2e/office-computer-real.js` (new, on demand only)
  - `preview/e2e/fixtures/office-computer-real.js` (new)
  - `preview/e2e/experience-runner.js` (starts the real child for that journey)
  - `data/reports/office-computer-real-child-browser.json` (new receipt)
  - `docs/office-computer-embed.md` (status, candidate, real-child run)
  - this ledger
- **Not changed:** Place CSP (`vercel.json`, `server/security-headers.js`), Vercel or
  WorkOS configuration, any production environment, the fixture journey and its CI
  registration.

## Candidates and contract

| Item | Value |
| --- | --- |
| Contract | `typesafe-place-embed` version 1. Place: `docs/office-computer-embed.md`. Computer: `docs/PLACE_EMBED.md` on #34, adopting v1 unchanged. |
| Place candidate | main f4dd959a (the desk is unchanged since #524 97304fb7, #526 da4e7b5e, #530 2703571b) plus this branch's runner and journey |
| Computer candidate | `feat/place-embed-33-20261027` at 8c0240af (#34, draft; earlier 40cfc196, 1ecd2c96) |
| Local origins | Place fixture `http://127.0.0.1:<port>`; Computer `server.js` `http://127.0.0.1:<free port>`, `TSC_AUTH=off`, in-memory sync, `TSC_PLACE_ORIGINS=<Place origin>` |
| Staged origins | Not chosen or provisioned. See the [proposal](#phase-3-staged-origin-pair-prepared-not-applied). |

## Phase 1: Computer embed mode (#33), done locally

Computer #34 at 1ecd2c96 adds:

- **Activation.** A framed `?embed=place` page whose parent is on `TSC_PLACE_ORIGINS`
  (`GET /api/embed`). `server.js` sends `frame-ancestors 'self' <origins>`.
- **Account gate.** Every instance shows the gate before any document. The cross-account
  question appears with nothing behind it.
- **Messages.** Exact v1 shapes, fenced by origin, source and instance.
- **Closing.** It writes the local copy, waits up to 6 s for an account save, then
  answers `attention` with a Computer dialog. Choosing the local copy gives `ready` /
  `local`.
- **Top-level auth.** Sign-in and WorkOS sign-out open in tabs. An expired session hides
  the desktop.

Computer checks on 2026-10-27:

| Command | 40cfc196 | 1ecd2c96 |
| --- | --- | --- |
| `npm run typecheck` | pass | pass |
| `npm test` | unit 364/364; renderer 94/94 | unit 368/368; renderer 97/97 (13 embed tests) |
| `npm run test:phone` | 20/20 | 20/20 (iPhone 16 Pro and SE emulation, WebKit) |
| `npm run test:desktop` | 19 passed, 1 skipped | 19 passed, 1 skipped (screenshots need `TSC_SCREENSHOTS=1`) |

**Independent review** of 40cfc196, by a separate reviewer agent (not human review),
found nothing serious and raised eight findings. Six were fixed in 1ecd2c96:

- a false `attention` while offline;
- no re-gate when a recheck found a different account;
- the menu sign-out tab opening after the click;
- an account-load error removing the frame;
- wildcard origins;
- a close during a drag.

The hosted `frame-ancestors` header is deferred to #21. Escape in a text field sending
`request-close` is kept, per the contract. The dispositions are on
[#34](https://github.com/TypeSafeAI/typesafe-computer/pull/34#issuecomment-6453101758).

## Phase 2: Place desk against the real child

`RIVER_OAKS_COMPUTER_CHECKOUT=<Computer checkout> pnpm run test:experience office-computer-real`
starts that checkout's `server.js` beside the Place fixture and runs the desk against
it. The journey is on demand, not in CI: it needs a local Computer checkout.

**The first run found a contract discrepancy, owned by Computer.** It ran against
1ecd2c96 and passed 11 checks, then failed at "Choosing Computer’s local copy is
reported as local, not saved".

- **Cause:** Computer's "Keep in this browser and leave" sent `request-close`, which
  Place treats as leaving the whole desk, so the Tasks receipt never appeared.
- **Contract:** step 5 says the person decides in Computer and leaves again in Place.
- **Fix:** Computer 8c0240af changes the button to "Keep in this browser", which only
  records the choice. The Computer regression was updated to assert that no
  `request-close` is sent. Place needed no change.

The rerun against 8c0240af passed: 28 checks in 72 s,
`data/reports/office-computer-real-child-browser.json`.

## Acceptance matrix

Levels: **F** = Place against its deterministic fixture child; **R** = Place against the
real Computer child, both on loopback with `TSC_AUTH=off`; **S** = staged HTTPS origin
pair; **D** = physical device or human review.

| Row | F | R | S | D | Notes |
| --- | --- | --- | --- | --- | --- |
| Core journey | pass (#530) | pass | blocked | – | R: gate, note, saved status, destroy, local copy cleared, recreate, recover |
| Existing Tasks | pass | – | blocked | – | Desk is My tasks only since #496 |
| Two Place accounts | pass | – | blocked | – | R not run; fixture covers fresh-gate behavior |
| Two Computer accounts | pass | pass | blocked | – | R: Switch, top-level sign-in, second dev user, cross-account question with nothing behind |
| Auth and origin pair | – | – | blocked | – | Needs the staged pair; loopback cookies ignore ports |
| Account expiry | – | pass | blocked | – | R: dev signed-out cookie mid-edit |
| Place access loss | pass | pass (visit end 101 ms, dropped connection 59 ms) | blocked | – | R: visit end, dropped connection |
| Interrupted save | pass | pass | blocked | – | R: 503 save → attention → local → recovered → saved |
| Normal close races | pass | Computer tests | blocked | – | Computer: slow save and a newer close request |
| Input and focus | pass | pass | blocked | open | R: keys, palette Escape, then top-level Escape |
| Failure recovery | pass | – | blocked | – | |
| Privacy | pass | pass | blocked | – | R: no note text in desk requests or the snapshot; Computer: lifecycle fields only |
| Narrow/device use | pass (emulated) | Computer phone tests | blocked | open | Not Safari on iOS or a device |
| Resources | pass | pass | blocked | – | R: ten open/edit/close cycles; one document per visit; listeners back to baseline |
| Host continuity | – | – | blocked | – | #27 decision needed for a new Computer host |
| Configuration rollback | pass | – | blocked | – | Unset `VITE_TYPESAFE_COMPUTER_ORIGIN` = Tasks only |

## Phase 3: staged origin pair (prepared, not applied)

Place is served at `https://typesafe.place`; Computer production is
`https://typesafe.computer`. Those are different sites, so Computer's `SameSite=Lax`
session cookie would not be sent inside the frame. The pilot needs a Computer host on
the Place site, as #21 proposes.

These are domain, deployment and identity-provider changes on production accounts. None
is authorized, and none has been made:

1. **Computer host.** Add `computer.typesafe.place` (and a staging twin such as
   `computer-staging.typesafe.place` beside a staged Place host) to the Computer Vercel
   project, with DNS under `typesafe.place`.
2. **WorkOS.** Register `https://computer.typesafe.place/api/auth/callback` and its
   logout return for the Computer client, and set `WORKOS_REDIRECT_URI` for that
   deployment. `auth.js` binds cookies to the callback's host.
3. **Computer framing.**
   - Set `TSC_PLACE_ORIGINS=https://typesafe.place` on that deployment.
   - Add to Computer's `vercel.json` headers:
     `Content-Security-Policy: frame-ancestors 'self' https://typesafe.place`.
     Or generate the header from the same variable in `vercel.ts`.
4. **Place frame policy.**
   - Add `https://computer.typesafe.place` to `frame-src` in `vercel.json` and
     `server/security-headers.js`.
   - Update `server/tests/hardening2-security-headers.test.js`.
5. **Place configuration.** Set `VITE_TYPESAFE_COMPUTER_ORIGIN=https://computer.typesafe.place`
   for the staged environment only.
6. **Continuity (#27).** A new host has new local storage. Work in local copies on
   `typesafe.computer` stays there, and only account-synced data reaches the new host.
   This needs an explicit decision before the pilot.

**Rollback:**

- Unset `VITE_TYPESAFE_COMPUTER_ORIGIN` and rebuild. The desk is then Tasks only, with no
  data migration.
- Optionally revert the `frame-src` entry.
- Computer's `TSC_PLACE_ORIGINS` empty keeps embed mode closed.

## Results

All runs on 2026-10-27, on this Mac.

| Check | Revision | Result |
| --- | --- | --- |
| Computer gates | 40cfc196, 1ecd2c96, 8c0240af | See Phase 1. At 8c0240af: typecheck pass; unit 368/368; renderer 97/97; phone 20/20. Desktop was not rerun for the renderer-only last commit; it was 19 passed + 1 skipped at 1ecd2c96. |
| `node --test preview/tests/office-computer-frame.test.js` | Place main f4dd959a | 15/15 |
| `pnpm run test:experience office-computer-embed` (fixture) | Place f4dd959a + this branch's runner | passed, 62 checks, 87 s (22:20Z). The receipt was kept out of the repository; the committed fixture receipts are #530's. |
| `office-computer-real` vs Computer 1ecd2c96 | | failed after 11 checks (the discrepancy above) |
| `office-computer-real` vs Computer 8c0240af | | passed, 28 checks, 72 s (22:34Z) |
| `pnpm run verify` (core) | see the PR | see the PR |

## Gaps

- No staged origin pair, hosted WorkOS sign-in or real cookie separation (#21).
- No #27 continuity decision for a new Computer host.
- No Safari on iOS, physical device or human review.
- R does not yet cover two Place accounts, revocation, world rebuild or denied framing
  against the real child. The fixture run covers them.

## Next action

1. Publish the Place draft PR.
2. Post the status to #487 and #359.
3. Ask once for the Phase 3 authorization.
