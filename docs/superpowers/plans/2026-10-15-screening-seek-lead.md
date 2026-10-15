# Screening player: seek freezes under heavy load (parked)

- **Task:** `screening-seek-lead` (live register), **queued**, with no owner.
- **Branch:** `fix/screening-seek-lead-20261015` on origin, at `d80b8005` (signed). It was not merged.
- **Found by:** the final #368 soak on main `2d7a1ef3`. It failed the rule that viewers stay within 500 ms after
  converging (595 ms, load 27–31).

## Diagnosis

A scratch copy of the soak recorded both pages on every sample: currentTime, readyState, dropped frames, drift,
rate, main-thread lag and evaluate round trip.

- **The page wasn't stalling.** Lag stayed at or under 19 ms.
- **Every spike was the viewer seeking.** `readyState` fell to 1 and `currentTime` froze for 0.3–1.2 s while the
  host's film kept running.
- **Then the seek repeated.** It landed behind by its own duration, past `SCREENING_SYNC.seekMs` (400 ms), so
  `tick()` seeked again.
- **Why seeks were slow and corrections rare.** The short has 2 s keyframes, and under load software rendering
  ticks only every 0.3–1 s.
- **The fixture is different.** It seeks fast, which is why its soak had passed.

## What was tried (test-first, both on the branch)

1. **v1 (`15359015`):** never re-seek while `element.seeking` (3 s timeout), and lead each seek by the recent seek
   time, adopting a slower seek at once.
2. **v2 (`d80b8005`):** the same guard, with the lead set to the fastest of the last three seeks.

## Interleaved A/B against main (same base `ec036956`, 11 cycles per run)

| Run | Load | Spike cycles (≥500 ms) | Median worst | Max | Viewer ahead at worst |
| --- | --- | --- | --- | --- | --- |
| main, 2 runs | 41–122 | 8 / 22 | 246 ms | 3434 ms | 0 |
| v1, 2 runs | 41–122 | 3 / 22 | 337 ms | 1344 ms | 5 |
| main, 2 runs | 24–47 | 0 / 22 | 256 ms | 432 ms | 0 |
| v2, 1 run | 24–35 | 1 / 11 | 283 ms | 504 ms | 0 |

- **The bar, stated before the results:** fewer spike cycles, a median worst no higher than main's, and no extra
  missed convergences.
- **Neither version met it.** v1 overshot when load eased. v2 showed no gain at moderate load, where main already
  had no spikes.
- **The decision.** Val's rule was to land only if the A/B helps, so neither landed. The official soak then passed
  on main `883ed56c` at load 18–33.
- **Traces and runners:** `~/worktree-backups/river-oaks/screening-seek-lead-evidence-20261015/`.

## Exit condition

Resume this task when a real device or Safari shows seek freezes in playback, then rerun the A/B on that device
class.
