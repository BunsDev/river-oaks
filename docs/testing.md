# Tests that protect behavior

Run `uv run pytest -q` for deterministic local checks. Tests use synthetic geometry, in-process HTTP transports, and temporary repositories. They do not download live GIS, call paid Jev inference, or require a GPU.

| Risk | Test evidence |
| --- | --- |
| Wrong units or handedness | Python projection round trip in meters; separate unexecuted UE coordinate tests |
| Partial GIS download | Missing object IDs reject the page; long-ID queries use POST |
| Corrupted generated geography | Shifted/missing roads, invalid bounds, and houses outside setbacks fail verification |
| Fabricated canopy accuracy | Missing/same-source reference blocks; equal coverage in a different location fails |
| Inference stalls or misbehaves | 500-agent deadline/cancellation, concurrency cap, invalid actions, partial answers, and local collision override |
| Service changes schedules | Night and midday jogger pauses persist with the service connected |
| Unbounded service queue | Concurrent request returns 503 while the first is active |
| Secret accidentally committed | Index scan catches a synthetic token despite a clean unstaged replacement; `.env` force-add is rejected; missing scanner fails closed; actual Git commit is blocked in a temporary repository |

There is no arbitrary test-count or coverage-percentage target. Add a regression that reproduces a risk or failure before fixing it. Avoid snapshotting implementation details, mocking your own helpers, host-sensitive timing assertions, and tests that only assert source strings exist.

The 500-agent timing script records measurements without enforcing host-dependent pass thresholds. It measures local Python classification only. Full inference latency must include serialization, networking, provider time, batch deadlines, fallback rates, and all-agent update age. UE acceptance needs a frame-time trace recording resolution, upscaling, GPU/driver, scene, population, weather, and engine version.

Unreal automation tests are authored but unexecuted. They provide no compile/UHT, bootstrap, collision integration, visual, packaging, or performance proof. See [engine verification](unreal.md#required-engine-verification).

The installed secret hook runs on commits in this checkout. New clones must install it. CI scans the worktree and complete fetched history; require its checks in branch protection to enforce the merge gate. Scanners cannot detect every secret format, and local hooks can be bypassed. Tests verify the configured guard's behavior rather than claiming absolute prevention.
