# Usernames need at least 4 letters (2026-10-15)

## Objective and ownership

Val, 2026-10-15: "require a minimum of 4 letters in the username … ensure no duplicates
and cases do not matter and capital and lowercase are treated the same". Decisions
(asked and answered the same day): count **letters A–Z** (digits and `- _ .` do not
count), and **keep names already chosen** that are shorter.

Branch `feat/username-minimum-letters-20261015` in `river-oaks-username-minimum`,
owner `claude:river-oaks-safe-edits (e9aa0185)`, register task
`username-minimum-letters`. Base `ec036956` (origin/main at pickup). Open PR #451
(`waitlist-clarity`, river-oaks-penthouse) edits `server/waitlist.js` invitation logic,
`preview/index.html` lines 41–49 and `docs/email-access.md` lines 11–16; this change
touches the username functions, the username form (lines 65–66) and the rules line
(22), so the two merge cleanly in either order.

## Before

`preview/src/resident-names.js`: a username is 2 to 39 letters or digits joined by
single `- _ .` (`usernameProblem`, `validUsername`). Duplicates were already refused
case-insensitively: both waitlist stores compare `usernameKey` (`nameSkeleton`:
lowercase, accents and lookalikes folded, letters only), and
`server/tests/waitlist-usernames.test.js` already asserted `OctoCat` is taken by
`octocat`. `nameSkeleton` maps every digit to a lookalike letter (`bob99` → `bobgg`),
so the new minimum counts the name's own letters instead of the key.

## Change

- `usernameChoiceProblem` / `validNewUsername` (`resident-names.js`): the existing
  rules plus at least 4 letters A–Z. `validUsername` stays as it was, so stored and
  shown names are unchanged.
- `server/waitlist.js`: the GitHub login is offered as the default only when it can be
  chosen now; generated defaults are filtered the same way. In both stores a new name
  (resident or approver) must pass the minimum; re-saving the unchanged name returns
  first, and a locked request still answers `locked`. The Redis store reads the record
  before its script to apply the same order.
- Form copy (`preview/index.html`): `minlength="4"` and help text "At least 4 letters.
  Digits are fine too, and a single - _ or . may sit between parts. Capital and small
  letters count as the same name." Browsers apply `minlength` only to edited values,
  so re-saving a kept shorter name is not blocked.
- `docs/email-access.md` rules updated.

## Checks and evidence

Red first, `REDIS_URL=redis://127.0.0.1:6411 node --test preview/tests/resident-names.test.js server/tests/waitlist-usernames.test.js`
against an isolated throwaway `redis-server` (port 6411, no persistence): 10 passed,
7 failed for the intended reasons (`usernameChoiceProblem` missing; the 3-letter login
`bob` still offered; `bob99` and `abc` accepted in both stores; the kept-name tests
passed their first checks, so Redis seeding was right, then accepted `abc`).

After the change: **17 passed, 0 failed, 0 skipped** (both Redis tests ran). New cases:
the rule and kept validity; generated names meet it (2,000 seeds); short GitHub logins
are not offered; `bob99`, `abc` (approver) and `x-y-z-1` refused with "at least 4
letters"; `NIGHT-OWL` taken by `night-owl`; kept `bob` stays, re-saves unchanged,
cannot become `abc`, can become `bobby`; approved `al` still names its resident.

Full server suite on the isolated Redis: 793 / 794. The one failure was
`voice-reconcile.test.js` ("a tab that never came back loses its lease…", load
average 36–51), a known load flake unrelated to usernames; it passed alone twice.

Then, at base `ec036956` plus this change (uncommitted):

- `pnpm run verify`: core passed (`.runtime/agent/core.json`). Node suites 112/112,
  3,297/3,299 (1 skipped), server 599/752 (153 skipped: Redis and live services,
  covered above with the isolated Redis), 69/69; pytest 141 passed.
- `RIVER_OAKS_SHARED_JOURNEY=access-gate node preview/e2e/shared-runner.js required`:
  passed (it fills `night-owl` and `taken-name`, both 4+ letters).
- `pnpm run test:security:e2e`: 2/2.

After merging `origin/main` at `15c5b7d1` (#451 landed; the one conflict was the username
form, resolved on #451's markup with `minlength="4"` and the rule in its help text), at
`6b06abb9`: waitlist and username tests with the isolated Redis 20/20; `pnpm run verify`
passed again (112/112, 3,297/3,299 with 1 skipped, server 599/753 with 154 skipped, 69/69,
pytest 141); `access-gate` journey passed; `test:security:e2e` 2/2.

## Gaps and next step

Not run: hosted CI, a live sign-up against production auth, the desktop app. Val
authorized PR, landing when CI is green and retirement (2026-10-15).
