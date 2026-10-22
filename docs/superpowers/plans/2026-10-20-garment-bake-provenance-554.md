# Garment bake provenance (#554)

2026-10-22 continuation: the user has now authorized resolving and merging
Dependabot PRs. Current integration and delivery evidence is recorded in
`2026-10-22-dependabot-553-554.md`. The endpoint and authorization below describe
the original local-only handoff, not the new delivery scope.

## Goal and authorization

Implement R1–R5 from the user's continuation prompt: unrelated dependency
updates must preserve the five offline garment receipts, actual inputs and
toolchain bytes remain validated, and generated morph data stays identical.
Endpoint: locally verified reviewable patch, #554 compatibility evidence, and PR
draft text. No commit, push, remote tracker update, merge, deployment or cleanup
authorization. Do not modify #545 or Dependabot's branch.

## Current endpoint

**Locally complete: R1–R5 satisfied.** Implementation and required verification
are complete; review patch and PR text are prepared. No commit, PR publication,
merge, release or deployment occurred. Both worktrees and local evidence remain
for review. See the final handoff below; earlier checkpoints are history.

## Ownership and starting evidence

- Task: `garment-bake-provenance-554`.
- Owner: `codex:garment-bake-provenance-554:01a15b5f`.
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-garment-bake-provenance`.
- Branch: `fix/garment-bake-provenance-554`.
- Base: `a35214f3` (current fetched main when created; #566 merged).
- Files: five `scripts/bake-*.mjs` garment generators; proposed
  `scripts/lib/bake-provenance.mjs` and `scripts/tests/bake-provenance.test.js`;
  their five `preview/src/*-morph-receipt.json` receipts; four existing garment
  test files; `docs/character-studio.md`; this ledger.
- PR #554 remains open at `bd1fac4c84544a7a0d6d825403910dc86cb4bd99`:
  package/lock updates only; Verify 39397497680 failed five lockfile pins;
  Desktop passed. No inline review threads returned.
- #545 remains separately owned, draft at `aea288ec`; it overlaps the receipts
  and `avatars.js`. #504 remains draft at `1e71cb33`. Their inspected-head Verify
  runs passed, but neither proves the current main integration. #563 is docs
  only at `a3cd3b48`, Verify passed. All facts refreshed at execution start.
- The primary checkout and other worktrees were left untouched. Live register
  is updated only through `register patch`; no committed snapshot changes.

## Tasks and acceptance map

- [x] T0: ownership, import/input inventory, baseline (R1–R5).
- [x] T1: shared provenance contract and adversarial fixtures (R1, R2, R5).
- [x] T2: migrate all five generators/tests and regenerate receipts; identical
  output hashes and successful `--check` (R1–R3).
- [x] T3: #554 integration, required gates, docs and final review (R4, R5).

Critical path: T0 → T1 → T2 → T3. T1's schema is consumed by both generators and
test verification in T2; maintain a single shared implementation. One owner,
serial bakes. No behavior or numeric geometry assertion changes are authorized.

## Baseline and checks

Evidence directory: `.runtime/garment-provenance/` (ignored, local).

| Command/evidence | Actual result |
| --- | --- |
| `pnpm install --frozen-lockfile`, `uv sync --locked` | Passed; isolated dependencies; no env copied |
| `sh scripts/install-hooks.sh`; `pnpm run --silent agent:doctor` | Passed |
| Five provenance tests via `node --test --test-name-pattern='provenance\|pinned source receipt'` and the four garment files | 5 passed, 0 failed/skipped |
| `baseline.json` | Captures base HEAD, five morph output hashes plus the authored packed decoder hash, five original receipts |
| `pnpm run verify` | Failed in tooling: system Python 3.9 lacks tarfile extraction `filter`; original log/receipt preserved |
| `PATH="$PWD/.venv/bin:$PATH" pnpm run verify` | Passed all 11 phases; `baseline-core-python-env.log`, `baseline-core.json` |
| `pnpm run --silent project:check --github` | Exit 1: 57 pre-existing coordination gaps, not task failures; raw JSON retained |

Ruling: use the installed `.venv/bin` Python on PATH for checks — tooling invokes
`python3`, and this host otherwise resolves Xcode's unsupported Python 3.9.
This changes the invoking environment only, not source or assertions.

## Dependency audit and design

The five scripts' static local import closure has 59 files. The only external
package is Three.js (root plus GLTFLoader, SkeletonUtils, BufferGeometryUtils,
RoundedBoxGeometry). Installed Three.js 0.186.1 declares no runtime, optional,
or peer dependencies. The exploratory inventory is in `import-audit.json`.
Node built-ins are supplied by the supported Node runtime.

Implemented T1 design: version 2 receipts retain explicit source/rig/license/output
pins and add checkout-local Three.js version and canonical package-content
fingerprint. Validate required input sets independently of receipt-supplied keys.
Reject changed/unknown/missing package dependencies and invalid receipt shape.
No whole-lockfile equality, timestamp or absolute installation-path identity.
The explicit contract and its maintenance requirements are documented below.

### T1 checkpoint

- Shared helper and tests are now in the proposed paths. No runtime modules changed.
- `t1-tracked-red.log`: new test could not import the missing helper (expected).
- `t1-resolution-red.log`: 19 passed, 1 failed; a nested package could shadow the
  fingerprinted install. Checking only `require.resolve` retained cached lookup
  results; direct ancestor-directory inspection fixes this without cache mutation.
- `node --test scripts/tests/bake-provenance.test.js`: 22 passed, zero failures/skips
  (`t1-green.log`). Final tooling gate: 187 passed, 0 failed, 3 existing media
  skips (ffmpeg/ffprobe unavailable), `final-tooling.log` and `.runtime/agent/tooling.json`.
- Version 2 fingerprints sorted package-relative paths and SHA-256 content digests
  for installed Three.js, including loader/addon/build/source bytes. Package-root
  pnpm links are supported, internal links rejected, root `node_modules` and macOS
  `.DS_Store` metadata excluded. Exact declared/installed version and no new
  runtime/optional/peer dependencies are required. No whole-lockfile parser.
- Existing pins are retained; the audited authored local avatar module closure is
  added, excluding generated corrections (outputs, not authored recipes).
- Fixed required paths are owned by the helper; receipts cannot omit paths or
  introduce arbitrary filesystem paths. All checks run against the supplied root.
- Next: T2 migrate callers, run real bakes, compare output hashes, then integration.

### T2/T3 checkpoint — 2026-10-20

- HEAD remains `a35214f38795ced1ee6867aad5c3c2723a7ceaae`; no commits made.
- Five scripts and four test files now share the version-2 contract. Existing
  geometry/contact/topology assertions are intact. No runtime source changes.
- The new packed-decoder mutation test first failed (`t1-packed-red.log`);
  `packed-morph-data.js` is authored, despite its name, and is now pinned for all
  five bakes. A root-URL negative case also caught a nonterminating ancestor
  walk; the invalid-root guard is covered by a subprocess deadline regression.
- All five final `--write` commands passed under the shared browser lock
  (`t2-bake-write-final.log`). `regeneration-proof.json` proves every original
  non-lock pin is retained, diagnostics are identical, and all five generated
  data files are byte-identical to the baseline. The authored packed decoder is
  also unchanged. Final `--check` and full garment suites are running.
- Three.js identity: version `0.186.1`, 1,263 package files,
  SHA-256 `04bf04e18b17b609d182c0d36fadac0a576e8f0b54044f6826861b3a84c433c7`.
- Owned integration branch `test/garment-bake-provenance-554`, checkout
  `/Users/buns/Documents/GitHub/BunsDev/river-oaks-garment-bake-554-integration`,
  shares base HEAD. Only the package/lock delta from #554 at `bd1fac4c` relative
  to its merge base `65896c72` was applied, then this supporting patch. Frozen
  install passed. No other branch, env or private runtime state was copied.
- Integration command (running): helper/full garment tests; all five `--check`;
  `pnpm test`; `pnpm run build`, under one owned browser-lock entry. No rebake in
  this checkout. Its evidence is `.runtime/garment-provenance/integration.log`.
- Own `PATH="$PWD/.venv/bin:$PATH" pnpm run verify` is running after the passed
  tooling gate. Full with an isolated Redis service and final review remain.
- Uncommitted: helper/tests, five generators, five receipts, four garment tests,
  character-studio documentation and this ledger. Supporting package/lock and
  morph-data files are unchanged. Live task owns both branches.
- Next: record final focused/core outcomes; run full with disposable Redis;
  collect #554 integration evidence; complete one fresh code review and PR draft.

### Final review

A fresh, read-only `gpt-6-astra` reviewer inspected the entire diff and untracked
helper/tests. No critical, important or actionable minor issues were found. The
reviewer independently validated all five current receipts, complete authored
static import closure, package fingerprint, original non-lock pins, unchanged
morph outputs and diagnostics. No source changes requested. Gates and PR draft
were still pending, so review does not certify their completion.

Final rulings on considered/outside-review behavior:
- Future import/dependency audits remain a documented maintenance responsibility;
  current authored closure is complete.
- Generated corrections are outputs, not authored recipes; each has output
  integrity validation. The packed decoder is an authored input.
- Conservative extra local and Three.js package bytes are intentional.
- Host Node patch/custom loaders are outside the supported-runtime identity.
- #545 combined geometry remains that PR integration's responsibility; this task
  provides the required safe regeneration instructions.
- Core/full/integration and final draft completion remain the executor's evidence
  responsibility. Hosted CI/native/rendered/production acceptance and publication
  are outside the authorized endpoint.

### T2 complete

`final-focused.log`: all five real generators passed `--check`, then the helper
and four full garment test files passed **47 tests, 0 failed, 0 skipped**. R3 is
proven by that reproduction plus `regeneration-proof.json` baseline hashes.
No generator or acceptance logic was changed after this run began.

### Core gate complete; full gate running

`PATH="$PWD/.venv/bin:$PATH" pnpm run verify` passed all 11 phases
(`final-core.log`, `final-core.json`). Underlying results: tooling 187 pass / 3
existing media skips; preview 3,699 pass / 1 existing Vince glazing negative-test skip (approach already obstructed); server 732 pass / 212
Redis skips; desktop 115 pass / 3 Windows-only skips; Python 145 pass (66 existing
warnings); build, lint/format and secret scan passed. The synthetic demo verifier's
expected exit 2 is its configured successful domain result, not an ignored error.

Full gate now runs through local `.runtime/garment-provenance/run-full.py`:
it reserves a free loopback port, starts its own nonpersistent Redis child,
waits up to 5 seconds for PONG, invokes `pnpm run verify full` with the supported
Python PATH and an owned `REDIS_URL`, then stops only that child in `finally`.
No shared database or environment file is used. Actual logs/receipt:
`final-full.log`, `isolated-redis.json`, `redis.log`, `.runtime/agent/full.json`.
Full dependency audit has passed; remaining stages are in progress. Ordinary
runner task deadlines and browser-queue serialization remain enabled.

Fresh #545/#504/#563 metadata remains at the heads recorded above. PR text is
prepared locally at `.runtime/garment-provenance/PR.md`, with outstanding gates
explicitly marked pending until their actual results are available.

`pnpm run --silent project:check --github` repeated at this checkpoint: exit 1,
57 existing coordination gaps, none for `garment-bake-provenance-554`. This is
recorded as a repository-tracking failure, not a passing check or a code defect.
See `project-final.json` and `project-final.stderr` for current raw evidence.

### Browser queue correction

The first full run passed all 13 non-browser stages, including **986 Redis tests,
0 failures/skips**, then waited behind six queued local runs at `security-browser`.
Inspection of `scripts/agent.mjs:42` showed the task deadline includes queue wait.
To avoid a queue-induced timeout, the executor sent SIGTERM only to the owned
full agent runner while it was waiting; it recorded `ABORT_ERR` for that phase
and `not_run` for later phases. This is an interrupted/failed profile, not a pass
or assertion failure. Its Redis child stopped in the harness's `finally` block.
Logs and receipt are retained as `interrupted-final-full.log`,
`interrupted-full.json`, `interrupted-isolated-redis.json`, `interrupted-redis.log`.

The replacement command uses the documented nesting behavior, without changing
any task deadlines or assertions:

```sh
node scripts/browser-lock.mjs 'garment provenance full gate' -- \
  .venv/bin/python .runtime/garment-provenance/run-full.py
```

It waits outside the verifier's task deadlines; once acquired, nested browser
runners inherit the lock. The entire normal full profile will run. This is one
reasoned environment/queue correction, not repeated retries after test failures.

### R4 integration complete; final checkpoint before queued full run

- HEAD/base remains `a35214f38795ced1ee6867aad5c3c2723a7ceaae` in both owned
  checkouts. Branch/worktree assignments are recorded above. No commits or remote
  mutations have occurred.
- #554 delta at `bd1fac4c84544a7a0d6d825403910dc86cb4bd99` passed frozen install,
  helper/full garment suites (47 pass, 0 skip), all five real generators with
  `--check`, `pnpm test` (3,699 pass, 1 existing Vince skip), and `pnpm run build`.
  The integration command exited 0. All five receipt bytes and morph-data bytes
  match the supporting tree, which matches the original morph baseline. No
  `--write` ran in integration. See `integration-proof.json` and the integration
  checkout's `.runtime/garment-provenance/integration.log`.
- All reviewed source/receipt hashes still match `candidate-files.json` in both
  trees. Supporting `package.json` and `pnpm-lock.yaml` match HEAD exactly.
- T0, T1, T2 and T3 integration/docs/review are complete. The only remaining
  acceptance item is the full profile, then accurate final ledger/PR draft and
  task-status reconciliation. The queued wrapper is running; do not start a
  duplicate full run. Inspect `full-queue.log`, `.runtime/agent/full.json`, and
  `isolated-redis.json` for its eventual execution. The previous profile is an
  interrupted attempt retained separately, never a passing full receipt.
- Next action: wait for the existing queue entry `garment provenance full gate`,
  inspect each actual full result, preserve generated evidence, restore only
  reports generated by this run, and finish handoff. No source changes are
  expected unless a relevant verification failure exposes a defect.

### Full gate started

The outer-queued full run acquired the slot and started at `2026-10-20T23:39:04.845Z`.
It owns a fresh loopback Redis child; actual PID/port and cleanup state are in
`isolated-redis.json`. This run, unlike the interrupted queue-wait attempt, is
executing with the outer lock held. Dependency audit and tooling have passed;
preview is in progress. Continue the existing run; do not launch a duplicate.

### Dependency PR refresh during final gate

#554 rebased at 2026-10-20T23:39:38Z to
`eb0bce7f6cc955137313ab34eb5872c09eecf174`, now based on this task's exact
`a35214f38795ced1ee6867aad5c3c2723a7ceaae` base. Fresh GitHub file inventory still
contains only `package.json` and `pnpm-lock.yaml`. Both file bytes exactly match
the already-tested integration checkout; their SHA-256 digests are recorded in
`integration-proof.json`. Therefore existing integration evidence applies to this
refreshed dependency delta without another install/rebake/test cycle. Old head
remains historical provenance for the original test setup. `origin/main` remains
at this task's base. No source-plan revision is needed.

### Durable output identity

These five SHA-256 values are identical at the base, after real regeneration,
and in the #554 dependency integration without regeneration.

| Generated output | SHA-256 |
| --- | --- |
| `coat-tail-morph-data.js` | `5cc23cdfbd965a2ddf74d8546e7605f44424341d7583fece66784be3cae6c39a` |
| `lyra-drape-morph-data.js` | `3796e219ef00092b8d4bf7456f7700d975718b808965e28145072b1897a42434` |
| `silvan-drape-morph-data.js` | `a63cc845595955cec937f50964bd2f3c648b4268f26642d53a0f557e535f94a5` |
| `skirt-seat-morph-data.js` | `54e926224089e8fe86b0d91415eed210164ff9bd0f9185ecb341ee0f039e9f72` |
| `vesper-skirt-morph-data.js` | `3bf6496042e756cb04b4837d7f2aa0116d6c7dd7edde787a5db666b8c3948d6e` |

## Final handoff — 2026-10-21T00:18:54.290Z

Local endpoint achieved on `fix/garment-bake-provenance-554`, worktree and exact
base/HEAD recorded above. **No commits were created.** All 18 intended files
remain unstaged/uncommitted: the shared helper and its behavioral tests, five
bake scripts, five receipts, four garment test files, character-studio docs,
and this ledger. Integration remains on `test/garment-bake-provenance-554` with
the supporting patch plus the tested dependency delta. Preserve both checkouts.

| Requirement | Completion evidence |
| --- | --- |
| R1 | Unrelated package/lock mutation fixture passes; real #554 frozen install passes unchanged receipt verification |
| R2 | 22 behavioral fixtures cover true version/content/source/rig/license/output mutations, missing and malformed inputs, omitted receipt keys, nested installs and unsupported symlinks; expected red controls retained |
| R3 | Five real `--write` and five `--check` pass; all five generated outputs equal baseline and HEAD byte-for-byte; diagnostics unchanged; original non-lock pins retained |
| R4 | Reviewed #554 head `eb0bce7f6cc955137313ab34eb5872c09eecf174` has exactly the dependency bytes tested in integration; #545 source-first regeneration instructions are in character-studio docs and PR draft |
| R5 | Docs, independent review, focused/tooling/core/full gates, integration evidence, final diff audit and handoff complete; existing skips and tracking gaps recorded |

### Final commands and actual outcomes

All supporting commands ran from the owned supporting worktree. Python-dependent
commands used `PATH="$PWD/.venv/bin:$PATH"` as established by baseline diagnosis.

| Command | Actual outcome |
| --- | --- |
| `node --test scripts/tests/bake-provenance.test.js` | 22 pass, 0 fail/skip |
| Five generators with `--write`, then `--check`, serialized through `scripts/browser-lock.mjs` | Passed; no changed output bytes or diagnostics |
| `node --test scripts/tests/bake-provenance.test.js preview/tests/skirt-seat-bake.test.js preview/tests/drape-seat-bake.test.js preview/tests/silvan-drape.test.js preview/tests/coat-tails.test.js` | 47 pass, 0 fail/skip |
| `pnpm run verify tooling` | Passed; 187 pass, 0 fail, 3 pre-existing media skips |
| `pnpm run verify` | Passed all 11 phases; counts and narrower Redis scope recorded above |
| `node scripts/browser-lock.mjs 'garment provenance full gate' -- .venv/bin/python .runtime/garment-provenance/run-full.py` (invokes `pnpm run verify full`) | Passed all 18 normal phases; no deadlines/assertions changed; own Redis stopped; final exit 0 |
| In integration: `pnpm install --frozen-lockfile`, focused tests, all five `--check`, `pnpm test`, `pnpm run build` | All passed; no integration rebake; exact receipt/output/source identities preserved |
| `git diff --check`; candidate/output/manifest hash audit | Passed; supporting package/lock and register snapshot unchanged |

Full counts: tooling **187 passed / 3 skipped**; preview **3,699 passed / 1
skipped**; Redis server **986 passed / 0 skipped**; desktop **115 passed / 3
skipped**; Python **145 passed** (66 warnings); security browser **2 passed**;
reflections passed; **16 experience journeys**, **24 shared journeys**, and
**19 IPIC screening checks** passed. Build, both secret scans, dependency audit,
Python lint/format and expected-result synthetic demo checks passed. All phase
statuses and exit codes are in `final-full.json` and `.runtime/agent/full.json`.

The seven existing full-suite skips are three media-intake checks requiring
ffmpeg/ffprobe, the obstructed Vince glazing negative case, and three Windows
PowerShell checks on this macOS host. They are not acceptance evidence. Native
Unreal/packaged installers, live WorkOS/provider calls, hosted CI, production,
human visual/accessibility acceptance and target-device performance are not
proven by this local endpoint. #554's hosted Verify/Desktop were in progress at
its final metadata refresh; no inline review threads were returned. This patch
has not been published to either workflow.

### Artifacts and final integrity

All local evidence lives in `.runtime/garment-provenance/` unless noted:
- `final-audit.json`, `candidate-files.json`, `regeneration-proof.json`,
  `integration-proof.json`: unchanged reviewed source, morph bytes, diagnostics,
  retained pins, relevant package identity and dependency-delta identity.
- `final-focused.log`, `final-tooling.log/json`, `final-core.log/json`,
  `final-full.log/json`; integration checkout's `integration.log`.
- `full-reports/data/reports/experience.json` and `shared-experience.json` preserve
  this run's generated browser evidence. Their tracked historical versions were
  restored after capture, as required by the workflow. Screenshots and screening
  report remain under `output/playwright/`.
- `isolated-redis.json` confirms verification exit 0 and the owned Redis process
  stopped. The earlier queue-wait interruption and system-Python baseline failure
  remain preserved with their actual failed/interrupted statuses.
- `PR.md`: prepared local PR title/body. `review.patch`: complete reviewable diff,
  including the three new files; refreshed after this handoff update.

The final source fingerprint matches the independently reviewed candidate. No
runtime appearance, server authority, licenses, dependency versions, lockfiles,
or generated morph-data content changed in the supporting patch. New imports or
Three.js dependencies require maintaining the explicit audit as documented.

Remaining delivery steps: obtain separate commit/publication authorization,
review/stage only the intended patch, run applicable hooks and hosted CI on the
published head, and let the authorized owner handle integration/merge. Do not
label this task delivered or retire its worktrees without exact delivery and
restoration evidence. There is no remaining implementation work for R1–R5.

Final tracking reconciliation: `pnpm run --silent project:check --github` exited
1 with the same **57 unrelated coordination gaps**, none for this task
(`project-handoff.json`). The live record is `queued`, owner/lease released,
with next action explicitly limited to reviewing the locally complete patch and
obtaining separate delivery authorization. It is not marked delivered. Final
#554 metadata still showed open at `eb0bce7f6cc955137313ab34eb5872c09eecf174`.
