# Pink Jet-Age R4 slice 1: opt-in live finish for Commons and Heights

- **Issue:** #742 (package R4 under epic #738)
- **Task id:** `pink-jet-age-r4-live-optin` (live register)
- **Owner:** `claude:cody-pja-r4-20261028`
- **Branch:** `feat/pink-jet-age-r4-live-optin-20261028`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r4`
- **Baseline head:** `e5cfada6` (fetched `origin/main` with R1 #749 and #751, 2026-10-28)
- **Authorization:** implement, verify, commit signed, push and open a draft PR. Do not mark it ready or land it.

## Objective

R1 made the Pink Jet-Age finish a render-only option of `buildCityKit`. This slice lets
the two live callers, Bayou Market Commons and Bayou Heights, render it on opt-in. The
default stays classic. Nothing changes on the server, protocol, authority, IDs, layout
or collision.

## Design

- **Preference.** `preview/src/render-quality.js` already owns the persisted graphics
  preference (`localStorage['river-oaks-graphics']`). It now adds
  `readFinishPreference()`. The URL `?finish=<name>` sets the finish for one load, and
  `?finish=classic` overrides a stored choice. Otherwise it reads
  `localStorage['river-oaks-finish']`, and with neither it is `classic`. Malformed
  values read as classic, and blocked storage or an unreadable address never throws.
  The reader does not import the catalog, so the main bundle stays unchanged.
- **Validation.** `shared/city-kit/catalog.js` gains `knownFinish(name)`, which returns
  the name when it is in `KIT_FINISHES` and `classic` otherwise. The lazily loaded
  scene builders call it, so an unknown well-formed name renders classic.
- **Wiring.** `main.js` reads the preference once. It passes the result through
  `createCommonsStream({finish})` to `buildEastGardenCommons(layout, {finish})` and on
  to `buildCityKit`. It also passes it through `createHeightsStream({finish})` to
  `buildHeightsNeighborhood(layout, plan, {finish})` and
  `buildHeightsLandscape(layout, {finish})`. A change takes a reload. There is no hot
  swap, so the existing chunk disposal is unchanged.
- **Non-kit materials.** The Commons pavilion and the Heights landmarks recolour through
  the kit slot each part plays. Ivory stone and canopy use `trim-ivory`, the fascia uses
  `trim-teal`, rails use `lamp-teal`, brass uses `metal-brass`, roofs use
  `trim-deep-teal`, brick uses `brick-umber` and glass uses `glass`. Under classic the
  slot table is empty, so the parameters are byte-identical. Out of scope, and
  documented in `docs/city-kit.md`: bayou water, banks, Heights Hall's lit clock faces,
  the Commons granite ramp, and the tree and planting models.
- **Diagnostics.** The development-only `window.__riverSpatialStream()` now reports
  `finish: {preference, commons, heights[]}` for browser evidence.

## Files owned

`preview/src/render-quality.js`, `preview/src/main.js`, `preview/src/commons-stream.js`,
`preview/src/heights-stream.js`, `preview/src/east-garden-commons.js`,
`preview/src/bayou-heights.js`, `shared/city-kit/catalog.js` (adds `knownFinish` only),
`preview/tests/kit-finish-live.test.js`, `docs/city-kit.md`, this ledger.

## Checks

| Check | Command | Result |
| --- | --- | --- |
| Focused regressions | `node --test preview/tests/kit-finish-live.test.js` (+ commons-stream, heights-stream, bayou-heights, bayou-market-commons, render-quality, city-kit, east-garden-commons) | see Results |
| Core gate | `pnpm run verify` | see Results |
| Matched live captures | `caffeinate -s node scripts/browser-lock.mjs pja-r4-capture -- node .runtime/pink-jet-age-r4/capture.mjs` | see Results |

## Results

- **Focused tests.** `kit-finish-live.test.js` passes 6/6. It covers: the default is
  classic; the opt-in reaches `buildCityKit` through both streams; unknown and
  malformed values read as classic; blocked storage does not throw; geometry outside
  the facade detail is unchanged; plan hashes and the world object (solids, collision)
  are untouched; the landmark slot mapping; and chunk estimates under every finish.
  With the commons-stream, heights-stream, typesafe-place, woodland-heights, studewood,
  bayou-terraces and bayou-heights suites the total is 79/79. An earlier run with
  render-quality, city-kit, bayou-market-commons and east-garden-commons passed 84/84.
- **Streaming estimates (found by the live capture).** In views of the Commons, the
  pink run held two Heights neighborhoods where classic held three. The rounded forms
  add up to about 14% geometry, and the stream counts measured bytes against its
  16 MiB ceiling. A headless measurement then showed TypeSafe Place north
  (2,436,864 B) and uptown (3,024,384 B) over their estimates under pink, and the
  Commons destination (3,251,548 B) over its 3 MiB. Each estimate is supposed to err
  high, because an estimate below the real size admits a chunk the ceiling then
  refuses. Review (Cody) made the estimates per finish, so classic streaming stays
  exactly as on main (2.25 MiB, 2.7 MiB and 3 MiB). Pink Jet-Age alone overrides them
  to 2.35 MiB, 2.9 MiB and 3.2 MiB (`HEIGHTS_FINISH_CHUNK_BYTES`,
  `COMMONS_DESTINATION_BYTES`). Regressions check that every finish stays under its own
  estimates and that classic's are unchanged. The smaller pink
  resident set near the Commons remains a real cost of the forms: more of Heights
  waits for room. That is a ceiling decision for R4 or R9, not this slice.
- **Core gate.** The first `pnpm run verify` failed one server test
  (`blocks-town.test.js` "lifting the block restores chat"). This change touches no
  server file, and the test passed 1/1 alone. The log is kept at
  `.runtime/pink-jet-age-r4/verify-1.log`. The rerun passed: tooling 289/289,
  preview 4347 + 1 skip, server 1077 + 283 Redis skips, desktop 127 + 5 skips,
  Python 170, secret guard clean.
- **Per-finish estimates (review).** Core verify passed again after the change: tooling
  289/289, preview 4348 + 1 skip, server 1077 + 283 Redis skips, desktop 127 + 5
  skips. The kit-finish, stream and neighborhood suites pass 71/71.
- **Matched live captures.** Run 1 used `typesafe-place-1` in Chromium 156 (Metal) on
  the uncommitted working tree on `e5cfada6`, before the estimate change, with load
  around 15. Seven fixed cameras were captured under classic and pink, plus an
  unknown-finish (`neon`) control. There were no page errors, and every view waited for
  stable streams. The debug hook reported `classic`, `pink-jet-age` and, for `neon`,
  a classic build. The `neon` census matched classic exactly: 1092 draws and 4,576,468
  triangles. In Heights views with the same resident set, pink added 1–6 draws and
  0.6–6k submitted triangles per frame. The Commons kit added 2 meshes and 2,080
  triangles. Images are under `.runtime/pink-jet-age-r4/<timestamp>/` (ignored).

## Gaps and next step

- No visual or human acceptance. The pink roof decks in the elevated Commons view
  read as large flat pink fields. They come from R1's slot table, not this slice, so
  Val should review them.
- The Heights Hall camera in run 1 was blocked by a street tree. The recapture on the
  committed head moves it.
- Browser journeys and `verify full` were not run. The opt-in leaves default rendering
  unchanged, including classic stream estimates.
- Next: draft PR, recapture on the committed head, then hand off for review. This
  task does not mark the PR ready or land it.
