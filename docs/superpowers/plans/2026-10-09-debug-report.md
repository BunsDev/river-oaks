# Report a problem: research-grade debug reports

## Objective and authority

The user asked for a debug button that gathers research-grade debug details and sends them, to help patch broken issues. Branch `feat/debug-report` on `origin/main` `397733a`, worktree `.worktrees/river-oaks/debug-report`.

Files owned:
- **Client:** `preview/src/debug-report.js`, `debug-report-ui.js`, `debug-report.css`; the wiring in `access-entry.js`, `main.js`, `rail-navigation.js`, `debug-tools.js`, `index.html`, `access-gate.css`, `hud-glass.css` and `vite.config.js`
- **Server:** `debug-reports.js`, `debug-report-routes.js`, and their mounting in `app.js`, `distributed-app.js`, `town.js` and `world-gateway.js`
- **Production routing:** `vercel.json`, `server/vercel-routing.js`
- **Tests:** `preview/tests/debug-report.test.js`, `server/tests/debug-reports.test.js`, `preview/e2e/report-problem.js`; the proxy in `server/tests/browser-fixture.js`
- **Docs:** `docs/debug-reports.md`

## Design

See `docs/debug-reports.md`.
- **Collectors** start with the sign-in page:
  - errors, rejections, resource failures, console errors and warnings
  - failed or slow `fetch` requests, long tasks, context loss
  - interaction breadcrumbs, frame times from the game loop
- **Sections** the running game registers: renderer, scene and game state. A section that throws is recorded in `sourceErrors` rather than losing the report.
- **Redaction** covers emails, account ids, bearer and JWT tokens, secret query values and long token runs. URLs keep only safe query keys.
- **Dialog:** describe, preview, Copy (Markdown summary and JSON), Download (JSON) or Send, with an optional picture. Focus returns to the opener.
- **Server:** a bounded store (50 reports, 30 days) with Redis and memory versions; signed-in senders with origin, CSRF and rate checks; an admin list and download.
- **Production routing:** the download uses a query id (`/api/debug-reports/get?id=`) because the Vercel router allows exact paths only.

## Checks

- [x] Unit: redaction (emails, ids, bearer and JWT tokens, secret queries; commits kept), URL sanitising, frame statistics, scene census, Markdown summary.
- [x] Server, against a real local server:
  - envelope validation and store bounds and expiry
  - 401, 403 (CSRF or origin), 415, 400, 413, 405 and 429
  - admin-only list and download
  - the Redis store test is skipped without `REDIS_URL`
- [x] Browser journey `report-problem`: 29 checks. It covers:
  - capture of the planted console error, failed request and page error
  - redaction of an email, account id, invite code, token and CSRF value
  - download with a picture under the limit, Copy's Markdown, Send accepted by the server
  - a player refused the report list, focus returning to the opener
  - the Commands palette and F3 panel entry points
- [x] Screens: the sign-in footer link and the dialog on desktop and phone (signed out: Copy and Download only).
- [x] `npm test` 2526 pass; `npm run test:server` 287 pass (104 Redis-only skips); `npm run build`.
- [x] email-access (production build): layout at 4 sizes and the signed-out report.
- [x] Secret scan clean.
- [x] Experience journeys passed: report-problem, rail-navigation, debug-tools, contextual-first-visit, experience.
- [x] `npm run verify` (core) passed (receipt `.runtime/agent/core.json`).

## Found and fixed during verification

- **The sign-in page locked everyone out in the production build.**
  - Vite split the collector into its own `debug-report-*` chunk, and the server's game-asset gate allows only `index-*` and `preload-helper-*` before approval.
  - So the sign-in page's import returned 403 and the page never loaded.
  - `protectedGameAsset` now also allows `debug-report*` (no game code); lookalikes stay gated.
  - The email-access test now opens the report signed out on the production build. It fails with the old rule and passes with the fix.
- **The secret scanner flagged fake secrets in the journey;** they were replaced with low-entropy probe values.
- **JWT redaction gap:** a JWT's dot-separated segments slipped past the long-token rule, so a JWT pattern was added.

## Limits

- The admin list is covered by server tests, not the browser fixture, which has no admins.
- Not verified: the Redis store against live Redis (CI's Redis lane runs it), Safari or Firefox, and the packaged desktop app.
