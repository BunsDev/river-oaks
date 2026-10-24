# District building height audit (follow-up to #588)

## Objective

Compare each District building's authored height with a measurement from the existing
USGS 3DEP LiDAR subset and record the result as provenance. Report only: do not change
`district.json` or the approved District appearance. The east expansion is authored
fiction (`docs/world-expansion.md`), so it is out of scope.

## Ownership

Task `district-lidar-height-audit`, owner `claude:574e8a7d-6937-46c9-879c-cb04b58c03f9`.
Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-height-audit`, branch
`feat/district-height-audit-20261023`, from `origin/main` `f4aa1670`.

Files owned: `src/river_oaks/lidar.py` (`measure_building_heights`, `audit_heights`),
`scripts/audit_district_heights.py`, `tests/test_lidar.py` (height tests), the heights
row in `docs/data.md`, `data/reports/district-heights.json`, this ledger.

## Design

- Roof: 95th percentile of class-6 returns inside the footprint inset 1.5 m (walls and
  eaves excluded; a stray return cannot set the roof). Ground: median class-2 return in
  a 2–12 m band outside the footprint. Fewer than 20 returns of either leaves the
  building unmeasured rather than guessed.
- Audit: a height source beginning "authored" is a documented override, reported and
  never failed. Other gaps above 3 m fail (exit 1); an unmeasured building or missing,
  mismatched or differently framed LiDAR blocks (exit 2); otherwise exit 0.

## Checks

| Check | Result |
| --- | --- |
| `uv run --locked pytest -q tests/test_lidar.py` | 15 passed (6 new: measurement, unmeasured, invalid input, audit statuses, blocked audit, script exit codes with district unchanged) |
| `ruff check` / `ruff format --check` | Passed |
| Audit on the real subset (receipt-verified `points.npz`, 1,169,790 points, from the #588 evaluation worktree) | Exit 0: 8 within 3 m (largest +2.57 m, 625330792), 625330785 reported as the authored penthouse override (33.0 m vs 25.26 m) |
| Two runs | Identical reports apart from `generated_at` |

## Gaps

- The LiDAR flight is 2018; later construction is not reflected.
- The 3 m tolerance is a judgement call; 625330792 sits at +2.57 m.
- The audit needs the ignored local LiDAR subset, so it does not run in CI; the unit
  and script tests use synthetic surveys.

## Next step

Run the core gate, then commit and open a PR only with the user's authorization.
