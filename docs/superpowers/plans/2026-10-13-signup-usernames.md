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

## Gaps

- The `access-gate` shared journey is extended (waiting player: see, refuse,
  save, suggest; approver: see, rename, reconsider with a name, revoke without
  one) but not yet run: the Mac's swap was at 51 of 52 GB.
- Residents approved before this change keep their GitHub or `Visitor #`
  names. Their GitHub login is held for them from their next sign-in.
- Usernames are fixed after approval; there is no rename later.

## Next step

Run the access-gate journey and `pnpm run verify`, then PR and land.
