# #368 slice: Office + IPIC performance profile on this Mac (2026-10-15)

Task `office-ipic-perf-368` · branch `test/office-ipic-perf-20261015` · worktree `../river-oaks-office-ipic-perf-20261015` · owner claude:river-oaks-1b (b929a625) · parent #359, package #368.

## Objective

#368 asks to "measure p50/p95 frame time, draw calls, visible triangles, resource/texture memory, transfer/load cost and playback drift on agreed named devices/settings", and to keep provisional budgets apart from accepted device limits. No session or comment had measured these for Office + IPIC.

This slice adds a repeatable, read-only runner and records one named local profile. It sets **no budgets**: those need agreed devices (Decisions for Val).

## Files owned

- `preview/e2e/office-ipic-perf.mjs` (new). It uses only the existing DEV render audit (`?render-audit=1`): `start`/`stop`, `view`/`release` and `graphics`.
- This ledger and `2026-10-15-office-ipic-perf/receipt.json` (the final run).

## Method

- **Profile:**
  - Apple M3 Max, Chromium 156.0.8078.4 headless, ANGLE Metal.
  - `--disable-gpu-vsync --disable-frame-rate-limit`, so intervals are render cost, not the display rate.
  - 1440×900 at DPR 1, Sharp quality (native scale, AO, bloom, 4 samples).
  - Loopback fixture town.
  - One page as the synthetic `owner` (Jevica), with `RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1` and an IPIC host grant.
- **Spaces.** Each space starts from a cold browser context.
  - **Street.** A fixed audit-camera pose 14 m out from IPIC's entrance, facing it, so street numbers are comparable across contexts.
  - **IPIC.** The five `IPIC_CAMERAS` poses (FOV 67), then the auditorium again with the fixture film playing.
  - **Penthouse.** The arrival view after the elevator.
  - **Legacy office.** The arrival view, on a second fixture with the default layout.
- **Per view.**
  - Three windows of 180 frames each, recording rAF interval and render CPU time (p50/p95).
  - `renderer.info` (draw calls and triangles summed over the frame's passes; geometries and textures resident).
  - JS heap (`performance.memory`).
  - Resource-timing bytes on entry. The buffer is raised so dev-server boot requests don't hide later fetches.
  - In the auditorium with the film, the absolute playback drift, sampled every 10 frames.

## Results: final run (receipt `2026-10-15-office-ipic-perf/receipt.json`, source `cd99570a`, load average 22.8 → 11.4)

| View | Interval p50 / p95 (ms) | Render CPU p50 (ms) | Draw calls | Triangles | Geometries / textures |
| --- | --- | --- | --- | --- | --- |
| Street, fixed pose (legacy context) | 13.5 / 17.0 | 12.8 | 973 | 4,075,400 | 550 / 195 |
| Street, fixed pose (penthouse context) | 13.6 / 17.4 | 12.9 | 986 | 3,980,846 | 481 / 177 |
| Street, fixed pose (IPIC context, first, under the heaviest load) | 15.8 / 33.5 | 15.1 | 973 | 4,075,400 | 550 / 196 |
| IPIC reception (T1) | 14.5 / 32.1 | 13.9 | 1,308 | 5,276,146 | 579 / 220 |
| IPIC mural | 15.5 / 33.3 | 14.9 | 1,704 | 5,393,945 | 579 / 220 |
| IPIC lounge | 11.9 / 15.8 | 11.2 | 713 | 3,341,995 | 579 / 220 |
| IPIC bar | **22.3** / 34.8 | 19.6 | **2,420** | **7,064,824** | 579 / 220 |
| IPIC auditorium (T3) | 11.5 / 16.0 | 10.9 | 789 | 3,533,116 | 579 / 220 |
| IPIC auditorium, film playing | 12.1 / 16.2 | 11.4 | 789 | 3,533,116 | 579 / 221 |
| Penthouse arrival (graybox) | 6.7 / 8.6 | 6.2 | 91 | 2,578 | 552 / 210 |
| Legacy office arrival | 7.4 / 11.3 | 6.8 | 329 | 56,996 | 621 / 239 |

- **JS heap:** 328–413 MB across views. Counters over repeated entry and exit are #407's soak, not this run.
- **Load cost** (decoded bytes; Vite dev server, so modules are unbundled):
  - Entering IPIC: 6 requests, 131 KB.
  - Starting the fixture film: cumulative 33 requests and 802 KB since the street.
  - Penthouse or legacy office entry: 4 requests, 0.2 KB. Their assets arrive with the town.
- **Entry time:**
  - IPIC by the destination list: 7.7 s.
  - Office lobby to the arrival view: 13.3–13.4 s, including the full-motion elevator sequence.
- **Playback drift** (one viewer, auditorium, film playing): |drift| p50 43–67 ms, p95 67–84 ms, max 84 ms over three windows of 19 samples. This is inside #368's 500 ms requirement. It sits above the 40 ms dead band, so rate correction stays engaged while the frame is about 12 ms.

**A correction to the receipt's wording.** The receipt's `profile` sentence says `renderer.info` is "the last render pass". That is wrong for this code: `main.js` sets `renderer.info.autoReset = false` and resets it once per frame (`main.js:206`, `main.js:949`), so the counts are frame totals across the shadow, AO and composer passes. The runner's sentence is corrected; the measured values are unchanged.

### Repeatability

Three full runs gave the same draw-call and triangle counts per view; timings moved with machine load.
- Run 1 had an unpinned street camera.
- Run 2 recorded no load bytes, because of the resource-timing buffer.
- Run 3 is the receipt.

The p50 values agree within about 2 ms between runs (bar: 16.5, 20.8 and 22.3 ms). The p95 values are bimodal on this shared workstation. The same street pose read 33.5 ms early in run 3 and 17 ms later. Read p95 as "occasional doubled frames under load", not as a property of a view.

## Findings

1. **The ground-floor IPIC views draw the district behind the interior walls.**
   - Isolated, the interior's views cost 12–61 draw calls and 56k–134k triangles (`docs/ipic-review/review.json`). In game the same poses draw 789–2,420 calls and 3.3M–7.1M triangles.
   - The bar, which looks east across the block, is the most expensive view measured, at 22 ms p50.
   - `preview/src/interior-exterior-culling.js` already culls the exterior, but only for generated rooms (`room.generatedPlan`). IPIC is an approved photo interior, so it never qualifies.
   - The in-game counts include every pass of the frame and the residents, so the split is approximate.
2. **The enclosed upper floor (lounge and auditorium) is cheaper than the street** (11.5–11.9 ms against 13.5 ms). The film adds about 0.6 ms p50 and one texture, with no extra draw calls.
3. **The penthouse arrival is cheap now because it is a graybox** (91 calls, 2.6k triangles). It will grow with #362's final kit, and it should be re-measured then.

## Decisions for Val

1. **Budgets and named devices.** This is one local profile. #368's budgets need named target devices and settings, such as a phone class and a laptop iGPU. Until then, these numbers are provisional evidence, not limits.
2. **IPIC exterior culling.** Extending the existing exterior culling to IPIC would remove most of the ground-floor cost when the frontage is out of view. First it needs the see-through between the escalator lanes closed (#364 recorded that defect), or culling would show a hole there. There are two options:
   - an engineering change, after that art fix;
   - accept the cost.

## Checks

| Command | Result |
| --- | --- |
| `node preview/e2e/office-ipic-perf.mjs`, runs 1–3 | All passed with no page errors. Run 3's receipt is committed. |
| `pnpm run verify` (core) | **Passed:** agent 109/109; preview 3192, plus 1 skip and 1 todo; server 572, plus 148 Redis skips (core runs without Redis); desktop 69/69. It ran before the comment-only wording fix to the runner, which is not part of core; `node --check` passes. |

## Not covered

- Phones, Safari, iOS, Windows and Linux GPUs, a 4K display, and DPR 2–3.
- Resident crowds beyond fixture staff, and final art or media (fixture film, graybox penthouse).
- Isolated GPU timer queries. The interval is main-thread rAF timing with vsync off.
- Production bundle sizes (the dev server serves unbundled modules).
- The runner is a standalone local profile and is not in hosted CI.

## Next action

Open the PR, land it with `pnpm run land <pr> --owner claude:river-oaks-1b`, then retire the worktree with `project:prune`. Post the profile to #368.
