# Crowded avatar performance

Goal: improve the measured crowded-world frame cost while preserving the detailed
avatar looks, animation and Jevica-only building/wish authority.

## Execution ledger

- [x] Revalidate main, concurrent workspace ownership and prior audit evidence.
- [x] Reproduce at 32 players and capture browser CPU/render workload evidence.
- [x] Identify the owning hot path and test one specific optimization hypothesis.
- [x] Implement the verified optimization with geometry/animation fidelity checks.
- [x] Compare hardware capacity samples and inspect rendered frames.
- [x] Run required correctness, build, browser and secret gates.

Delivery requires a verified commit, terminal hosted checks, merge, deployment
smoke and cleanup of only this task's worktree. Full virtual-world scope and
hosted multi-region/physical-mobile readiness remain unfinished.

## Root cause and experiment

A 1 ms CDP sampler attributed 74.1%/78.1% of desktop/phone-viewport sampled
time to the composer, including 19.5%/21.2% in shadows. Remote animation was
7.8%/7.5%. These are overlapping inclusive samples, not GPU timer queries.
Each forest look added 265/294 separate accessory meshes. The same-bone,
same-material static parts now use the existing costume batcher with an
opt-in eligibility predicate. Named, hidden, transparent and Lyra outfit
pieces retain their independent handles.

Both regression tests first failed against main (29 Sable draws; independently
controlled pieces incorrectly merged by the general helper). After the patch,
all 20 reference forms retain their exact authored triangle totals, baked
position/normal/UV data follows animated bones, resources release and Lyra
prowl visibility restores. The existing six romance-look tests also pass.

Hardware comparisons run sequentially at Sharpest, 10 s warmup and 15 s
measurement, at 1/32 players in both viewports. Baseline/candidate receipts
include SHA-256 hashes of the accessory and batching sources.

The paired runs passed, with 56–57% fewer capacity draws and frame p95
83.3 -> 50.1 ms desktop / 66.7 -> 50.0 ms phone viewport. All peer labels,
assets, authority checks, reconnect and departure passed; movement corrections
were zero. Full-render screenshots were inspected. Source hashes retain the
measured c8daf1b basis even if delivery later integrates newer main.

## Local verification on eae8405 with this patch

- Preview: 664 passed, zero failures/skips.
- Redis 7.4.11 on owned random loopback port: 255 server tests passed, no skips.
- Desktop: 8 passed; production build succeeded and capacity hook is absent.
- Python: lint/format clean, 138 passed (two upstream deprecation warnings).
- Offline pipeline: demo succeeds; verifier returns its required exit 2.
- Full-render shared `multiplayer` journey and reflection reload passed on Metal.
- Worktree and full-history secret scans clean; staged scan required at commit.

The integration picks up main's WorkOS 11 dependency update. Performance receipts
retain the earlier measured dependency versions and source hashes.

## Integration refresh

Main advanced to 9e5deaa (rails navigation and Lyra rear coverage) during hosted
checks. Rebased cleanly, retained the upstream opaque wrap, then reran the full
preview suite (668 passed, no skips), production build and full-render shared
multiplayer journey. The two batching regressions also passed on this base.
Performance receipts continue to describe the measured c8daf1b comparison.
