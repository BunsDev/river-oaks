# Landing page: "Enter River Oaks" for residents who already have access

- **Task:** `landing-enter-for-approved` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `fix/landing-enter-for-approved-20261015` in `../river-oaks-landing-enter`, from main `7a3b8bcf`.
- **Request:** Val, 2026-10-15: "if the player is already logged in and has access they should not see a join
  waitlist button, it should just say 'Enter River Oaks'".

## Change

- `landing-page/access.js` (new):
  - `accessLabel()` asks `/api/waitlist/status` on the same origin, the game's own check on load. It returns
    **Enter River Oaks** only for `status: "approved"`.
  - A signed-out 401, any other status, or a network or JSON failure keeps **Join the waitlist**.
- `applyPlayLabel(document, label)` relabels all six play links: the hero, and the one inside each of the five
  detail panels' templates, which are cloned only when opened.
- `landing-page/index.html` wraps each label in `.play-label` and loads `entry.js` as a module, which is deferred
  as before. `scripts/build_landing_page.js` copies `access.js`.
- The links still go to `/play`. Only the label changes; the game's own gate decides entry.

Note: `/api/waitlist/status` records a waitlist request for any signed-in account (`waitlist.request`). The game
already calls it on load, and an account can only be signed in by having visited `/play`, so the landing page adds
no new requests in practice.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/landing-access.test.js`, written first | Failed (no module), then failed again after widening to all six links; now 3/3 |
| `pnpm run build` | Passed; the landing copy includes `access.js`; `check-access-entry`: 7 files, all served before sign-in |
| Built page in Chromium, `/api/waitlist/status` stubbed | Approved: hero and opened panel read "Enter River Oaks". Signed out (401): both read "Join the waitlist". No page errors. |
