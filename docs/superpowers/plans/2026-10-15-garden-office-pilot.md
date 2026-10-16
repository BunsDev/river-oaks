# Garden Office realism pilot (#416, parent #413)

## Objective and ownership

Make the private **Garden Office** World Studio template read as a real workplace
at player height: one desk/chair family, credible glazing, calibrated finishes and
a restrained light/planting sample. Keep reception, four workstations, meeting
room and kitchenette, the #414 route profile, v1 files and save/reopen. Garden
Office is a Studio template, not Jevica's office (#359).

Branch `feat/garden-office-416-20261015` in
`river-oaks-garden-office-416`, owner `claude:river-oaks-safe-edits (e9aa0185)`,
register task `garden-office-416`. Base `326506f7eaaa97db851f03537d3c7c93049ef799`
(origin/main at pickup, 2026-10-15). Coding scope: catalog records, renderer
forms, office recipe, compatibility and tests. Visual approval is a human/design
review and is not claimed here. No merge, deployment or asset publication.

## Decisions (Val, 2026-10-15)

- **Procedural forms behind v1.** The family is original geometry in the existing
  renderer, keyed by existing v1 kinds. No saved field changes, so no v2 document
  and no conversion: every v1 file opens unchanged and renders with the new forms.
  No GLB is produced, so there is no export/reimport step. Accepted side effect:
  `chair`, `glazing`, `pendant` and `plant` are shared kinds, so House, Boutique and
  Café pick up the new forms without layout changes; #418 owns their acceptance.
- **Floating desk lamps are fixed in the office recipe.** New Garden Office copies
  place lighting at ceiling height. Saved drafts keep their objects.

## Recorded baseline, before implementation

Source `326506f7`: `space-scene.js` sha256 `aaf992f5ea7147bd…`,
`space-templates.js` `b08dae042a9d1aff…`. Office profile v1 (#414): bounds
`[-12,-11,12,10]`, arrival `[0,-8.5]`, targets reception (0,-4), work area (-2,1),
meeting (3,1), kitchenette (-1,5); controller `studio-walking-v1`, radius 0.35 m,
eye 1.68 m.

Cost from the real renderer in Node (`.runtime/garden-office/baseline-cost.json`):
42 objects, 347 meshes, 1 line set, 31,618 triangles, 9 unique geometries,
19 materials. Chairs 9 × 8 meshes (6,048 triangles); desks 4 × 12 meshes (1,728).

Player-height captures: `preview/e2e/studio-office-stations.js` (new journey; six
stations × daylight/warm/evening, 1440×1000, Metal ANGLE, eye 1.68 m). Each station
stands on a profile target and looks at its role object. Run
`RIVER_OAKS_E2E_REPORT=garden-office-baseline.json pnpm run test:experience studio-office-stations`:
passed, 18 captures in `.runtime/garden-office/baseline/` (local-only).

Observed defects (baseline):

| ID | Defect | Where |
| --- | --- | --- |
| D1 | Desk "lamps" are ceiling pendants at 1.0 m, floating over desks with a rod to nothing | CAM-03 |
| D2 | Chairs are stretched boxes; leg thickness and rounding scale with the object | CAM-01/03/04 |
| D3 | One rounded unit cube is stretched per part: long tops look like pillows, thin parts flatten | CAM-03/04/05 |
| D4 | Linear pendant (1.8×0.35 m) becomes a giant flattened disc | CAM-04 |
| D5 | Concrete floor uses the outdoor paver texture | CAM-01/03/05 |
| D6 | Glazing reads as flat grey panels with plain stiles | CAM-01/04 |
| D7 | No ceiling; sky visible at player height (not addressed: overhead editing needs an open top) | all |
| D8 | Evening preset barely differs from daylight at these stations | evening set |
| D9 | Exit station looks out a 2 m doorless opening onto a bare ground plane (not addressed) | CAM-06 |

## Checks and evidence

### Slice 1: desk and chair family

New `preview/src/studio/space-furniture.js` draws each form inside a group that
cancels the editable root's width/height/depth scale, so parts are in metres:
rounded edges use `RoundedBoxGeometry` at true size and legs keep their section.
The root keeps its `(width,height,depth)` scale, so selection, the gizmo and the
existing silhouette, knee-space, material-ownership and disposal tests still apply.
`desk` (only the office uses it): 25 mm oak top, 40 mm charcoal legs, side rails, a
back modesty panel when legs exceed 0.45 m; the drawer pedestal is gone. `chair`
(all templates): turned 17 mm timber legs, seat frame, upholstered seat at
min(0.47 m, 55% of height), back leaning 8° kept inside the footprint. `table` keeps
its old form.

Red first, `node --test preview/tests/studio-garden-office.test.js` on unchanged code
(`.runtime/garden-office/slice1-red.txt`): "Tabletop is stretched 1.8,0.0684,0.8";
desk leg sections varied 0.033–0.132 m across sizes; pendants at 1 m.

### Slice 2: office lighting and pendants

Recipe: the four `desk-lamp-N` pendants at 1 m are replaced by `work-pendant-1/2`,
2.4 m linear pendants at 2.4 m over each desk row (three office pendants, all within
the renderer's four point lights). Pendant form: a footprint at least 2:1 draws an
80 mm linear body on two cables; otherwise an open round shade on one cord.

Focused suite after slices 1–2: 90 passed / 0 failed / 0 skipped. Cost
(`.runtime/garden-office/slice2-cost.json`): objects 42 → 40, meshes 347 → 338,
triangles 31,618 → 32,862 (+4%), unique geometries 9 → 16, materials 19 → 19.
Chairs 72 → 81 meshes; desks 48 → 32; pendants 20 → 18.

After captures, same journey and conditions: passed 2026-10-15 16:11 UTC, 18 captures
in `.runtime/garden-office/slice2/`. Observed: D1, D2, D4 fixed; D3 fixed for desks,
chairs and pendants (counter, table and cabinets still swell). New **D10**: the
linear pendant diffuser shared its bottom face with the body and flickered.
Brass reads dark bronze for the same reason glass reads grey (D6).

### Catalog records

`docs/design/garden-office/asset-manifest.json` follows the office-ipic packet
shape: id, version, v1 kind, source `procedural`, file, sha256, nominal size,
measured bounds (object frame, metres), axes/pivot, resize policy, material slots,
collision, approach, cost (mesh nodes, triangles), stage, availability and
permission (original geometry, no third-party source). `scripts/garden-office-manifest.mjs`
measures the forms from the real renderer; `--write` refreshes the file. The pilot
test fails whenever the records and the code disagree. No GLB exists, so there is
no export or reimport to check.

### Slice 3: reflections, sky fill and the D10 fix

Red first: "diffuser 0..0.006 overlaps body 0..0.045". The body now starts 6 mm up.
`viewport.js`: furnished spaces get a `RoomEnvironment` reflection map (PMREM,
created once, disposed with the viewport) and the viewport's own sky fill, which
had stayed at 2.5 for every preset (the cause of D8), now follows the preset.
Region documents keep reflections off and the sky at 2.5. Records refreshed: only
the source hash changed. Focused suite 92 / 0 / 0.

Captures 16:27 UTC (`.runtime/garden-office/slice3/`): D6 and D8 fixed, D10 gone.
New **D11**: at 0.55 / 0.45 reflections and full sky the reflection map lifted every
surface. Mean of a 7×7 patch, 0–255: daylight meeting wall 208 → 235, walnut table
107 → 150, floor 148 → 183 against the forms-only set.

### Slice 4: concrete floor, glazing frames and calibration

Red first: concrete still used the photographed `pavement_03` (Poly Haven, CC0)
running-bond paver texture; no `SPACE_LIGHT` table; office glazing white and no base
shoe. That texture cannot be recalibrated into interior concrete, and no download
was needed: concrete surfaces are now a plain polished material (`#96938b`,
roughness 0.5) and concrete floors draw saw-cut control joints every 4 m, 0.2 m clear
of the edges, as one line set. Floor-standing glazing (elevation 0, at least 2 m)
sits in an 80 mm base shoe; raised glazing such as the café display keeps its rail.
The office recipe gives all its glazing charcoal frames. A 1.2 m pane module was
dropped: it would centre a mullion on both meeting dividers, where the existing
"partitions show glazing through their broad faces" test looks through the glass.

`SPACE_LIGHT` (exported from `space-scene.js`, read by `viewport.js`) holds sun / sky
fill / reflections per preset; a test requires each to fall from daylight to evening.
Two measured passes:

| Daylight patch | forms only | pass 1 (sky 2.0, refl 0.30) | pass 2 (sky 1.7, refl 0.25) |
| --- | ---: | ---: | ---: |
| work-area wall | 210 | 218 | 214 |
| meeting wall | 208 | 225 | 221 |
| meeting table | 107 | 130 | 124 |
| concrete floor | 148 | 218 (old concrete colour) | 191 |

Final values: daylight 2.5 / 1.7 / 0.25, warm 2 / 1.45 / 0.2, evening 0.55 / 0.8 / 0.12.
The meeting room is brighter than before because its pendant now emits light (the
old recipe's four desk lamps took all four point lights). Evening walls 176–193.

Focused suite 95 / 0 / 0. Cost (`.runtime/garden-office/slice4-cost.json`): meshes 338
(base shoe replaces the bottom rail), line sets 1 → 2 (concrete joints), triangles
32,862, materials 19. Final captures 16:33 UTC in `.runtime/garden-office/slice5/`
(local-only); all four sets are on the review page.

Review page (private): https://claude.ai/artifact/QxWWoXxB9DMotJyQr77Xpf

### Slice 5: planting sample

Baseline plant (`.runtime/garden-office/plant-baseline.json`): a stretched unit pot and
nine sphere leaves, 2,832 triangles at every size, and 30.6% of horizontal sight lines
through the canopy band (55–90% of height, 8 directions × 8 heights × 7 offsets)
hitting foliage. Red first: "Planter is stretched 0.55,1.25,0.55".

`plant` (all templates) is now drawn in metres: tapered pot (32% of height, at most
0.42 m) with rim and soil, three stems, and three leaf clusters. Each cluster is one
mesh of flat, midribbed blades at the golden angle, pitched −10° to 60° and twisted up
to ±40° so the canopy does not read edge-on, gathered on the upper 70% of the stems.
Leaves per cluster scale from 30 to 50 with canopy height relative to width. A
double-sided leaf material is shared. The office recipe gives its pots terracotta.

Measured during design: flat blades alone reached only 25–34% coverage; adding pitch
range and twist 54–59%; the 1.6 m × 0.5 m case stayed at 42–45% until leaves moved up
the stems and density scaled. Final: 62–68% coverage at 696–936 triangles for a 0.55 ×
1.25 m floor plant, a 0.3 m café vase, a 0.6 m display plant and a 1.6 m × 0.5 m
planter; the test requires at least 50% and at most 1,000 triangles. New record
`studio-plant-potted` (9 meshes, 696 triangles). Focused suite 96 / 0 / 0.

Office cost against the baseline (`.runtime/garden-office/slice6-cost.json`): meshes
347 → 326, triangles 31,618 → 24,318, line sets 1 → 2, unique geometries 9 → 23,
materials 19 → 20. Plants 11,328 → 2,784 triangles.

Captures 16:47 UTC (`.runtime/garden-office/slice6/`, local-only): plants read as a
terracotta pot, bare stems and a leafy crown; the crown is narrow with pointed leaves
(a design-review question, not a defect). Review page now shows all five sets.

### Affected gates (2026-10-15, base 326506f7 + this patch, worktree unchanged by the run)

`.runtime/garden-office/gates/` (local-only):

- `pnpm run verify`: **core passed, 11/11 tasks**. Agent 111; preview 3,257 passed,
  1 skipped, 1 TODO; server 582 passed, 149 Redis skips; desktop 69; Python 141.
  Total **4,160 passed / 150 skipped / 1 TODO**. Includes `pnpm run build` and
  `pnpm run test:desktop`.
- `pnpm run test:experience world-studio`: **passed in 29.068 s, 0 page errors**
  (create, transform, undo, save/reopen, pick, export/import, walk, safe-edit
  rejection and repair; Garden Office renders with the new forms).
- `node desktop/studio-e2e.js`: **11/11** native checks, including save/reopen with the
  assessment sidecar and bare v1 export/import.
- Focused `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js`:
  96 / 0 / 0.

## Open defects and limits

- D3 remains for counters, tables and cabinets (outside the first family).
- D7 (no ceiling) and D9 (bare exterior) are outside this pilot.
- Not run: full Redis profile, hosted CI (pending on the PR), packaged builds,
  physical devices.
- Visual approval is a design/human review; automated captures are evidence, not
  approval. No device, packaged or accessibility acceptance is claimed.

## Next

Signed commit and draft PR (Val, 2026-10-15: push and open the draft once checks
pass; post the link to #413). Then design review of the captures and the recipe
destinations (#414 handoff), and #417 pilot acceptance. No merge.

## Continuation audit (2026-10-15)

Owner `codex-root-garden-office-audit-20261015`; branch
`test/garden-office-416-audit-20261015`, sibling `river-oaks-garden-office-audit`.
Base `bd37555ff32bc99fb5cddf1f1cf593d74e43a0ce`. PR #439 is merged
(`05a5e9fe`); #414 delivered through #427; #417's harness/fixes merged through
#452. Earlier counts above remain historical. No new merge/deploy authorization.

Audit scope: actual pilot source/manifest, valid-v1 resize compatibility, negative
imports, current browser/Electron edit/walk/reopen and matched runtime views.
Existing v1 mapping is retained; no new persisted fields, exports or conversion.
Files owned: metric furniture helper, its regression tests, manifest generator and
packet, this ledger. Other active worktrees and primary edits remain untouched.

Reproduced on base: a valid 0.1 × 0.1 × 4 m chair draws to local z=0.445 m
outside its ±0.05 m collision depth; 0.01 m plant/pendant details fall below ground.
Cause: fixed detail offsets/sections and unconstrained back lean. Rounded geometry
cache keys also alias nearby distinct sizes. Contract gap: generic manifest text
incorrectly says pendants block by elevation; glazing/finish assets are unrecorded.
Next: failing behavioral bounds tests, constrain details at source, measure records,
then focused/core/runtime checks and scoped visual review. Design destination and
human acceptance remain open; #417 closure is not a prerequisite for this package.

### Audit findings and fixes

- **Valid-v1 bounds:** reduced the detail offsets/sections only when the accepted
  dimensions cannot contain them; constrained chair-back lean by depth; exact
  metric geometry cache keys avoid sharing a larger shape after sub-mm resizing.
  No validator, collider, controller, template or persisted field changed.
- Independent review found two additional asymmetric limits: a narrow desk rear
  panel and the canopy at the linear pendant's exact 2:1 threshold. Regressions
  failed before each fix. Panel thickness now respects leg clearance and canopy
  radius respects its distance to the long edge. Reviewer reran **4,000 cases**
  (1,000 per kind), zero bounds failures, no remaining important findings.
- Eight measured records now include glazing, concrete and plaster; five furniture
  records advance their **asset metadata version to 2**, not the document version.
  Source/dependency SHA-256, metre bounds/pivots, resize policy, material slots,
  actual nominal collider polygons, geometry buffers/material counts and explicit
  `export: null` are recorded. There are no GLBs to reimport. Existing v1 kinds
  resolve in the renderer; unknown asset fields/URLs are rejected by closed v1.
- Negative import tests cover unknown versions/kinds/finishes, extra asset URLs,
  invalid sizing, malformed JSON, 161 objects and byte overflow. Accepted edited
  draft, profile, revision, saved data and undo recovery survive each rejection.
  Bare v1 import remains unassessed; no synthetic conversion is claimed.
- Four workstation side approaches now have real bidirectional movement tests,
  empty and with all chairs pushed back 0.4 m/deepened to 0.75 m. The first proposed
  cross-aisle line at north 1.0 m intersects a pulled-back chair; measured passage
  is at north 0.6 m. An obstruction in that passage correctly fails all four routes.
  This adds evidence, not new required profile targets or an accessibility claim.

### Current runtime and visual inspection

`data/reports/garden-office-audit-browser.json`: stations **22.214 s** (18 captures),
World Studio **45.059 s**, pilot journey **64.062 s**, all passed. Pilot journey has
13 checks including an actual four-destination out-and-return walk. Electron
`node scripts/browser-lock.mjs garden-office-native -- node desktop/studio-e2e.js`:
**11/11 passed**, development app, loopback identity. No provider key or paid call.

The 18 PNGs are `output/playwright/garden-office-<preset>-CAM-0N-<station>.png`.
Local paired review: `.runtime/garden-office-audit/review.html`; baseline is the
archived `326506f7` capture set (not recaptured or relabelled). Eye 1.68 m, page
1440×1000, stage 984×786, same station coordinates/yaw, perspective vertical FOV
45°, ACES tone mapping. Daylight/warm/evening are the existing presets; there is no
new saved "neutral" preset. Furnished scenes use the existing neutral room reflection.

Agent visual observations: CAM-03 has a thin oak top, charcoal frame, open knee
space, separate seat/back and ceiling-height pendant; CAM-04 has legible charcoal
stiles/base shoe and restrained plant canopy. CAM-01 preserves the entry and open
central aisle. CAM-02/05 show the original reception/kitchenette and corrected
loaded stone material from #452. Evening is visibly dimmer. No nominal-scale
regression observed against the merged pilot captures. Open roof and bare exterior
remain known limits D7/D9; counters/table remain outside this family. These are
agent observations, not Val's design approval or human accessibility acceptance.

Review requested from Val for visual treatment and unchanged required profile
points: arrival/exit (0,-8.5), reception (0,-4), work area (-2,1), meeting (3,1),
kitchenette (-1,5). Test-only workstation approaches: (-5,-1.4), (-3.4,-1.4),
(-5,1.9), (-3.4,1.9). All coordinates east/north metres. Await the review decision;
#417 full acceptance is not a prerequisite for handing off these assets.

### Verification receipts (continuation)

- Dependencies installed with frozen pnpm/uv locks. Doctor initially blocked only
  on missing `.venv`; after `uv sync --locked`, doctor passed.
- `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js`:
  **105 passed, 0 failed/skipped/TODO** on final code and tests.
- `.runtime/garden-office-audit/{bounds-red,review-red,contract-red}.txt` retain
  failures. `independent-review.json` records exact hashes and review disposition.
- `evidence-manifest.json` hashes source/interface files and each current capture.
- First `pnpm run verify`: 11/11 passed, 4,243 passed / 154 skipped / 1 TODO
  (112 tooling, 3,323 preview, 598 server, 69 desktop, 141 Python). It began before
  the two review fixes; final focused checks cover them; final standard/core recovery
  results are recorded below. Synthetic demo's exit 2 is the expected fixture result.
- Project reconciliation exits 1 for unrelated expired leases, retirement and
  orphan/mismatched-worktree debt. It is not an application failure; no other
  task's records or worktrees are changed by this continuation.

Next: finish final core/resource checks, retain exact receipts, deliver the reviewed
patch under normal signed-commit gates, and record Val's design disposition. No
merge/deploy, packaged/live-auth, full Redis, device or human acceptance claimed.

Current scene cost: **40 objects, 326 meshes, 24,318 triangles**, unchanged from the
merged pilot. Mesh-only unique resources remain **23 geometries / 20 materials**;
including the two line sets gives **25 / 22**, with **236,468 bytes** of resident
geometry typed arrays. This is CPU construction evidence, not GPU frame-time or
texture-transfer acceptance (`.runtime/garden-office-audit/current-cost.json`).

Ten-cycle resource capture (plus one warm-up) completed in **57.181 s** with no page
errors: `data/reports/garden-office-audit-soak.json`. Office render counters after
warm-up: 648 calls, 48,564 submitted triangles (includes shadow work), 25 resident
geometries, 10 textures, 6 programs, one canvas; geometry/program counts remain
flat. The first House replacement populates three additional shared textures.
Office listeners stay 157. Heap rises from 13.63 to 15.11 MiB during this short run,
with undo history still filling; no plateau or leak-free long-run claim is made.
The harness collects counts without asserting a resource budget; #417 owns that
budget and sustained/device acceptance. Its returned `passed` is execution success.

Final standard core rerun: preview/tooling passed, but **19 unchanged server tests
failed under host contention** (load average about 90): connection-rotation (4),
office-desk-transport (1), office-world-lifecycle (6), offices-transport (1),
penthouse-transport (1), phone-fixture (3), screenings-transport (1), town-worlds
(1), voice-reconcile (1). Errors are request/socket/startup timeouts, ECONNRESET,
and a missed snapshot deadline. No thresholds or auth behavior were changed.
`core-final.txt` and `.runtime/agent/core.json` retain the failed result. The queued
recovery runs **every server test with `--test-concurrency=1`**, then every remaining
configured core task through `runProfile`; it does not rerun already-passing
preview/tooling or label the failed standard command green. Diagnostic runner and
receipt: `.runtime/garden-office-audit/{recover-core.mjs,core-recovery.json}`.


Recovery completed: **9/9 remaining core tasks passed**. Command:
`node scripts/browser-lock.mjs garden-office-core-recovery -- node .runtime/garden-office-audit/recover-core.mjs`.
The diagnostic runner selects configured core tasks after tooling/preview and uses
`node --test --test-concurrency=1 server/tests/*.test.js` for all server files.
Server **598 passed / 153 skipped**, desktop **69 passed**, build passed, Python
lint/format passed, Python **141 passed**, demo and its expected-exit-2 validation
passed, secrets scan passed. The final standard run had already passed tooling
**112** and preview **3,324 / 1 skipped / 1 TODO**. Combined final-source coverage
is **4,244 passed / 154 skipped / 1 TODO** across these two receipts; this is not
an all-green standard `pnpm run verify` run. No failing tests were excluded.

Browser reproduction:
`RIVER_OAKS_E2E_REPORT=garden-office-audit-browser.json pnpm run test:experience studio-office-stations world-studio studio-pilot-journey`.
Resource reproduction:
`RIVER_OAKS_E2E_REPORT=garden-office-audit-soak.json pnpm run test:experience studio-pilot-soak`.

Handoff: source patch reviewed and local verification complete with the scheduling
qualification above. Prepare signed draft PR; await Val's visual/profile decision.
Keep this worktree and local captures/logs until delivery and evidence archival.
No authorization to merge or retire is inferred from successful checks.


Draft handoff: https://github.com/BunsDev/river-oaks/pull/459, implementation
`0b0bf2017e479323aa2f1b324f0e90b921b28f43`, SSH signature verified and provenance
check clear. Branch `test/garden-office-416-audit-20261015`; worktree
`/Users/buns/Documents/GitHub/BunsDev/river-oaks-garden-office-audit`.
The primary live task record is blocked on Val's visual/profile decision and
hosted review/checks. #417 can consume the source/asset contract and receipts now;
no merge, issue closure, delivery status or worktree retirement is claimed.


### Completion-audit follow-up: neutral and occupied-use evidence

The previous capture matrix is daylight/warm/evening. A neutral reflection map
alone does not prove a neutral-light inspection. Added browser-only diagnostic
`preview/e2e/studio-office-neutral.js`, reusing the matched station harness:
white sun, sky, scene fill and practical lights; neutral `#888888` ground fill;
unchanged daylight intensities, ACES exposure, neutral RoomEnvironment, material
and emissive colors. The override exists only in the intercepted local module
response, is labelled in capture filenames/receipts, and is removed before an
original-renderer reload in `finally`. This adds no persisted lighting enum.

Capture both authored chairs and the same conservative occupied-use fixture as
our movement regression: all nine chairs pulled back 0.4 m with depth at least
0.75 m, applied through numeric UI fields and read back. This represents chair-use
clearance, not avatars, animated seating or a human accessibility test.

Independent static review caught and resolved nested fixture-origin rewriting;
a mock at port 54321 proves both capture navigation and restoration use the
runner's fixture origin. No remaining important review findings. Browser execution passed in **18.473 s**, 12 captures, no page errors. Original
viewport response SHA-256 matched after restoration; the diagnostic attribute
was absent after reload. This is runtime evidence, not human visual approval.

### Exact interface supplied to #417

Document remains `document_type: 'studio-space'`, `schema_version: 1`, with closed
existing kinds/finishes and 160 objects / 128 KiB.
`spaceAssessmentContext('office')` supplies `{templateId:'office',profileVersion:1}`;
`assessSpace(space, context, {revision,maxWork})` and document
`assessCandidate` / `commitCandidate` retain #414's checks and revision fences.
Local-save envelope carries `{revision,region,assessmentContext}`. A bare imported
v1 document has no template provenance and remains unassessed. Asset metadata v2
for the five furniture records does not change document or profile versions.

Current source hashes (SHA-256; unchanged by neutral capture tooling):

| Interface source | SHA-256 |
| --- | --- |
| `preview/src/studio/space-templates.js` | `56c6c57fc0419f60ba88414ea1680c7199e6106cb9daafa82f270e58145e8f45` |
| `preview/src/studio/space-document.js` | `2c0e8cb5b0bdbbcb56ea489ecd339ec22abf5fac1bf56da68a25adb71bc24794` |
| `preview/src/studio/space-assessment.js` | `f7e8b820a9070992748a8c1df5979326e1ad8da0570a4bdb5fd8b89aa0584ab1` |
| `preview/src/studio/document.js` | `da45ef1ee7039edf6810acb15b57ce6888429986ef89397948c3a81ddb9f84fe` |

The asset manifest records renderer/material dependencies and costs separately.
Scene rebuild disposes prior scene resources, creates new scene-owned geometry
and materials, and reuses the viewport-owned reflection map; viewport disposal
releases reflection/render resources. Ten-cycle counters are evidence for that
bounded run, not sustained/device resource acceptance. #417 retains those budgets.


Neutral diagnostic command:
`RIVER_OAKS_E2E_REPORT=garden-office-audit-neutral.json pnpm run test:experience studio-office-neutral`.
Receipt: `data/reports/garden-office-audit-neutral.json`. All six runtime lights
report white color; both hemisphere ground colors are `888888`. Intensities remain
sun 2.5, sky 1.7, scene fill 0.35 and three practical lights 5 each; exposure 1 and
reflection intensity 0.25. All nine chair edits were read back successfully.

Agent inspected all twelve neutral PNGs: desk top/frame, chair support, floor
contact and glazing remain legible without warm light tints. Reception stone keeps
its visible texture. Occupied views show the intended chair pullback; the central
entry aisle stays visibly open. Physical route evidence remains the separate
movement tests, not these images. Kitchenette and exterior framing are unchanged;
the known open roof and bare exterior remain D7/D9. No new major visual defect
observed in this diagnostic; Val's design disposition is still pending.

Capture filenames use `garden-office-neutral-diagnostic[-occupied]-CAM-0N-*.png`.
Their SHA-256 values and harness hashes are appended to the local
`.runtime/garden-office-audit/evidence-manifest.json`; the paired review HTML now
includes both neutral conditions. No original captures were overwritten.


### Resumed completion audit: review ownership correction

Earlier continuation notes incorrectly treated #416's design review as requiring
Val personally. The #414 handoff in #413 requires **design-reviewer confirmation**
of destinations, and #416 assigns visual review to that role. Neither instruction
names Val as the required reviewer for this source handoff. The goal explicitly
excludes waiting for #417's final approval. An independent agent design review is
therefore being completed against the actual images and destination purposes;
it must not be presented as Val's approval or human/device acceptance.

At `3deaa1c6104919217bf43d01bd6b430035fd5d4f`, all 16 GitHub check runs, including
aggregate `preview`, passed. The branch remains behind main; up-to-date merge
checks and authorization are still required before landing. This goal authorizes
source/evidence handoff, not merge or retirement.

| Requirement | Current evidence | Scope |
| --- | --- | --- |
| Actual pilot family, glazing, finishes, light and planting | Merged #439 source plus #459 bounds corrections; baseline/current PNGs; eight asset records | Original procedural assets behind existing v1 kinds, no GLB export required by recorded decision |
| Asset metadata and visible/collision dimensions | Source/dependency hashes, measured bounds/costs, 4,000-case independent review and four workstation approach regressions | No controller shrink or new persisted fields |
| Legacy and negative compatibility | 105 focused tests; strict unknown field/version/kind/finish, malformed/oversized data, saved draft/history recovery | No conversion needed; plain import honestly lacks assessment provenance |
| Existing renderer, transaction and host integration | Exact interface hashes above; 13-check browser journey; 11/11 development Electron; build/core receipts | No new desktop import or context field; provider-free fixture path |
| Actual views and representative chair use | 18 ordinary and 12 neutral diagnostic views, nine pulled-back chairs, restored renderer response verified | Capture inspection is distinct from human accessibility and device approval |
| Reproducible evidence and acceptance handoff | This ledger, committed browser/soak/neutral receipts, #459 and #417 comment6202142894 | Local PNGs and detailed logs retained; no kit publication or manual deployment |


### Final design correction and disposition

Independent agent design reviewer inspected 40 original/current images and
confirmed all five profile-v1 destinations, but correctly rejected the missing
explicit TypeSafe Place pink accent. No prior palette exception existed. The
small existing art circle now uses authored `#F486A1`, roughness 0.88; pots remain
terracotta. This changes the **shared art-detail default across templates** and
old saved v1 art, not the serialized finish enum or geometry. #418 retains broader
other-template acceptance. The ninth catalog record, `studio-art-abstract-pink`
v1, documents this scope, proportional resizing, nonblocking status and costs.
Texture metadata now distinguishes optional desk/floor PBR maps from forms with
no authored texture maps; no texture transfer-byte measurement is claimed.

The material regression failed before the correction (`pink-red.txt`) and passes
after it. Focused Studio/asset suite: **106 passed, 0 failed/skipped/TODO**. After
the metadata wording correction, the Garden Office suite passed **19/19** again.
Camera comment corrected: CAM-06 stands at reception `(0,-4)` and looks at exit
`(0,-8.5)`; it does not stand at the arrival. No route/profile changed.

Fresh command:
`RIVER_OAKS_GARDEN_CAPTURE_PREFIX=garden-office-pink RIVER_OAKS_E2E_REPORT=garden-office-pink-browser.json pnpm run test:experience studio-office-stations studio-office-neutral`.
Both passed: **18 preset captures / 19.422 s**, **12 neutral captures / 18.081 s**,
including occupied chairs and original renderer response restoration. Old PNGs
remain intact. Receipt: `data/reports/garden-office-pink-browser.json`; exact source
and 30 capture hashes: `.runtime/garden-office-audit/pink-evidence-manifest.json`.

**Independent design disposition: accepted for scoped source handoff.** Reviewer
inspected eleven corrected runtime PNGs: reception/workstation under all five
lighting/occupancy conditions and neutral meeting as the pot-color control.
The small pink circle remains restrained and legible; no new major visual defect
was observed. The reviewer reran 19/19 pilot tests. Full review and exact hashes:
`.runtime/garden-office-audit/design-review.{md,json}`, with the original finding
and follow-up both preserved. This is agent design review, not Val impersonation.

| Profile-v1 destination | Confirmed design purpose | Limit |
| --- | --- | --- |
| Arrival/exit `(0,-8.5)` | Existing 2 m gap connects exterior start/return to central aisle | Bare exterior is retained D9 |
| Reception `(0,-4)` | Reception/waiting area and office junction | Area access, about 4 m from counter, not service/reach certification |
| Work area `(-2,1)` | Entry to the four-workstation zone | Four separate side-approach regressions supplement it |
| Meeting `(3,1)` | Beyond west glazing opening inside meeting zone | Glazing is solid; authored gap provides connection |
| Kitchenette `(-1,5)` | Open north service aisle alongside cabinets | Area access, about 4.2 m from sink, not sink-use certification |

The reviewer separately reconstructed occupied chairs and obtained passed return
routes to all targets with the unchanged 0.35 m controller. D7 open roof/visible
canopy fixings and D9 bare exterior remain conspicuous but do not block this
interior-family slice; older counter/table forms and stylized plants are recorded
polish limits. No required design correction remains. #417 owns human/device,
packaging/live-auth and sustained performance/budget decisions.

Updated CPU scene cost (`pink-cost.json`): **40 objects, 326 meshes, 24,318
triangles, 2 line sets, 25 geometries, 23 materials, 236,468 geometry-array bytes**.
The accent adds exactly one material; mesh-only materials are now 21. Geometry,
controller and collision costs are unchanged. Earlier ten-cycle and Electron
receipts precede this color-only follow-up and are retained with that scope.
Final standard core gate passed **11/11 tasks**, invoked under the local work
queue as `node scripts/browser-lock.mjs garden-office-pink-core -- pnpm run verify`.
Counts: tooling 112, preview 3,325 / 1 skipped / 1 TODO, server 598 / 153 Redis
skips, desktop 69, Python 141. Total **4,245 passed / 154 skipped / 1 TODO**.
Build, Python lint/format, fixture demo, expected-exit-2 demo verifier and secrets
scan passed. Immutable receipt: `pink-core-receipt.json`; output: `pink-core.txt`.
The final metadata-only wording was separately checked by the final 19/19 suite.
The earlier failed run remains in `core-final.txt`; `.runtime/agent/core.json` is a
rolling runner receipt and now contains this successful final run.

**Source-handoff completion:** actual source/assets, contract, compatibility,
runtime views, occupied-use checks, exact interfaces and independent design review
are complete for this requested slice. No Val-personal-approval requirement is
added. Continue #417 acceptance independently. PR #459 still needs ordinary hosted
review/up-to-date checks and authorized landing; task delivery/retirement is not
claimed. Preserve this worktree and local evidence until the lifecycle gates pass.

Independent design review JSON SHA-256: `7ba0e3adcd189a7118837681eca6b93375448453ca8ac0010d0700173a154b73`.

### Authorized landing and shared-renderer integration

Val authorized commit, push and merge of #459 on 2026-10-15 (local date).
The serialized landing queue integrated main through #466 at GitHub-verified
merge `231ca801d7612be49a65329cff820c33ff1c6ecd`. #466 changes shared slab/floor
material behavior and counter construction as part of the House slice. The first
focused integration run was **115 passed / 1 failed**: the existing catalog
comparison correctly detected stale shared-renderer hashes. No behavior test failed.

Regenerated the nine records using `node scripts/garden-office-manifest.mjs --write`
and corrected desk texture metadata: #466 applies optional stone/paver texture
maps only to floors, not slabs. Recorded nominal geometry, bounds, colliders and
costs are unchanged. No production code change is introduced by this follow-up.
`node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js`
then passed **116/116**, no skips or TODOs. Logs: local
`.runtime/garden-office-audit/landing-focused{,-before}.txt`.

A fresh core run is queued through `browser-lock.mjs`; its result must be read
from `landing-core.txt`, not inferred from the earlier core receipt. The exact-head
hosted Verify/aggregate preview and signature/merge guards remain required.
Earlier captures and independent design review retain their recorded source scope;
they are not relabeled as fresh review of #466's inherited shared-surface changes.
Preserve the worktree and local evidence after landing. #416's final checklist
reconciliation should inspect that integration; #417's separate human/device and
budget decisions are not prerequisites for the #416 source handoff.
