# Usernames at sign-up — 2026-10-13

**Objective (Val):** "when signing up enable the ability to choose a username or
default their github user name or use a generated one and let me, as admin,
change it before approving".

**Branch / worktree:** `feat/signup-usernames-20261013` in
`../river-oaks-usernames-20261013`, from `e8a2c8d`. river-oaks-c2, who owns
server hardening and the gate, confirmed there is no overlap. The returning
visitor splash (`endSplash`) is untouched.

## Before

- A resident was named by their verified GitHub login, or `Visitor #<id>` for
  email sign-ins.
- A waiting resident typed nothing: the status check created their request.
- The waitlist record's `name` was overwritten on every status poll.
- There was no username, uniqueness index or approver rename.

## Change

- **Rules** (`preview/src/resident-names.js`):
  - `usernameProblem` and `validUsername`: 2 to 39 letters and digits joined by
    single `-`, `_` or `.`. Every GitHub login fits.
  - Reserved names are refused: anything reading as Jevica or Resident, or
    starting with `visitor`.
  - `usernameKey` is `nameSkeleton`, so names that read the same are the same.
  - `generatedUsername(seed)` gives names like `rosy-heron-42`, stable for a
    seed. `suggestedUsername` offers the GitHub login first, then generated
    names.
- **Store** (`server/waitlist.js`, file and Redis alike):
  - A record gains `username`, `usernameKey`, `usernameBy`
    (`default`/`self`/`admin`) and `nameKey`, the held GitHub login.
  - **Each request:** it holds the owner's GitHub login, and gives a pending
    record without a username the first free default.
  - **`setUsername`:** the owner may change it while pending; an approver while
    pending or refused. Setting the same name again is no change, an approved
    name is fixed, and a name held by someone else is `taken`. Approver changes
    are audited.
  - **`usernameOf`:** returns the approved username.
  - **Redis:** a new `:waitlist:usernames` hash holds every claim. Claims are
    checked and written in Lua (the `REQUEST` and `SET_USERNAME` scripts). An
    evicted request releases its names.
- **Routes** (`server/waitlist-routes.js`):
  - Status now returns `username`, `usernameBy` and `github`.
  - New `POST /api/waitlist/username`: your own name, or `userId` for an
    approver. It is open to waiting residents and keeps the Origin, CSRF, JSON
    and 1 KB checks. Nobody may rename an approver or, unless an approver,
    anyone else.
  - `POST /api/waitlist/decision` takes an optional `username`, set first. A
    refused name refuses the decision with 409 `username_*`.
  - The new path is routed in `vercel.json` and `server/vercel-routing.js`.
- **Names in town:** `createAuth` and `createRedisAuth` take `usernameOf`, wired
  from the waitlist in `server/town.js` and `server/redis-backend.js`. An
  approved, valid username becomes `identity.name`. Jevica's accounts stay
  Jevica, and a failed lookup keeps the old name.
- **Gate** (`preview/index.html`, `preview/src/access-entry.js`,
  `preview/src/access-gate.css`):
  - A waiting resident sees *Your name in River Oaks*, with *Use my GitHub
    name*, *Suggest another* and *Save name*.
  - The 15 s refresh never overwrites a name being edited.
  - Each review row has an editable username, with *Save name*. Approving or
    reconsidering sends an edited name; revoking never sends one.
  - `api()` now keeps the server's error message.
- **Docs:** a new *Usernames* section and the Redis key in
  `docs/email-access.md`. `docs/multiplayer.md` *Resident names* no longer
  shows the old `github-<id>` fallback text.

## Verification

- `node --test server/tests/waitlist-usernames.test.js` (with
  `REDIS_URL=redis://127.0.0.1:6392`, a throwaway local server): 3/3. The same
  contract runs on the file and Redis stores: defaults, held logins under any
  spelling, rename and release, reserved and invalid names, approver rename,
  lock after approval, refused requests, audit, and a restart.
  - Redis also races two claims for one name: exactly one wins.
  - The route test covers Origin and CSRF refusals, own versus other names,
    409 taken, 400 reserved, a decision refused by a held name, approval with a
    name, and revoking with the unchanged name.
- `server/tests/auth.test.js`, new test: an approved username names the
  resident. A reserved name, a failed lookup or none keeps the GitHub name.
- `REDIS_URL=… pnpm run test:server`: 601 pass, 0 fail, 0 skipped.
- `preview/tests/resident-names.test.js`: 10/10, including the username rules
  and the generator over 2,000 seeds.
- `pnpm test`: 2752 pass, 0 fail, 1 skipped. `pnpm run build` passes.
- After merging main (`2ecbf56`, Hearts):
  - `REDIS_URL=… pnpm run test:server`: 601 pass, 0 fail, 0 skipped.
  - `pnpm run verify`: `core: passed` (unit 2766 pass, 0 fail, 1 skipped).
  - `RIVER_OAKS_SHARED_JOURNEY=access-gate pnpm run test:shared required`
    passed, with 30 checks. Nine of them are new.
  - **Waiting resident:** sees a username, and email sign-ins get a generated
    one. A held name is refused with a reason. They save their own name with
    CSRF protection, and *Suggest another* offers a generated name.
  - **Approver:** sees each username, and an approved one is fixed. They rename
    a waiting resident with CSRF protection. Revoking sends no username, and
    reconsidering a declined request sends the edited one.

## CI regression and fix (PR #314)

**What failed.** The first CI run failed `test:security:e2e`: for a signed-out
visitor, `#access-email` never appeared.

**Why.** `access-entry.js` imported `generatedUsername` from
`resident-names.js`, which game code also imports. Vite therefore split
`resident-names` (and `jevica-accounts`) into shared chunks. The asset gate
(`server/game-assets.js`, used by `middleware.js` and `server/app.js`) refuses
those chunks before approval, so the sign-in page's own module never loaded.
`pnpm run verify` did not catch it, and the access-gate journey runs on the
Vite dev server, which has no asset gate.

**Fix.**
- `generatedUsername` moved to `preview/src/generated-username.js`, which has no
  imports. On the client only the access entry imports it, so it stays in the
  entry's chunk.
- `suggestedUsername` moved to `server/waitlist.js`, its only user.
- The gate was not widened.

**Guard.** `scripts/check-access-entry.mjs` now runs at the end of
`pnpm run build`. It walks the built `/play` page's module graph and asks
`protectedGameAsset` about every file.
- On the broken build it named exactly the two refused chunks the browser
  probe saw (`resident-names-*.js` and `jevica-accounts-*.js`).
- On the fixed build: "Sign-in page: 5 files, all served before sign-in."
- `pnpm run test:security:e2e` passed locally after the fix. The email-access
  test took 8.5 s, where it had timed out at 60 s.
- On the fixed head, after main's `d473480`:
  - the build with the guard, `test:security:e2e` (2/2) and the access-gate
    journey all passed;
  - `REDIS_URL=… pnpm run test:server`: 608 pass, 0 fail, 0 skipped;
  - `pnpm run verify`: `core: passed` (unit 2782 pass, 0 fail, 1 skipped).

**Out of scope, reported to river-oaks-c2.** The same rule refuses
`/assets/boot/first-paint.js` (from `bdc4599`) to signed-out visitors, in
production too. That is a classic script outside the module graph and is not
part of this change.

## Gaps

- Residents approved before this change keep their GitHub or `Visitor #`
  names. Their GitHub login is held for them from their next sign-in.
- Usernames are fixed after approval; there is no rename later.

## Next step

PR and `pnpm run land`.
