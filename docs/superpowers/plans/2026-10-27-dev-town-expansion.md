# Development town serves the experimental land expansion

Task `dev-town-expansion-20261027`, branch `feat/dev-town-expansion-20261027`.

## Objective

`pnpm run dev` always shows the experimental land expansion. The development town
defaults `RIVER_OAKS_DISTRICT_REVISION` to `woodland-heights-1` (Gardens, Commons,
Bayou Heights, Studewood, Bayou Terraces and Woodland Heights) the same way it
already defaults `RIVER_OAKS_CHARACTER_STUDIO` on. An explicit revision in the
environment or repo-root `.env` still wins. Acceptance fixtures
(`RIVER_OAKS_ACCEPTANCE_FIXTURE=1`, including the desktop e2e scripts that run the
Vite town) keep the garage default so journeys stay pinned. Production, `pnpm start`
and `pnpm run server --dev` are unchanged: unset still means the garage.

## Files owned

- `server/vite-town.js` (the `devTownEnv` default)
- `server/tests/vite-town.test.js` (regression)
- `.env.example`, `docs/garden-campus.md`, `scripts/destination.mjs` (documentation)
- this ledger

## Checks and results

| Check | Result |
| --- | --- |
| `node --test server/tests/vite-town.test.js` | 2 pass, 0 fail |
| `createTown` with `devTownEnv({})` | composed world `districtRevision` = `woodland-heights-1` |
| `createTown` with an explicit `river-oaks-gardens-3` | `river-oaks-gardens-3` |
| `createTown` with `RIVER_OAKS_ACCEPTANCE_FIXTURE=1` | `null` (garage) |
| `pnpm run verify` | see handoff |

## Gaps

- Core verify excludes Redis, browser, native and live auth. No browser run of
  `pnpm run dev` was made; the composed revision was checked through `createTown`.
- A developer's private `.env` that already sets `RIVER_OAKS_DISTRICT_REVISION`
  keeps that revision; clear it to get the default.

## Next step

Commit, open a draft PR, and watch hosted checks.
