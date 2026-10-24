# Two-player performance budget

## Objective

Bring two-player rendering back within the provisional budgets (frame/CPU p95 within 10%, reconnect within 20% of the pinned baseline) on this Mac's desktop and phone-viewport profiles without reducing approved visual quality. Attribute the measured Phase 1 desktop two-client difference (frame p95 33.4 → 50.0 ms, CPU submission p95 14.7 → 17.7 ms) and the #583 streaming deltas. Fix what is in scope; quantify legitimate costs and propose budget amendments instead of hiding them.

## Ownership

Task `two-player-perf-budget-20261023`, owner `claude:river-oaks-40 (4e9c75)`. Worktree `river-oaks-two-player-perf`, branch `perf/two-player-budget-20261023` from main `98ac7d7b`. Comparison worktree `river-oaks-two-player-perf-base` is detached at the historical baseline `6ff47ba1` and carries an untracked copy of the extended harness only. Live owners of #582/#583 streaming, the expansion MVP, #584–586 and #587 are not edited; streaming findings go to their owner as patches.

## Files owned

- `preview/audit/world-expansion-baseline.js` (options, peer timing, phase breakdown, unmeasured CPU-profile window)
- `preview/audit/baseline-options.js`, `preview/tests/baseline-options.test.js`
- This ledger; client fixes added below as they are proven.

## Initial analysis of the Phase 1 receipts

From `docs/acceptance/phase1-review-20261023/{historical-,}mac-baseline.json`:

- Every frame p95 is a 60 Hz refresh multiple (16.7 / 33.4 / 50.0 ms). The desktop two-client "+49.7%" is one quantization step: p95 crossed from two to three refreshes.
- Mean frame interval (30 s / frame count) moved from 25.1–29.2 ms to 32.6–35.2 ms on desktop two-client, a continuous difference of roughly +30%. Phone two-client means are unchanged (21.4–24.7 vs 22.8–24.3 ms).
- Draw calls (1,689–1,707) and triangles are unchanged between revisions, so no new render work explains the difference.
- The two "clients" are pages in one headless browser sharing one GPU process, only the owner page was timed, and host one-minute load ranged 14–66 across runs. The comparison was not paired.

Client source changes between `6ff47ba1` and `c2cac2d3` are small (flight, walking, multiplayer client, opt-in Commons). Between `c2cac2d3` and main `98ac7d7b`: crime/rival figures, world policy UI, campus, town snapshot.

## Plan

1. Extend the baseline harness without changing its default protocol: `--vsync=off`, `--profiles`, `--samples`, `--label`, `--cpu-profile` (separate unmeasured window), peer-page timing, mean/missed-refresh summaries and per-phase CPU.
2. Paired ABBA under one held browser lock: base `6ff47ba1` vs main, protocol (vsync on) both profiles, then vsync off desktop with CPU profiles.
3. Attribute any remaining difference by phase and profile; bisect only if a real difference survives pairing.
4. Fix with regressions and per-fix A/B; verify core and full.

## Results

**Smoke:** the first combined smoke failed on base only because `preview/public/data/world-manifest.json` did not exist at `6ff47ba1`. Provenance now records an absent file's hash as `null`. Both smokes then passed.

**Paired ABBA** (2026-10-24 00:35–01:24 UTC, one held lock, all eight runs passed, every recorded source hash matches): every budgeted metric is within allowance on both profiles. Details and tables are in `docs/acceptance/two-player-perf-20261023.md`; raw reports, comparisons, matched images and gzipped CPU profiles are in `docs/acceptance/two-player-perf-20261023/` with `SHA256SUMS`.

- Vsync on, two clients: desktop frame mean −4.6%, CPU p95 +3.2%. Phone frame mean −3.0%, CPU p95 −7.1%. Reconnect −19.1% (desktop) and −11.0% (phone).
- Phone two-client frame p95 reproduced the +49.6% refresh step while mean and CPU improved.
- Uncapped (vsync off) desktop, two clients: frame mean +5.1%, CPU p95 +7.4%, reconnect +4.4%. All within budget; two rounds cannot attribute a few-percent change.
- Draw calls and geometry/texture counts are identical. The CPU profile diff is within ±4 points per module.
- Matched images show no visual change; only birds in flight differ.

**Conclusion:** no source regression, so no renderer fix was warranted. The over-budget readings in Phase 1 and #583 come from unpaired comparisons of vsync-quantized p95. A protocol amendment is proposed for the user's decision (same thresholds, paired runs, continuous metrics).

**Streaming (#583):** the owner's own lower-load repeat (`independent-matched-repeat`) shows Commons equal to or below Gardens on CPU p95, with identical frame p95. A note for the owner is at `.runtime/reviews/two-player-perf-583-note.md` in the primary checkout. No patch is needed.

## Verification

- **Focused:** 8/8 passed.
- **Core:** 11/11 stages passed (Python 3.12 on PATH). Attempt 1 failed only on host Python 3.9; that receipt is kept.
- **Full:** 18/18 stages passed with isolated Redis (since stopped). 17 experience and 27 shared journeys passed.

Receipt: `docs/acceptance/two-player-perf-20261023/verification.json`.

## Gaps

Physical iPhone (deferred by the user), production downloads, GPU memory bytes, hosted performance, thermal and idle-host conditions, separate-device two-player measurements, the crime rivals' danger zone, and the vsync-off phone profile.

## Next step

Get the PR's hosted checks and a decision from the user on the protocol amendment. Re-measure with the paired protocol when #583, #584–586 or the expansion MVP lands on main.
