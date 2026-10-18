# Penthouse graybox lighting pass (noon and dusk, no glass glints)

- **Task:** `penthouse-lighting-20261015` (live register), owner `claude:penthouse-readiness (e5bbe058)`.
- **Branch / worktree:** `feat/penthouse-lighting-20261015` in `../river-oaks-penthouse-lighting`, from
  `origin/main` `19d11250`.
- **Source:** item 1 of the "River Oaks penthouse & waitlist handoff" (2026-10-15).

## Objective

Tune the penthouse graybox's interior lighting for noon and dusk using the existing atmosphere clock,
remove the small light glints on the glass, and prove both with matched before/after captures of the six
fixed office views (V) at noon and at dusk.

## Diagnosis (base `19d11250`, measured in the live office)

1. **Glints** are the five office point lights' direct specular on near-mirror glass: the curtain wall
   (`thinStorefrontGlass`, metalness 1, roughness 0.055) and the guard and terrace-rail glass (roughness
   0.1). Zeroing direct specular on those two materials alone removed every one.
2. **The interior did not follow the clock.** Lamps were constant (70/70/60/60/45 at 1.0 to 1.6 m under the
   ceiling, so they hot-spotted it), and noon and dusk read almost the same.
3. **The floor was blown out by the sky, not the sun.** Probing pixels in the office: switching the sun off
   changed nothing (once the shell cast shadows), the office lamps mostly lit the ceiling (206 to 103 with
   them off), and the scene environment lit the floor (226 to 166 with it off). Image lighting has no
   occlusion, so a roofed room saw the whole sky. In three r186 a material's `envMapIntensity` only applies
   when the material has its own `envMap`; otherwise `scene.environmentIntensity` wins.
4. **No office mesh cast or received the sun's shadow**, so sun reached every floor under the roof.

## Change

- `office-penthouse-graybox.js`: `withoutLightGlints` drops direct specular on the penthouse glass after
  `aomap_fragment` (own program key; district storefront glass unchanged). Opaque meshes receive the sun's
  shadow; the roof, solid walls, mezzanine, desks, bookcases and curtain-wall frames cast it (ten draws).
  Five lamps (four pendants 4.5 m up, a reading lamp 1.7 m above the mezzanine) replace the ceiling-hugging
  lights. `relight(atmosphere, environment)` sets lamps to 60 % neutral white through the day and full warm
  white at dusk, and gives interior finishes the environment at 45 % of the scene's intensity (terrace
  floor excluded). Five lamps as before, so the light pool and the phone path are unchanged in shape.
- `atmosphere.js`: exports `twilight` (the existing dawn/dusk blend, 0 through the day, 1 at its lowest).
- `main.js` / `office-world-presentation.js` / `office-world-scene.js`: the visit reads the street's current
  atmosphere every frame, relights the office, and copies the lamps into the light pool on the phone path.
  The number of lights never changes with the time of day.
- `preview/e2e/office-penthouse-lighting.mjs`: the capture harness (six views x noon 12:00 and dusk 18:30,
  Sharpest quality, 1280x800 DPR 1, Metal, office chrome hidden per capture, source hashes in the receipt).

## Checks

| Check | Result |
| --- | --- |
| New graybox, atmosphere and visit regressions on the base | red (missing export; no shadow flags; lamps 1.0 m under the ceiling; lamps did not follow the clock) |
| `node --test preview/tests/office-penthouse-graybox.test.js preview/tests/atmosphere.test.js` | 17/17 |
| `node --test preview/tests/office-skyline.test.js` | 18/18 (new: lamps follow the clock in the live and phone paths, light count fixed) |
| `node preview/e2e/office-penthouse-lighting.mjs before` on the unmodified worktree (`19d11250`) | passed 16 checks, 12 captures; load 13 |
| `node preview/e2e/office-penthouse-lighting.mjs after` | passed 16 checks, 12 captures; load 37; cameras identical to `before` |
| `node --test preview/tests/office-*.test.js preview/tests/atmosphere.test.js` | 131/131 |
| `pnpm run verify` (core) on the working tree over `19d11250` | passed: agent 112, preview 3348 + 1 skip, server 599 + 154 skips (Redis suites; no `REDIS_URL`), desktop 76, Python 141, build, Ruff, secrets |
| `node preview/e2e/office-penthouse-runner.mjs` (SwiftShader functional smoke) | passed 27 checks, no page errors, load 24 |
| Isolated-highlight count (spots of luma >= 240, <= 60 px, >= 25 above their ring), before → after | noon: overview 25 → 3, main floor 27 → 0, workstations 63 → 0, library 12 → 0, terrace 0 → 0, roof gardens 5 → 5; dusk: 6 → 3, 6 → 0, 7 → 0, 4 → 0, 0 → 0, 0 → 0. The three left in the overview are lamp highlights on the bronze guard rail and a chair edge, not glass; roof gardens' five are the district, identical before and after. |

Comparison sheets (before | after, same cameras): `docs/office-review/penthouse-lighting-noon.jpg` and
`docs/office-review/penthouse-lighting-dusk.jpg`. Full-resolution frames and both receipts:
`output/playwright/penthouse-lighting/{before,after}/` (ignored; archived with the task's evidence).

## Gaps

- Local Metal captures on this Mac. Not human visual acceptance, real-device or production evidence.
- Lamp levels and the 45 % sky share were tuned by eye in the graybox; final art (#362) will need its own
  pass with real materials.
- Perf: ten extra shadow-pass draws and relighting each frame; measured with the live-outlook A/B
  (`office-outlook-cost-20261015`).

## Next

Signed commit, PR and hosted CI; Val reviews the sheets. Landing waits for Val.
