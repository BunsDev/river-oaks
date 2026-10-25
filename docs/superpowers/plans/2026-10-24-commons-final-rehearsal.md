# Bayou Market Commons: final-source activation rehearsal and go/no-go

Objective: run the activation/rollback rehearsal from [the runbook](../../world-expansion-activation.md) on the release commit (after #623), and give Val a go/no-go summary against the runbook's five conditions. It is a follow-up of `commons-activation-rehearsal` (#630, merged as `67203a6a`), agreed with river-oaks-a3, who owns #623.

Owner: `claude:river-oaks-33 (3735c42c)`, task `commons-final-rehearsal-20261024`. Worktree `river-oaks-commons-final-rehearsal`, branch `test/commons-final-rehearsal-20261024`, created from origin/main `67203a6a`. This ledger is the only file owned. Nothing here touches production; activation needs Val's explicit go.

## Pre-check on main before #623 (`67203a6a`)

Command, with a task-owned disposable loopback Redis (no persistence; stopped afterwards):

```sh
REDIS_URL=redis://127.0.0.1:<port> RIVER_OAKS_REHEARSAL_RECEIPT=.runtime/activation/precheck-<head>-{from}.json \
  node --test --test-force-exit server/tests/commons-activation-rehearsal.test.js
```

| From | Result | Checks | Phases (revision, epoch) |
| --- | --- | --- | --- |
| `river-oaks-gardens-3` | Passed (22.6 s) | 26/26 | before (gardens, 1), restart (gardens, 1), activated (commons, 2), rolled back (gardens, 3), reactivated (commons, 4) |
| `river-oaks-garage-1` | Passed (22.5 s) | 28/28 | before (garage, 1), restart (garage, 1), activated (commons, 2), rolled back (gardens, 4), reactivated (commons, 5) |

The run took 46 s at 19:30Z and the process exited; a3's gateway-leak fix holds. Receipts are in `.runtime/activation/`, ignored by Git (sha256 `8d63bb93…` garage, `5d46c769…` gardens).

The checks show:
- the migration logged exactly once;
- an old deployment refused with `district_superseded`, leaving the town byte for byte unchanged;
- the rollback returned the Commons resident to District ground;
- a mistaken garage rollback fails closed;
- re-activation starts a fresh Lantern Walk.

One observation: the receipt's top-level `migrationLogs` field is empty, although the migration check's own detail holds the `district_commons_checkpoint_migrated` line. This is how the receipt reports it, not a rehearsal failure.

## Release commit

#623 merged at 2026-10-24T19:52Z as `09bd7a836d4842a91bf50606ffdc6119c69c3591`, from reviewed head `f1715eff` through the merge guard (river-oaks-a3). It is main's head and the release candidate. The branch was fast-forwarded to it.

| Check on `09bd7a83` | Result |
| --- | --- |
| Hosted Verify on main (run 40127237904) | Success on attempt 1 |
| Rehearsal from `river-oaks-gardens-3` (fresh task-owned loopback Redis, 19:53Z) | Passed, 26/26 checks; phases gardens 1, gardens 1, commons 2, gardens 3, commons 4; migration logged exactly once |
| Rehearsal from `river-oaks-garage-1` | Passed, 28/28 checks; phases garage 1, garage 1, commons 2, gardens 4, commons 5 |
| `world-gate-587` (local, two clients, one browser-lock turn 20:17–21:28Z) | Passed, 26/26 checks (620 s) |
| `world-streaming` (same turn) | Passed, 286/286 checks (3,418 s): two warmups plus 20 measured two-client round trips with full eviction, reconnects, graphics recovery, failed-module and failed-asset recovery, bounded owned resources |
| `east-garden-commons` (same turn) | Passed, 10/10 checks (239 s): two-client keyboard walk-in, shared chess, reconnect, Lantern Walk, return |

Receipts (ignored or untracked, in the worktree): rehearsal `.runtime/activation/release-09bd7a83…-{from}.json` (sha256 `77423e13…` gardens, `f13a2a67…` garage). Journeys `data/reports/release-{world-gate-587,world-streaming,east-garden-commons}-09bd7a83….json` (sha256 `5eedd71a…`, `e4c2ee02…`, `60ffc90b…`).

### Activation cost: Gardens against Commons on the same release build

The [two-player protocol](../../acceptance/two-player-perf-20261023.md) was run as one ABBA under a single held browser lock (21:29–22:00Z): `river-oaks-gardens-3`, Commons, Commons, `river-oaks-gardens-3`. It used `node preview/audit/world-expansion-baseline.js --label=rel-<arm>` with `RIVER_OAKS_BASELINE_REVISION` per arm. The settings were the official ones: vsync on, desktop 1440×1000 and phone-sized 390×844 viewport, one and two clients, three warmed 30-second samples, fixed arrival camera. The comparison was `node preview/audit/baseline-compare.js --base=g1,g2 --candidate=c1,c2`, against the provisional budgets in `docs/world-expansion.md` (10% frame/CPU, 20% reconnect, drift ≤ 0.5 m).

| Workload | Metric | Gardens | Commons | Change | Decision |
| --- | --- | ---: | ---: | ---: | --- |
| Desktop, 1 client | frame mean | 16.67 ms | 16.67 ms | 0.0% | within |
| Desktop, 1 client | CPU submission p95 | 10.10 ms | 10.40 ms | +3.0% | within |
| Desktop, 2 clients | frame mean | 25.05 ms | 24.75 ms | −1.2% | within |
| Desktop, 2 clients | CPU submission p95 | 12.25 ms | 12.20 ms | −0.4% | within |
| Desktop | reconnect | 988 ms | 920 ms | −6.9% | within |
| Phone viewport, 1 client | frame mean | 16.67 ms | 16.67 ms | 0.0% | within |
| Phone viewport, 1 client | CPU submission p95 | 9.35 ms | 8.80 ms | −5.9% | within |
| Phone viewport, 2 clients | frame mean | 20.79 ms | 20.62 ms | −0.8% | within |
| Phone viewport, 2 clients | CPU submission p95 | 11.45 ms | 10.70 ms | −6.6% | within |
| Phone viewport | reconnect | 832 ms | 990 ms | +19.1% | within (close to the 20% limit) |

Frame p95 (informational) was identical in every row: 16.7 ms for one client, 33.4 ms for two. Reconnect position drift was 0 m in every arm.

Host load per sample (median across 13 samples) was 11.1 and 8.1 for the Gardens arms and 10.0 and 8.7 for the Commons arms. No arm ran above twice another's load, although the 1-minute load was briefly 20 at the start of c1.

Per-run phone reconnect was 823 and 841 ms on the Gardens against 1,042 and 938 ms on the Commons. Desktop reconnect varied from 831 to 1,086 ms in both directions. Two rounds cannot separate a cost of a few percent from run-to-run variation.

Receipts: `.runtime/world-expansion/baseline-rel-{g1,c1,c2,g2}-*/report.json` and `compare-rel-gardens-vs-commons.json` (sha256 `647404267cca22ae`).

Scope: this compares the two revisions on one build, which is the cost of switching production. It is not a re-comparison against the historical #580 District baseline (#626 measured main `98ac7d7b` within budget under its proposed amendment, which still awaits Val). It uses the desktop GPU for the phone viewport, not a phone.

## Go/no-go against the runbook

**Recommendation: NO-GO for production activation today. The engineering evidence is green on the release commit; the remaining blockers are human and operational decisions only Val and an operator can supply.** Nothing in this round touched production, and the default production revision has no Commons, so merging #623 changed nothing for residents.

| # | Runbook condition | Status on `09bd7a83` | What closes it |
| --- | --- | --- | --- |
| 1 | Build merged through the merge guard; hosted Verify green on the release commit | **Met.** #623 merged as `09bd7a83` via the guard; main Verify run 40127237904 succeeded on attempt 1 | — |
| 2 | #587 gate on that build | **Engineering items met; human items open.** `world-gate-587` passed 26/26 (traversal, named controls, collision, reconnect, notice bounds, rebuild cleanup, keyboard). `world-streaming` passed 286/286 (traversal with full eviction, released assets, bounded resources, recovery). The two-client journey passed locally (`east-garden-commons` 10/10) and on hosted Verify. Gardens against Commons frame/CPU/reconnect is within budget on desktop and the phone viewport. Not covered by automation: touch on real devices, screen-reader and human accessibility review, and visual judgement of hitch and pop-in | Val's hands-on review and the agreed device checks |
| 3 | Rehearsal on the release commit, both starting revisions, isolated Redis | **Met.** 26/26 from the Gardens and 28/28 from the garage | — |
| 4 | Val's visual approval and agreed physical-device results recorded | **Open.** Not recorded; never simulated | Val |
| 5 | Production state: current revision is `river-oaks-gardens-3`, epoch known, rollback-capable watcher for 30 minutes | **Open.** Not checked; this session has no authority to inspect production | An operator, before the switch |

Also open, outside the runbook's five conditions:
- **Budget amendment.** #626's proposed frame-metric budget amendment awaits Val's decision.
- **#641, the luxe polish.** It is held for Val's review and is not in this release commit. If it lands before activation, the release commit changes, and the rehearsal, the gate journeys and this paired comparison must rerun on the new commit. #641 adds 7 draw calls and about 58% more kit geometry.
- **Phone reconnect.** Its +19.1% sits just under the 20% allowance and deserves a third round, or a look on a real phone, before activation.

Next action: Val decides conditions 2 (human items) and 4, and an operator confirms condition 5. Then follow the runbook's Switch, Verify and Rollback sections.
