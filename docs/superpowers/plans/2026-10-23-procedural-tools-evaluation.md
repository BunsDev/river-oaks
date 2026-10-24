# External procedural tools evaluation (#588)

## Objective

Decide, with practical evidence, whether Blender Geometry Nodes, Houdini, CityEngine,
OpenStreetMap workflows, Unreal PCG/World Partition or other tools should enter
TypeSafe Place's city production pipeline. Produce an adopt, defer or reject
recommendation. Do not add a production dependency or migrate engines.

## Ownership

Task `procedural-tools-evaluation` (issue #588). Original owner
`claude:30ea37be-17d3-4ac2-9d11-fe5ece8510d4`; handed off after lease expiry to
`claude:574e8a7d-6937-46c9-879c-cb04b58c03f9` (2026-10-23T18:37Z), which rebased onto
`origin/main` `f4aa1670` and extended the evidence. Worktree
`/Users/buns/Documents/GitHub/BunsDev/river-oaks-procedural-eval`, branch
`docs/procedural-tools-eval-20261023`, from `origin/main` `7bf0bbf6`.

Files owned: `docs/procedural-tools-evaluation.md`, `experiments/procedural-tools/`,
this ledger. The in-flight `neighborhood-authoring` task (another session) owns the
deterministic compiler; this task only ran its CLI with output in a scratch directory
and left that worktree unchanged (39 staged files before and after).

## Checks

| Check | Result |
| --- | --- |
| Blender block generator: three variants, three fresh processes each for joined/instanced | Byte-identical GLBs per variant |
| Lint-clean source reproduces recorded outputs | joined `ac8af1ee…`, instanced `1c3b32c6…`, realized `3fe91a3f…` identical |
| `uv run --locked ruff check` / `ruff format --check` on `experiments/procedural-tools/` | Passed |
| OSM tag completeness (Overpass, 2026-10-23T05:33:51Z base) | 1,560 buildings, 2.8% height or levels; 0/1,132 roads with width |
| OSM2World 0.4.0 on the District OSM extract | LOD1 21.6 MB, LOD3 27.3 MB GLB; see evaluation |
| In-house neighborhood compiler, Market/Court, three runs each | 0.08–0.09 s wall; identical bytes |
| Browser harness (`measure-browser.mjs`, 13 cases × 3 runs, via browser lock) | All 39 runs passed with zero page errors; summary in `docs/acceptance/procedural-tools-588/summary.json` |
| `pnpm run verify` (core), started 2026-10-23T05:40:19Z | Passed: tooling 201/0 skips, preview 3,827 passed/1 skip, server 757 passed/215 Redis skips, desktop 115/3 skips; build, Python, demo, secrets passed |

### Extension on `f4aa1670` (session 574e8a7d)

| Check | Result |
| --- | --- |
| Stored GLBs against receipt SHA-256 | 12/12 match; three-process joined/instanced hashes identical |
| Browser harness rerun, 15 cases × 3 runs (13 prior + baked in-house) | 45/45 zero page errors; prior cases reproduce draw calls and triangles exactly |
| `scripts/fetch_district_lidar.py` | 63 tiles, 20.8 MB, 1,169,790 clipped points (matches `docs/vegetation.md`) |
| `lidar_heights.py` | 9/9 footprints measured; see evaluation |
| `overture_heights.py`, release `2026-10-21.0` | 1,481/1,531 with height; source attribution per District building |
| GLTFExporter bake of `buildDistrictBuildings` | 4.99 MB GLB, ~40 ms parse vs ~0.6 s build; 23/154 shader-patched materials lost; 3 runs × 2 cameras, zero page errors |
| `ruff check` / `ruff format --check` on `experiments/procedural-tools/` | Passed |
| `pnpm run verify` (core) on `b67348b4` + working tree, started 2026-10-23T20:40:23Z | Passed: tooling 204/0 skips, preview 3,877 passed/1 skip, server 824 passed/218 Redis skips, desktop 115/3 skips; build, Python, demo, secrets passed. An earlier run at load average 173 failed one wall-clock budget test (`office-penthouse-furnishings`, 66.5 ms slice); that file passed 15/15 alone and in the rerun |

## Gaps

- Houdini, CityEngine and Unreal PCG were assessed from official terms and documentation,
  not run: CityEngine/PyPRT ship no macOS build, Houdini batch use needs a paid Engine
  licence or Indie-format files, and Unreal is not installed on this host.
- Frame timings come from a shared host (load average ~10 during the browser run) under the browser
  lock; they compare cases with each other, not against devices.
- No human authoring-time study; authoring effort is described from this session's
  experience and is not a human-minutes measurement.
- Street-camera captures were not matched between cases; only overview visuals are compared.
- Core gate ran before the browser section and evidence images were added (docs only).
- Bake determinism untested: the second export was stopped after 86 minutes queued
  behind other sessions in the browser lock. The baked overview's 42% triangle excess
  over the runtime build is unexplained.
- Blender was not re-downloaded; its reproducibility rests on the stored receipts and
  the earlier three-process runs, not a fresh rerun.
- LiDAR heights cover the District only (the existing fetch extent), from a 2018 flight;
  expansion land was assessed through Overture's attribution, not our own LiDAR.

## Next step

Recommendation documented in `docs/procedural-tools-evaluation.md`; PR #616 (merge
authorized by the user on 2026-10-23). The east expansion is authored fictional content
(`docs/world-expansion.md`), so a LiDAR height step applies only to real mapped
buildings; there are none in the expansion land to measure.
