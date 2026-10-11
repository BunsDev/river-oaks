# Workplace first slice (#214)

**Status:** delivered by #227 (merge `a13c4e4`); default off.  
**Owner:** Claude session `river-oaks-55` (task `workplace-slice`).  
**Scope source:** [#216 review](https://github.com/BunsDev/river-oaks/issues/216#issuecomment-6107482698) by `river-oaks-29` (`docs/superpowers/plans/workplace-2026-10-11/review-2026-10-11.md` on #222).  
**Baseline:** `main` at `eb62862`.

## Objective

One fixture companion, one scoped grant, one bounded fixture `event_plan` task, one private draft with an execution receipt, one deduplicated in-app status, a measured graybox on a labeled fixture site, and an accessible panel. Draft only: nothing is published, invited, sent or paid for.

Flags (both default off): `RIVER_OAKS_WORKPLACE=1` on the service is the kill switch; `VITE_WORKPLACE=true` on the client only shows or hides the panel. With the server flag off, `/api/workplace/*` returns 404. Stored workplace keys (`{ns}:workplace:v1:*`) stay in Redis and remain readable when the flag is turned back on.

## What changed

| Area | Files | Behavior |
| --- | --- | --- |
| Contract (#217) | `preview/src/workplace-contract.js` | Strict per-action bodies (unknown actions/fields fail closed), brief and plan validators, limits, and `companionPresentation` (presence, task and health kept separate) |
| Authority and execution (#217, #219) | `server/workplace.js`, `server/workplace-api.js` | Per-owner document with compare-and-set revision (memory `Map` or Redis Lua). Owner comes from the authenticated session only. One scoped, expiring, revocable `event_plan` grant; revocation bumps the revision and cancels queued, paused and running work. Execution is four atomic steps driven by a service timer or by the owner's next read (serverless-safe). Each step rechecks the grant and revision. A step unclaimed past its 10 s lease counts as a lost runner; recovery runs at most 3 times, then the task fails closed (`worker_lost`). Limits: 3 turns, 5 read-only tool calls, 120 s, 3 artifacts of at most 256 KiB, 30-day retention (a code default in `WORKPLACE_LIMITS`; not runtime-configurable) |
| Routes | `server/app.js`, `server/distributed-app.js`, `server/town.js`, `server/world-gateway.js`, `server/redis-backend.js`, `server/redis-security.js`, `server/vercel-routing.js`, `vercel.json`, `server/world.js`, `server/redis-room.js` | `/api/workplace/<action>` through `authorized()` (session, waitlist, ban, origin, CSRF) on both servers. Separate write rate limit. Public place list added to both world implementations |
| Room (#218) | `preview/src/workplace-room.js`, `preview/e2e/fixtures/workplace.*`, `docs/level-design/workplace-coworking-fixture/avatar-envelope.json` | "Coworking studio (fixture)": 9 × 7 m, `ROOM_HEIGHT` 3.9 m, 1.7 m door, two stations with approach, seat and exit sockets, and a review table. Clearance comes from all 22 shared appearances measured in Chromium. Widest body is 1.01 m (half-width 0.505); widest turning circle is 0.888 m (`jevica-beast`), which the 1.8 m lane fits. Exclusive, expiring station leases; the public occupancy projection is `occupied`/`mine` only |
| Panel (#220) | `preview/src/workplace-ui.js`, `preview/src/workplace.css`, `preview/src/multiplayer-client.js` | Mounted after Groups in the People roster. Covers companion name, the neutral offer (help / "not tonight" / no thanks, with no penalty), a plain-language permission card with grant/revoke, a keyboard brief, step status, pause/resume/cancel, inert draft view with a receipt of what actually ran, delete, and one announcement per notice |

## Checks and results

See "Verification" in the PR for exact commands and counts at the final head.

## Gaps and dispositions

- **Not tested:** player walk-in inside the district (deferred until Val picks a site), mobile and lower-tier devices, live WorkOS, Unreal, human screen-reader or touch review, and uncoached player sessions (Val, before any enablement).
- **Deferred by #216:** event publication from a draft, Favor story beats and god embodiment, remote providers and spend, final art and the 8-occupant envelope, hardware budgets.
- **Durability claim:** only what the tests show. A draft survives browser reload and a Redis gateway replacement in the tested configuration. No outage-durability claim.
- **Frame time:** the graybox fixture's numbers are CPU submit time in headless Metal Chromium. They are not a device budget measurement.
- **Retention default (30 days):** a code default, not an environment setting. Val decides it before hosted enablement.

## Next step

Delivered: #227 merged as `a13c4e4` with 11/11 hosted checks on `f35958a`, closing #217–#220. The #221 evidence, the #214 tracker and the follow-up PRs belong to `river-oaks-c2`.
