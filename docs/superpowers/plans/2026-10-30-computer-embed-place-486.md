# #486 Place side: account-change flake, deploy package, Computer #33 check

- **Goal (Val, 2026-10-30):** finish the Place side of #486 so only Computer-owned and
  production gates remain.
- **Owner:** `claude:river-oaks-5c (32a30e)`
- **Tasks (live register):**
  - `computer-embed-place-486-20261030`: branch `fix/computer-embed-account-switch-20261030`,
    worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-computer-account-switch`, this ledger.
  - `computer-csp-draft-486-20261030`: branch `feat/computer-origin-same-site-csp-20261030`,
    worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-computer-csp-draft`, draft #801.
- **Baseline:** `origin/main` f0d01729 (2026-10-30).

## 1. Account-change flake

### Root cause

`preview/src/access-entry.js` stores the entered account in `document.body.dataset.accountId`
and rechecks `/auth/session` every 15 s. When the account differs, it reloads the page.
The office-computer-embed journey switches the Place cookie on a live guest page and drops
the town socket. The town client reconnects at once as the new account, and office-ui
tears Computer down. The page reload then lands 0–15 s later, at whatever step the
journey has reached. The earlier signatures were a click on a detached element, a
`#desk-count` timeout with the desk closed, and a click inside the frame (#665 and
docs-only branches, 2026-10-24..26). Until the reload, the page also ran the new
account's socket under the old account's entry state (avatar `userId`, Character
Studio `ownerId`).

#686 (2026-10-26) made the journey arm a `domcontentloaded` wait before the switch and
await it. A scan of hosted `verify.yml` runs since 2026-10-27 found no failure in this
journey. It covered 74 failed runs and the earlier attempts of 46 rerun runs, and both
failed `preview experience (places)` jobs (41050122836, 40953140219) had passed
office-computer-embed and failed store-intro (#799). The product window remained.

### Fix

- `preview/src/session-account-notice.js` (new, game side): `noticeSessionAccount(userId)`
  dispatches `river-oaks:account-changed` only when the page entered as a different
  account.
- `preview/src/multiplayer-client.js`: the town client calls it each time it reads the
  session for a connection, and keeps connecting, so office-ui's in-page teardown still
  runs.
- `preview/src/access-recheck.js`: `ACCOUNT_CHANGED`, the name access-entry listens for.
  It is defined apart from the game module on purpose: at 2ffa7240 the town client
  imported `access-recheck.js`, and core verify's build stage failed in
  `scripts/check-access-entry.mjs`. The shared chunk would have been refused before
  sign-in, so the sign-in page would not start. The unit test keeps the two names equal.
- `preview/src/access-entry.js`: on the event it rechecks at once. If a check is already
  in flight, it rechecks right after. The check and its reload are unchanged; no
  WorkOS, CSRF or waitlist rule changed.

### Regressions

- `preview/tests/access-recheck.test.js`: the notice fires only for another account,
  not before entry and not without an account. The gate and the town client use the same
  event name.
- `preview/tests/office-computer-frame.test.js` (frame owner): an account change removes
  a hung, usable Computer without `prepare-close`, with no listener or timer left. The
  next frame is a fresh instance at Computer's gate, and the old document is fenced by
  window and instance.
- `preview/e2e/office-computer-embed.js`: the reload into the new account is now checked
  to be prompt (< 10 s after the switch). Before, it was uniform over the 15 s poll.

## 2. Deploy package (frame-src)

Main already lists `https://typesafe-computer.vercel.app` in `frame-src` (#762, 2026-10-29).
That origin is cross-site from `https://typesafe.place`, and so is Computer's production
host `https://typesafe.computer` (TypeSafeAI/typesafe-computer#21). Computer's session
cookie is `SameSite=Lax`, so a framed player on either host would show as signed out.

Draft #801 (`feat/computer-origin-same-site-csp-20261030`, f5f04ae0, **do not merge**)
names #21's proposed same-site origin `https://computer.typesafe.place` instead:

- It changes `vercel.json`, `server/security-headers.js` and
  `server/tests/hardening2-security-headers.test.js`. The test now requires the Computer
  entry to be an exact origin on Place's site.
- `.env.example`, the frame config test and `docs/office-computer-embed.md` name the same
  value.
- **Env value:** `VITE_TYPESAFE_COMPUTER_ORIGIN=https://computer.typesafe.place`, in
  Production only. Preview runs on `*.vercel.app`, which is cross-site.
- **Rollback:** unset the variable. The tab disappears, the desk is Tasks only, and the
  `frame-src` entry is inert. Revert #801 to remove the entry as well.

## 3. Computer #33 embed build

Computer #33 has a candidate embed build: draft TypeSafeAI/typesafe-computer#34,
`feat/place-embed-33-20261027` at 8c0240af. It is unmerged, mergeable, and has had no
commits since 2026-10-27. No deployment serves it.

The real-child run used the local checkout read-only
(`/Users/buns/Documents/GitHub/TypeSafeAI/typesafe-computer`, clean, renderer built
after 8c0240af):

`RIVER_OAKS_COMPUTER_CHECKOUT=<that checkout> pnpm run test:experience office-computer-real`

- **Revisions:** Place 255b2e4b (this branch), Computer 8c0240af.
- **Result:** passed, 40 checks in 127 s (2026-10-30T14:08Z). At 2ffa7240 it also passed 40
  checks, in 137 s.
- **Scope:** loopback with `TSC_AUTH=off` dev users. This is not hosted WorkOS and not the
  real origin pair.
- **`office-computer-embed` against the same Computer:** a probe at Place 1d190f22, using a
  one-off copy of the runner (`.runtime/computer-486/`, not committed) that starts the real
  checkout in place of the fixture.
  - **Result:** it failed at the first Computer step, 4 checks in: `waitState('signin')`
    timed out after 20 s. The journey expects a signed-out child, the fixture default,
    and the real Computer runs with `TSC_AUTH=off` dev users.
  - **Why it can't go further:** the rest of the journey drives the fixture's
    `/api/fixture` controls (slow and failed saves, hang on close, denied framing) and
    the fixture's DOM, which the real Computer lacks.
  - **Missing:** a test-control surface in Computer, or a real-child mode in this
    journey. `office-computer-real` is the real-child counterpart.
- **On #487:** both revisions are recorded in comment 6524829656, edited to add the probe.

## Checks and results

All runs are local, at 255b2e4b, with one browser lock held for the whole batch
(2026-10-30 13:41–14:08Z). An identical batch at 2ffa7240 was also all green. That head
was superseded for the build fix below, so it is not cited as evidence.

- **Unit:** `node --test preview/tests/access-recheck.test.js preview/tests/office-computer-frame.test.js`
  ran 18 tests, 18 passed.
- **Chromium:** `pnpm run test:experience office-visit office-desk office-computer-embed`
  passed. Checks: office-visit 12, office-desk 18, office-computer-embed 62. 189 s.
- **WebKit:** `RIVER_OAKS_EXPERIENCE_BROWSER=webkit pnpm run test:experience office-visit office-desk office-computer-embed`
  passed with the same counts (12, 18, 62). 190 s.
- **Loop:** `pnpm run test:experience office-computer-embed` ×10, Chromium, passed **10/10**
  with 62 checks each.
  - Each journey took 89–119 s, at 1-min load 15–36.
  - The reload into the new account came 509–1228 ms after the switch. Before, it waited
    for the 15 s poll.
- **Real child:** `office-computer-real` passed 40 checks (see 3).
- **Core:** `pnpm run verify` passed 11/11 at 255b2e4b. Receipt `.runtime/agent/core.json`,
  `dirty:false`.
  - agent 294/294
  - preview 4777 run, 4741 pass, 0 fail, 1 skipped
  - server 1395 run, 1110 pass, 285 skipped (Redis and live auth)
  - desktop 132 run, 127 pass, 5 skipped
  - python 215 pass
  - build ("Sign-in page: 7 files, all served before sign-in"), demo and secrets passed
  - At 2ffa7240 the build stage failed; see Fix.
- **Receipts:** `data/reports/experience.json` was restored after each run. These are local
  receipts only; the hosted checks are on the PR.

## Decisions for Val

**Resolved 2026-10-30.** Val authorized the recommendations below: the Computer origin
is `https://computer.typesafe.place`, and #801 and #802 are to land. The Production env
variable stays unset until Computer #34 serves that origin (decision 2). Unset remains the
rollback.

1. **Which Computer origin Place frames.**
   - Recommended: `https://computer.typesafe.place`. It is same-site, so Computer's Lax
     cookie is sent inside the frame. It needs a Computer deployment and WorkOS
     registrations on that host (#21), and a continuity decision for the new origin's
     local data (#27).
   - Alternatives: keep `typesafe-computer.vercel.app` (main today) or use
     `typesafe.computer`. Both are cross-site, so framed players would be signed out
     unless Computer changes its cookie policy, which is Computer's call.
   - Draft #801 implements the recommendation. Merge it only after the choice.
2. **When to activate.** Set `VITE_TYPESAFE_COMPUTER_ORIGIN` in Production only after
   Computer #34 serves the chosen origin with `frame-ancestors https://typesafe.place`.
   Unset is the rollback. This is a production configuration change and was not done
   here.
3. **Merging the flake fix.** #802 is ready for review. Merging was not
   authorized in this goal.

## Gaps

- There is no hosted run of the fixed journey yet; the PR's `preview experience (places)`
  shard is its first.
- The flake was never reproduced on the fixed branch, which is expected, and was not
  re-reproduced on main this session. The root cause rests on #686's forced-reload proof
  and the code path.
- Nothing ran against a hosted Computer, WorkOS sign-in, a real origin pair, iOS or a
  touch device.

## Next step

- Land #802 and #801 (authorized 2026-10-30).
- Val: set `VITE_TYPESAFE_COMPUTER_ORIGIN=https://computer.typesafe.place` in Production once
  Computer #34 is live there.
- Computer owner: merge and deploy #34 at the chosen origin, and resolve #21 and #27.
- Then run `office-computer-embed` and a manual desk visit against the hosted pair, and
  record both revisions on #487.
