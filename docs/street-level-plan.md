# River Oaks District street-level implementation

Confirmed scope: River Oaks District at Westheimer and Westcreek, using the bundled 254 × 290 m footprint and 30 storefronts.

- [x] Preserve the latest district artwork and native 5.8 validation changes in the isolated delivery worktree.
- [x] Remove orbit, overview, street-closeup and hover-moped entry points and runtime camera controls.
- [x] Start directly on foot; keep shop arrivals and reloads in walking mode.
- [x] Put distance-ranked nearby people and conversations ahead of shop navigation; retire the economic laboratory from the visitor interface.
- [x] Verify street controls, conversations, closing/reopening dialogue, reload, and mobile layout.
- [x] Replace the native residential manifest/map with the shopping district and a bounded walking pawn.
- [x] Run unit tests, native builds/tests, secret checks, independent review and hosted checks before delivery.

Visual direction: retain the existing TypeSafe pink, graphite and silver artwork and system typography. The main interaction is a nearby person's name, distance, and “Say hello” action. Keep the canvas visible; shop directory, environment settings and community activities remain secondary. No new scene or camera mode is introduced.

## Verification

The [acceptance report](../data/reports/street-level-acceptance.json) records 67 Python tests, 87 JavaScript tests, 18 live browser checks and eight native automation tests. Editor and Game targets build on UE5.8.2. The new district map saves and reopens with one global post-process volume. The native runtime loaded 39 roads/paths, nine buildings and four tree points, displayed the walking HUD and exited zero.

Browser checks cover actual movement, eye height, absence of alternate views, nearby keyboard focus, conversation topics, E-to-talk, closing/reopening, store arrival, reload and mobile layout. Native smoke evidence covers map load, pawn/HUD startup and clean exit; full native input/collision acceptance remains unverified. Native people retain the marker backend and a basic proximity greeting; the clothed characters and topic-based conversations run in the browser.

Local artifacts: `/tmp/river-oaks-street-native-build.log`, `/tmp/river-oaks-street-game-build.log`, `/tmp/river-oaks-street-bootstrap.log`, `/tmp/river-oaks-street-engine-tests/index.json`, and `/tmp/river-oaks-street-runtime.log`. Desktop/mobile screenshots are in the canonical checkout’s ignored `output/playwright/street-level-*.png`.
