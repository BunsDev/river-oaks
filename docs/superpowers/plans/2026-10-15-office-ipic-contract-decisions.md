# Office + IPIC #360: record Val's decisions in the layout contract (2026-10-15)

Objective: record Val's two 2026-10-14 decisions in `docs/design/office-ipic/layout-contract.json`
so G1 can close, without editing the engineering session's branch. This branch is stacked
on #381 (`docs/office-ipic-engineering-baseline-20261014` at `7c7f7368`); its draft PR
targets that branch, so #381's owner or Val decides whether to take it.

Why stacked: the decisions were posted on #381 at 23:48Z; a direct message to its owner
(river-oaks-dc) expired unapproved, and that task's lease lapsed at 00:23Z with the contract
unchanged. An expired lease is not a handoff, so this is a proposal, not a takeover.

Task `office-ipic-contract-decisions`, session aa2272b7. Worktree
`../river-oaks-office-ipic-contract-decisions-20261015`.

Changes:

- `penthouse-volume-fit` → `decided`: fit option 2, raise the modelled building. A new
  `fit.decision` records floor 24.3 m, ceiling 31.9 m, mezzanine floor 28.1 m, tower top
  32.85 m, building 33.0 m, implementation by #361 (district height, `TOWER_TOP`, a fourth
  checkpoint migration, `reference-facades.test.js`), and the terrace recommendation.
- `penthouse-library-terrace-density` → `decided` for the library: a new
  `mezzanineProgramme` on the penthouse place carries Cody's revision 3 coordinates; terrace
  activity density stays a design item for #362.
- `scripts/office-ipic-contract.mjs`: a recorded fit decision must name a listed option,
  have its ceiling equal floor plus clear height, enclose that ceiling with the raised
  tower and building, and be marked `decided` in the decision list.
- `scripts/tests/office-ipic-contract.test.js`: one test breaking that four ways.

Unchanged: `volumeFitsAtCurrentFloor` stays `false` and `resolution` stays
`val-decision`, because the building is still 28 m until #361 lands.

## Checks

| Command | Result |
| --- | --- |
| `node --test scripts/tests/office-ipic-contract.test.js` (base `7c7f7368`) | 7 pass |
| same, after the change | 8 pass, 0 fail, 0 skipped |
| `pnpm run verify` (core) on the working tree at `7c7f7368` + this patch | passed: agent 103/103, preview 3,039 pass / 1 existing skip, server 498 pass / 141 Redis skips (core permits them), desktop 54/54, Python 141 passed |

## Next

Draft PR into #381's branch. G1 closes when #381 (with this change) and #380 are agreed;
then #361 and #366 start in their own worktrees.
