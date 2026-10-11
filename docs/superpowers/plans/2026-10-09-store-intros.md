# First-visit store camera sequences

User chose an in-world camera sequence using the actual store. Worktree:
`river-oaks-harry-winston-20261009`, branch `codex/harry-winston-reference-20261009`.
Existing Harry Winston edits remain owned by the preceding task.

## Objective
On a server-confirmed first arrival inside a public store, play a six-second
storefront/interior camera sequence. Skip button and Escape return control;
reduced motion uses a static welcome. Account/world/store markers are private,
atomic and durable with Redis. Claiming an intro consumes it, including skipped
or interrupted visits. Camera motion never changes authoritative player position.
Failures leave gameplay usable. Homes are excluded.

## Owned files
New store-intro director/UI/CSS and behavioral tests; main render integration;
private intro claims in profiles storage/API and both gateways; multiplayer request
adapter; focused browser journey. No new assets or paid services.

## Checks and status
- [x] Director/camera and memory/Redis/API behavioral regressions
- [x] Browser first visit, skip, replay suppression, reduced motion and movement
- [x] Core verification and diff review
- [x] Document exact results and remaining acceptance limits

No commit, merge, deployment or native implementation authorized.

## Implementation and verification evidence

- `preview/src/store-intro.js`: bounded camera director, server claim, stale-response
  fence, six-second two-shot sequence, cancellation and camera restoration.
- `preview/src/store-intro-ui.js` / `.css`: modal Skip/Escape, static reduced-motion
  welcome, HUD suppression, text-safe store name and walking focus restoration.
- `preview/src/main.js` / `multiplayer-client.js`: server snapshot room detection,
  account/world claim request, walking halt while shared town continues ticking.
- `server/profiles.js` / `profile-api.js`, `app.js`, `distributed-app.js`: private
  account/world/store claims. Redis Lua claims are atomic and survive gateway
  replacement; the in-memory development backend lasts for the server lifetime.
  Existing authentication, waitlist, CSRF and write limits remain in effect.
  Claims are presentation preferences, not proof of visited places or rewards.
  Bounded to 512 intro markers per account and 10,000 accounts; hitting the cap
  suppresses further intros. No markers appear in public profiles.
- `preview/e2e/store-intro.js` is registered in the default experience suite.
  `storefront-threshold.js` uses the actual Skip button during its collision route.

Commands run in this worktree:

1. `node --test preview/tests/store-intro.test.js`: 5 passed, zero skipped.
   Tests were observed failing before implementation, including presentation-error
   recovery. Covers stale claims, eligibility loss, world changes, repeat claims,
   reduced motion, natural completion, skip and restoration.
2. `REDIS_URL=redis://127.0.0.1:6398 node --test server/tests/store-intro.test.js server/tests/profiles.test.js server/tests/profile-api.test.js server/tests/profile-gateway.test.js`:
   7 passed, zero skipped, against an owned loopback Redis with persistence disabled.
   Covers concurrent claims, private fields, accounts/worlds, gateway replacement,
   unauthenticated and CSRF rejection. The new 512-marker bound was then checked
   with the same isolated service: `node --test server/tests/store-intro.test.js`
   with that REDIS_URL, 3 passed, zero skipped. No production service or FLUSHDB.
3. `RIVER_OAKS_SHARED_JOURNEY=storefront-threshold RIVER_OAKS_SHARED_REPORT=harry-winston-threshold-20261009.json npm run test:shared -- required`:
   passed, 21 keyboard/drag traversal legs, peer-observed, across Harry Winston,
   Hermes, Vince and Steak 48. This is the final source including cutscenes.
4. `npm run verify`: passed on final implementation. Agent 17; preview 2,513
   passed / 1 skipped; server 278 passed / 103 skipped; desktop 9; Python 141
   passed / 2 warnings; build, format, lint and secret gate passed. Core deliberately
   excludes most Redis cases, browser, native and live-auth acceptance. Its synthetic
   offline demo's expected blocked exit is part of the existing gate contract.
5. `git diff --check`: passed.

Browser runs use the real local fixture town and Apple M3 Max / ANGLE Metal,
1440 x 1000. Initial harness failures came from issuing consecutive directory/
doorway travel within the existing one-second server cooldown. The harness now
honors that cooldown and verifies the destination before proceeding. Production
travel rules were not relaxed. Full playback passed with actual facade and room;
final repeat result is recorded below after its runner completes.

## Acceptance limits and delivery

This is the web runtime. No native cutscene, deployment, live WorkOS, full Redis
suite, hosted CI matrix, target-device performance or human accessibility claim.
Harry Winston exterior/interior shots have been inspected; other stores use the
same geometry-derived framing and have not all been individually art-directed.
The actual rooms remain fictional interpretations of store interiors.

The Harry Winston photographic-fidelity task remains open at the limits in
`docs/level-design/harry-winston/reference-scene-comparison.md`; cutscene success
is not pixel-perfect storefront, vegetation or topographic proof.

No commit/push/merge/deployment performed. Retain this worktree and its undelivered
edits. Next delivery step: user visual review and integration with current main;
the sign-in modernization remains separately in `river-oaks-signin-review-20261009`.


## Final playback receipt

`RIVER_OAKS_E2E_REPORT=store-intro-20261009.json npm run test:experience -- store-intro`
passed on the final implementation: 11 checks, zero page errors. Verifies actual
exterior/interior camera displacement without player displacement, Escape, walking
recovery, repeat entry and reload suppression, reduced motion, and natural completion.
Receipt: `data/reports/store-intro-20261009.json`.
Frames: `output/playwright/store-intro-exterior.png` and
`output/playwright/store-intro-interior.png`. Both inspected; no generic HUD remains
behind the cinematic caption. The isolated Redis process was shut down after checks.
