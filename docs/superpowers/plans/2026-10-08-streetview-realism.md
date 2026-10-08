# Street View realism

- Objective: adapt the supplied June 2024 Street View screenshots to browser district materials, preserving mapped geometry and circulation.
- Worktree: `../river-oaks-realism-20261008`, branch `codex/streetview-realism-20261008`, baseline `a789449`.
- References: Desktop screenshots `2026-10-08 at 12.43.24` (Toulouse plaza), `12.43.14` (Bari lawn), `12.43.37` (Dolce boutique street). Google Maps panorama `YR0S21sO8cweSGuV0Xljvw`; web reader unavailable. Images are qualitative, lens/height unknown; no surveyed dimensions or rights to redistribute claimed. No screenshot pixels shipped.
- Inspection: location-specific facades already model Bari screens/loggias, Toulouse terrace and Dolce piers. Paving currently specifies warm herringbone, contradicting the gray strip paving visible in two references. Stone/canopy finishes are somewhat yellow/silver compared with pale limestone/bronze in references.
- Owned files: `preview/src/paver-textures.js`, `preview/src/materials.js`, material palette in `preview/src/reference-blocks.js`, focused tests and capture harness, this ledger.
- Proposed adaptation: authored seamless gray running-bond strips with sparse terracotta, shallow joints and aggregate; pale limestone, bronze canopy and charcoal panel tones. Strip dimensions are design estimates. Keep all geometry, navigation, tree and lighting settings.
- Checks: deterministic material maps, normal/roughness/channel invariants; browser rendered material/reference facade capture; core gate; diff review.
- Status: in progress. Agent doctor passed. Dependencies reused through local symlinks; no private runtime or credentials copied.
- Gaps: native, multi-time lighting, target GPU performance, human visual acceptance and hosted CI are not established by local checks.

## Added scope from follow-up references

- Bella Rinova: `12.45.57.png`, January 2025. Lowered the stair screen from 9 m to 6.2 m (design estimate), exposing the ribbon window; uppercase salon lettering, glass under short charcoal louvre banks, repeated stone piers and sconces on the east corner. Existing mapped entrance remains.
- Hopdoddy: `12.48.26.png`, June 2024. Three bounded photo-aligned placements replace four inferred supports through a shared selector. Original data is untouched. Source coordinates are in `tree-placements.js`; crown radii are 2.1/2.1/3.2 m. No claim of surveyed placement or botanical matching.
- Additional owned files: `reference-facades.js`, `tree-placements.js`, `landscape-models.js`, `navigation.js`, `tree-flight.js`, `carriage-parking.js`, `parked-carriage.js`, `landscape-models.test.js`, `reference-trees.test.js`, `docs/vegetation.md`, fixture capture access in `preview/e2e/fixtures/facades.js`.

## Evidence so far

- Focused material/reference-tree/landscape tests: 7 passed. Tree checks cover road clearance, >2 m from mapped doors, blocked navigation at trunks and passable pavement 1.3 m behind stems; source data unchanged.
- `RIVER_OAKS_E2E_REPORT=streetview-realism-final.json npm run test:experience -- streetview-realism reference-facades`: both passed. Captures at `output/playwright/streetview-{bella,bari,dolce,toulouse,hopdoddy}.png`; camera metadata and geometry assertion in `output/playwright/streetview-prior-reports/streetview-realism-final.json` (local-only). Screen geometry measured at 6.32 m including cap. Facade texture disposal passed.
- Baseline Bella capture retained in `output/playwright/streetview-baseline/`; same camera/light settings as final Bella. Baseline was after paving/palette changes, so it establishes only the Bella geometry/sign comparison. Other supplied photographs remain qualitative, not camera-calibrated matches.
- Visual inspection: Bella screen no longer overlaps the salon ribbon/sign; glass and dark louvres read separately. Paving now gray/terracotta running bond. Hopdoddy stems stand in front of the shops; crowns use existing oak geometry. The isolated fixture omits the complete landscape/ground/occupancy and is not full-world acceptance.
- Core gate being rerun after tree integration; shared multiplayer fixture pending. No commit/push/merge had been requested at this checkpoint.

## Cartier follow-up

- Added references `12.53.56.png` and `12.53.22.png`, June 2024. Rebuilt two 20 m corner spans of the existing IPIC footprint with three tall bays per face, small-course pale stone, dark surrounds, bronze glazing frames, cream sloping canvas and Cartier script lettering. Dimensions remain authored photo estimates.
- Retained the mapped Cartier doorway; reference spans partition the IPIC facade without overlap. Existing IPIC modules are clipped at the corner boundary. Other tenants retain their mapped doors.
- `node --test preview/tests/reference-facades.test.js preview/tests/street-furniture.test.js`: 16 passed. The former raw-tree-count assertion now checks one pit per effective rendered stem, including the removed duplicate.
- `RIVER_OAKS_E2E_REPORT=streetview-realism-cartier.json npm run test:experience -- streetview-realism reference-facades`: passed both. Inspected `streetview-cartier.png` and `streetview-cartier-entry.png`; both faces show the intended six shaded bays, with the mapped door centered in its entrance bay. All seven camera records are in the report.
- `RIVER_OAKS_SHARED_JOURNEY=multiplayer RIVER_OAKS_SHARED_REPORT=streetview-shared.json npm run test:shared -- required`: passed, Apple M3 Max / ANGLE Metal, local authenticated two-client fixture. This is general multiplayer regression coverage, not a dedicated tree reconnect/physical-sweep acceptance.
- Final core gate and street-level Cartier arrival/entry journey pending. Earlier core rerun caught the outdated raw-tree-count expectation; corrected to the effective stem contract, not waived.

## Final verification and handoff

- `npm run verify`: **passed**, exit 0, `.runtime/agent/core.json`. Tooling 17 passed; preview 2,504 passed / 1 skipped; server 267 passed / 101 skipped (Redis excluded by core); desktop 9 passed; Python 141 passed with 2 warnings; production web/landing build, offline fixture and worktree secret scan passed. Offline demo verification returned its required blocked-domain exit 2.
- `RIVER_OAKS_E2E_REPORT=streetview-traversal.json npm run test:experience -- street-level`: **passed**, including on-foot movement, Cartier arrival, reload and entering Cartier. Local browser fixture only.
- `git diff --check`: passed. Reviewed owned source changes and rendered captures. No supplied image pixels or new external assets shipped.
- Initial capture harness import error was corrected by exposing the fixture's existing Three.js module; final capture runs passed. The earlier failed report is retained as historical evidence, not acceptance.
- Implementation and local checks complete for this bounded browser pass. Broader realism acceptance remains open: photographic camera calibration, exact tree species/multi-stem geometry, dedicated two-client tree/reconnect traversal, human play, native runtime, full Redis/browser matrix and target GPU performance were not established.
- Delivery: uncommitted changes on `codex/streetview-realism-20261008` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-realism-20261008`. Main checkout edits were preserved. Val subsequently authorized commit/push/PR/merge when ready; see the delivery audit below. Keep this worktree until delivery is confirmed.


## Authorized delivery audit

- User authorized proceeding through merge to main. Integrated current main `9b25e18` (review cleanup and v0.1.5) with a clean fast-forward; none of the task files overlapped.
- Fresh independent review: no blocking findings; 23 focused tests passed, zero skipped. Coverage limits for exact botanical/photo fidelity remain explicit.
- Full local gate is running through an owned, disposable Redis service on loopback; no production databases or credentials are used. Hosted required checks are `preview`, `verify (3.11)` and `verify (3.13)`, with strict current-main enforcement.
- Superseded capture reports, including the corrected harness import failure, remain local-only under `output/playwright/streetview-prior-reports/`. The committed capture, traversal and shared reports describe only the runs they record.
- Pre-commit verification on `9b25e18` plus this patch: every core-equivalent full-profile stage passed, including preview, Redis-backed server tests, desktop, production build, Python lint/format/tests, offline smoke, dependency audit and both secret scans. Security browser tests passed; the remaining browser stages continue before merge. Receipt: `.runtime/agent/full.json`.
