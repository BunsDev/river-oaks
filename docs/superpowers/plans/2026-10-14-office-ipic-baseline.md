# Office + IPIC #360, design-side baseline packet (2026-10-14)

Objective: deliver the design half of the #360 G0/G1 packet under
`docs/design/office-ipic/`: a reconciled source index with hashes and approval
state, an asset manifest with budgets and axes, a brief that separates observed,
inferred and proposed geometry, and a review matrix with owners. No layout
activation, no asset import, no provider call.

Task `office-ipic-baseline-360`, owner `claude:river-oaks-fable (aa2272b7)`.
Worktree `../river-oaks-office-ipic-baseline-20261014`, branch
`docs/office-ipic-baseline-20261014` from `origin/main` `489a60e4`.

Split agreed 2026-10-14 ~19:50Z with session river-oaks-dc, which also holds
#360 by a /goal: this branch owns the design side (D0/D1); river-oaks-dc owns the
engineering side (C0/C1) on `docs/office-ipic-engineering-baseline-20261014`:
baseline check counts, envelope measurement, physical-fit analysis,
`layout-contract.json`, `camera-manifest.json` and their validator, under task
`office-ipic-engineering-baseline`. Neither branch edits the other's files.

Files owned here:

- `docs/design/office-ipic/brief.md`, `review-matrix.md`
- `docs/design/office-ipic/reference-index.json`, `asset-manifest.json` (generated)
- `scripts/office-ipic-reference-index.mjs` (generator and validators)
- `scripts/tests/office-ipic-references.test.js`
- this ledger and the task entry in `docs/project-management/tasks.json`

## Baseline evidence read

- `docs/offices.md`, `docs/ipic-interior.md`, `preview/src/office-contract.js`,
  `workplace-room.js`, `office-scene.js`, `office-arrival-model.js`,
  `office-desk-contract.js`, `workplace-contract.js`, `ipic-plan.js`,
  `server/offices.js`, `store-rooms.js` transforms; the IPIC review receipts.
- Kit at `~/Downloads/jevica-office-kit` (71/71 checksums verified), the top-level
  production guide, walkthrough and zip (72 entries), and Cody's scale review at
  `~/Downloads/jevica-office-scale-review` (assessment, library revisions 1–3,
  passing-bay check, 19 captures). Hashes, sizes and mtimes recorded in
  `reference-index.json`.
- Blob drift since the kit's receipts: `workplace-room.js` and `server/offices.js`
  unchanged; `office-contract.js`, `office-scene.js`, `package.json` changed.
- Searched for `typesafe-place-coding-familiar-handoff.md` and
  `typesafe-place-design-familiar-handoff.md`: `git ls-files`, repository grep,
  `mdfind` over the home folder. Not found; recorded as missing entries.
- Draft PR bodies #349–#358 read for keep/reuse/avoid; recorded in the brief.

## Checks

| Command | Result |
| --- | --- |
| `node scripts/office-ipic-reference-index.mjs --write --kit … --scale-review … --loose …` | 147 references, 53 assets at `489a60e4` |
| `node scripts/office-ipic-reference-index.mjs --check` | 0 problems, 0 drifted |
| `node --test scripts/tests/office-ipic-references.test.js` | 6 pass, 0 fail, 0 skipped |
| `pnpm run verify` (core) at `489a60e4` + this patch | passed: agent 82/82, preview 3,012 pass / 1 existing skip, server 486 pass / 140 Redis skips (core permits them), desktop 54/54, Python 141 passed; receipt `.runtime/agent/core.json` |

The validator is behavioural: scratch repository and scratch kit fixtures, a
tampered kit file, duplicate ids, a short revision, a wrong axis convention, an
unlisted repository path, a dangling asset reference, inverted bounds, an
over-budget proxy, and a later edit to a referenced file (drift, not failure).

## Gaps and skips

- Baseline captures with avatars, focused office/IPIC check counts, envelope
  re-measurement and the physical-fit analysis are on the engineering branch.
- No kit bytes imported; the public repository would publish generated images
  without recorded approval (decision for Val).
- No human visual, target-device, native or live-auth evidence. Core verify
  excludes Redis and browser profiles.

## Decisions for Val

Listed in `docs/design/office-ipic/brief.md`: kit import, physical fit of the 7.6 m
volume above the 24.3 m rise, library revision 3 adoption, IPIC lift decorative or
routed, and the missing handoff briefs.

## Next

Open a draft PR for this branch; cross-link the engineering packet PR when it
exists; G1 agreement needs both packets plus Val's answers to decisions 1–3.
After G1, #361 or #366 in a new worktree, one scope per PR.
