# Workplace: scheduled sweep on Vercel (#221 gap)

**Status:** implemented on `fix/workplace-vercel-sweep`, which is stacked on `fix/workplace-room-envelope` (PR #236).
**Owner:** Claude session `river-oaks-c2` (task `workplace-vercel-sweep`).
**Source:** the gap left by #235. A serverless function can't keep a timer, so on Vercel an orphaned task waited for its owner.

## Changes

- `createWorkplace().sweep({drain, budgetMs})`. A drain steps every overdue task to completion, owners in parallel, and stops before the budget would be exceeded. Long-lived timer hosts still hand each task back to their timers.
- `GET /api/workplace-sweep` on the Redis gateway (`server/distributed-app.js`):
  - It exists only with the workplace on and `CRON_SECRET` configured, and returns 404 otherwise.
  - It requires `Authorization: Bearer <CRON_SECRET>`, compared in constant time, and returns 401 otherwise.
  - It drains with a 20 s budget.
- `vercel.json` gains `crons` (`/api/workplace-sweep`, every minute) and the rewrite, and `server/vercel-routing.js` gains the allowlist entry. I checked the team plan read-only with `vercel api /v2/teams/<org>`, and it is Pro, which allows per-minute crons.
- `api/server.js` answers the route with 404 before starting the backend while `RIVER_OAKS_WORKPLACE` is off.
- `.env.example` lists `CRON_SECRET` with no value. The operations doc describes the setup.

## Delivery note

**The owner must set `CRON_SECRET` in the Vercel project's environment variables before enabling the workplace there.** The agent does not change Vercel settings.

## Checks

- `server/tests/cron-workplace.test.js`: 5 cases, all of which failed before the change:
  - a drain finishing three orphaned owners exactly once
  - the budget stopping a drain
  - the Vercel config
  - the flag-off entry short-circuit
  - the live gateway route: 404 without a secret, 401 with a wrong one, POST refused, and a drain that finishes the task
- Mutation check:
  - Without the secret check, 1 case fails.
  - Without the drain loop, 2 cases fail.
  - Without the short-circuit, 1 case fails.
- `REDIS_URL=… node --test server/tests/*.test.js`: 485 pass, 0 skipped.
- `node --test preview/tests/*.test.js`: 2596 pass, 1 skip that was already there.
- `pnpm run verify`: core passed.

## Gaps

- Not exercised on a real Vercel deployment. Cron calls only run on production deployments.
- One drain call handles at most 50 owners. A larger backlog waits for later calls.
