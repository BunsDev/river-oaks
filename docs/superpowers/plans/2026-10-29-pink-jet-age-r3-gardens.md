# Pink Jet-Age R3 slice 1: opt-in Pink Jet-Age materials for the Gardens campus

- **Issue:** #741 (package R3 under epic #738), stacked on R4 #753
- **Task id:** `pink-jet-age-r3-gardens-optin` (live register)
- **Owner:** `claude:cody-pja-r3-20261029`
- **Branch:** `feat/pink-jet-age-r3-gardens-optin-20261029`, from
  `origin/feat/pink-jet-age-r4-live-optin-20261028` at `c1f937fb`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r3`
- **Authorization:** implement, verify, commit signed, push and open a draft PR based on
  the R4 branch. Do not mark it ready or land it.

## Objective

The first reviewable slice of #741: one tower entrance, the public floor and the B12
bridge read in the Pink Jet-Age palette on opt-in, using the R1 roles and R4's live
preference. Render-only. Classic stays byte-for-byte unchanged, and nothing in the #741
source contract moves: storeys 6/7/6, roofs and caps, B12 23 m / B23 15 m spans, 3 m
clear, slab, guards, cores, suite and level IDs, terrace doors, P1-P9, promenade, IPIC
party wall, no extra bridge, no lift change, no lease change.

## Design

- **One table.** `preview/src/garden-campus-kit-finish.js` `CAMPUS_KIT_FINISHES`, keyed
  by the catalog's finish names. Per finish it lists field overrides for the campus
  material table (`campus`), the hardware trim split (`trim`), the emerald-cut uniforms
  (`emerald`), the fit-out (`fitout`) and the ceilings (`ceiling`). Classic is empty.
  The option is `kitFinish`, because "finish" in `garden-campus*.js` already means the
  #511 geometry pass (`garden-campus-finish.js` `FINISH`) and the batch keys.
- **Role mapping (Pink Jet-Age).**

  | Campus material (classic) | Parts | Pink Jet-Age |
  | --- | --- | --- |
  | `slab` `#d9d2c3` | floor bands at every slab edge, skywalk decks | ivory `#F7F1E8` |
  | `stone` limestone `#fff5df` | slab bands, plinths, parapets, headhouses, roof and bridge floors, planters | ivory `#F7F1E8` |
  | `core` `#b9ab94` | lift and stair shafts, solid panels | warm shaded ivory `#eadbd0` |
  | `bronze` `#8a6a45` metal .75 | mullions, fins, jambs, caps, troughs, legs | satin chrome `#BCC5C8` per instance (material white, metal .35, rough .35) |
  | `bronze` trims (same batch) | skywalk and terrace rails, parapet copings, canopy edges, café fascia | TypeSafe pink `#F486A1` per instance |
  | `timber` `#8c7660` | soffits, canopies, decks, pergola, bench tops | pale sand `#e8d9cc` |
  | `glass` `#fbe4eb`, opacity .28 | curtain wall | lifted mint `#e3f3ef`, opacity .28 unchanged |
  | `guard` `#fdf1f5`, opacity .16 | glass guards | `#f1faf8`, opacity unchanged |
  | `planting` `#4f6b3c` | café roof bed | garden `#4A6A55` |
  | `interior` `#e6dfd2` | floor finish | `#efe7dd` |
  | `partition` `#ece6da` | suite walls | ivory `#F7F1E8` |
  | `door` `#9a7350` | suite door leaves | pink `#F486A1`, rough .5 |
  | emerald uniforms | collet / lip and warmth / low facets | chrome / ivory / pink (source and cache key unchanged) |
  | fit-out walnut, oak, frame, fabric, stone | desks, tables, legs, seats, counters | `#dccbb9`, `#eadfd2`, chrome, blush `#f2c4cf`, ivory |
  | ceiling `#f2eee6` | plaster soffits | ivory colour and emissive, same .22 bounce |
  | unchanged | lawn, paving, water, soil, luminaires, canopy inlay, desk screens, foliage, trunks | classic |

- **Trims without a new batch.** The rails, copings, canopy edges and fascia are already
  boxes in the `bronze` batch. A `trim()` helper records their indices; under a finish with
  a `trim` role the batch gets per-instance colours. Classic sets none, so its mesh is
  unchanged. Instance counts, matrices, draw calls and `userData.counts` are the same.
- **Emerald cut.** `applyEmeraldCut(material, tint)` takes the three colours as uniform
  values. The GLSL text is the same under every finish, so `campus-emerald-cut-v3` stays
  honest (tested by compiling both against three's physical shader).
- **Threading.** `main.js` already reads `readFinishPreference()` (R4) as `cityKitFinish`.
  It now passes it to `buildDistrictBuildings(data, { kitFinish })`, which passes it to
  `buildGardenCampus`, `buildGardenCampusFitout` and `buildCampusCeilings`. Unknown,
  malformed or non-string values read as classic (`campusKitFinishName`); nothing throws.
  The render-audit debug state reports `finish.campus`.
- **Palette module.** `PINK_JET_AGE` moved to `shared/city-kit/pink-jet-age.js` and is
  re-exported by the catalog, so the eagerly built campus imports six colours, not the kit
  catalog.
- **R9 runner.** `pink-jet-age-routes-plan.mjs` `LIVE_FINISHES` is now every catalog finish,
  and `districtPath(finish)` puts `?finish=` on the audited page (always explicit, so a
  stored choice cannot leak into a classic capture). The runner refuses to write a report
  unless the campus root actually drew the requested finish and records it as
  `campusFinish`.

## Checks

All runs on base `c1f937fb` plus this uncommitted diff (`dirty: true` in every receipt).

- **Classic identity probe.** Built the campus, fit-out and ceilings from the base files
  and from this branch, compared every mesh's material fields, instance count and
  instance-matrix hash: identical for classic. Pink: identical names, counts and matrices.
- **Focused tests.** `node --test preview/tests/garden-campus-kit-finish.test.js
  preview/tests/pink-jet-age-routes.test.js` 16/16. With every `garden-campus-*`,
  `kit-finish-live`, `district` and `city-kit` test: 127/127 and 40/40.
- **`pnpm run verify`, first run** (started before the colour tune below, so not the final
  tree): agent, preview, server, desktop, build and Python all passed; `secrets` failed
  with one gitleaks finding (redacted). The likely cause was a test asserting a
  `key` equal to a quoted shader-program name; the assertion now uses a regex.
- **`pnpm run verify`, final tree** (source as committed; this ledger was edited after it):
  `core: passed`. Agent 289/289, preview 4364 pass / 1 skip of 4365, server 1077 pass /
  283 skip (Redis, as core permits) of 1360, desktop 127 pass / 5 skip, Python 170 passed,
  build passed, gitleaks "no leaks found". The local "Stack rehearsal" flake did not
  occur.
- **Browser, Route A (Gardens), under the browser lock** (`caffeinate -s node
  scripts/browser-lock.mjs ... node preview/e2e/pink-jet-age-routes.mjs`), 1280x800,
  graphics sharp, the eight `a*` cameras. Outputs in
  `.runtime/pink-jet-age-r3/20261029T1412Z/`:
  - `classic/` and `pink/`: day, dusk and night, 24 views each. Both reports passed,
    with `campusFinish` matching the request.
  - `pink-v2/`: after the tune (warmer core `#eadbd0`, hardware metalness .35, lighter
    seats `#f2c4cf`), a02, a03, a04, a05 and a07 at day and dusk, 10 views, passed.
  - Draw calls are identical in 21 of 24 views. The rest differ by +1 to +24 calls and
    +616 to +9,268 triangles, which come from R4's Commons rounded forms seen in the
    distance (a01 arrival, a05/a06 far field). The campus geometry is identical by test.
- **Visual read (by the agent, not a human review).** Pink stays on rails, copings,
  canopy edges, the café fascia, suite doors and seats. It does not flood anything; the
  test measures pink at under 5% of the opaque box surface. The first pass made the core and
  hardware read cold and grey-blue (sky reflection at metalness .6) and the seats deep
  mauve, so v2 tuned all three.

## Gaps and next step

- **Lift controls.** No lift door, frame or control is modelled. The core is a plain box
  under both finishes, so "readable lift controls" needs geometry within the circulation
  contract, which is a later slice.
- **Not done in this slice:** rounded forms, the crowns, roof-garden retrofit, and the
  other two towers' detail. Also not done: low-tier fallback captures, the
  garden-campus-traversal/office/suite journeys, and human visual and accessibility
  review.
- **For Val's judgement:**
  - Under mint glass and chrome the towers read cooler and whiter than classic's warm
    blush, and the mullion rhythm is weaker against pale glass.
  - The headhouse caps turn sky-grey chrome.
  - The pergola and terrace timber go nearly white.
- **Next:** Val's visual judgement on the v2 palette, then the T1 entrance and B12 rounded
  details behind the finish.
