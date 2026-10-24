# Commons activation rehearsal and runbook

Register task `commons-activation-rehearsal`, branch `test/commons-activation-rehearsal-20261024`, worktree `river-oaks-commons-activation`, base `2cbc4dc4`.

## Objective

Prepare a reversible production activation of `east-garden-commons-market-1`. Rehearse the documented revision rollout end to end against an isolated Redis: the epoch raise, the checkpoint migration, the overlap, rollback and re-activation. Prove that accounts, chat, creations and positions survive both directions. Write the operator runbook with go/no-go criteria and rollback triggers. Production configuration and deployment stay with Val.

## Files owned

`server/tests/commons-activation-rehearsal.test.js`, `docs/world-expansion-activation.md`, this ledger, the `district_superseded` classification in `server/distributed-app.js`, and one link in `docs/world-expansion.md`.

## Results

- [x] Rehearsal through the real Redis gateway, tickets and WebSockets, from `river-oaks-gardens-3` (26/26 checks) and `river-oaks-garage-1` (28/28). Receipts are in `.runtime/activation/rehearsal-*.json` (local). The disposable loopback Redis has no persistence.
- [x] **Finding: the Commons rolls back only to the Gardens.** A rollback straight to the garage fails closed: the town is unavailable (`checkpoint_invalid`/`invalid_envelope`) and nothing is rewritten. A Gardens rollback with another raise recovers it. The runbook names `river-oaks-gardens-3` as the only rollback target and makes "production is on the Gardens" a go criterion.
- [x] **Finding: an overlapping old deployment relays to the new coordinator.** It does not refuse while the new one is live; only a lone old deployment refuses. The original "stale refuses" assertion was wrong and was corrected to test both cases.
- [x] **Observability fix:** `Invalid durable town district` was logged as the generic `unavailable`, so the expected refusal of an old deployment was indistinguishable from an outage. Admission now logs `district_superseded` with the fixed reason `newer_district_epoch` or `district_epoch_unchanged`.
- [x] Runbook: `docs/world-expansion-activation.md`.
- Incident during this session: while stopping an interrupted rehearsal run, a `pkill` pattern matched every Redis on 4xxxx/5xxxx ports, not only the rehearsal's own. No live process held a `REDIS_URL` in that range (checked through process environments). The one other live `verify full` used port 16473 and was untouched, so any other instance stopped was orphaned. Later runs track their own PID.
- [x] Core verification: agent 218, preview 3,902 (1 skip), server 867 (221 Redis skips, including the two rehearsal tests; the receipts above are their evidence), desktop 115 (3 skips), build, Python and secrets all passed. The first attempt failed four archive tests on the host's Python 3.9 (`tarfile` `filter`); it was rerun with Homebrew Python 3.12 first on `PATH`, unrelated to this change.
- [ ] Rerun on the final release commit once #623 and the polish are on `main`.

## Gaps and next step

The rehearsal does not cover production Redis scale and latency, Vercel process replacement timing, live WorkOS, garage-only residents at activation, or hosted load. Next: core, commit, draft PR. Rerun on the release commit before the go/no-go.
