# IPIC short: a keyframe every second

- **Task:** `ipic-short-keyframes` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-short-keyframes-20261016` in `../river-oaks-short-keyframes`, from main
  `19d11250`.
- **Decision:** Val, 2026-10-16: "Re-encode and publish". The cut, captions, transcript and poster stay as
  approved on 2026-10-15 (#365); only the encoding changes.

## Why

The final #368 soak kept failing its rule that viewers stay within 500 ms after converging. On main
`ae541c70` it failed 2 of 3 runs once the 5-minute load was above about 40.
- **The traces** (scratch `diag-runner.mjs`): every spike was a viewer seek that froze the frame for 0.3–1.2 s.
- **The cause:** the published short had 16 keyframes in 52.6 s, up to 5.3 s apart in the WebM and about 6 s in
  the MP4. Those are the encoder defaults; `cut.mjs` set no interval. Each seek decoded up to about 130 frames of
  720p first.
- **Earlier attempts:** two player-side fixes were tried and parked (`2026-10-15-screening-seek-lead.md`).

## The A/B (scratch, unpublished)

The published WebM against a copy re-encoded with 1 s keyframes, interleaved, 2 × 11 cycles each, on main
`ae541c70`:

| | Spike cycles (≥ 500 ms) | Median worst | Max | Samples caught mid-seek |
| --- | --- | --- | --- | --- |
| Published (≤ 5.3 s) | 3 / 22 | 312 ms | 1035 ms | 15 |
| 1 s keyframes | 0 / 22 | 112 ms | 175 ms | 0 |

## Change

- **`scripts/ipic-short/cut.mjs`** sets a keyframe every 24 frames (`-g 24 -keyint_min 24`) for VP9 and H.264,
  with no scene-cut keyframes in H.264.
- **The same capture** (`raw.webm` and `shots.json` from the approved candidate, commit `7712634b`) was cut again
  from scratch copies:
  - the VTT is byte-identical;
  - durations are unchanged (WebM 52,563 ms, MP4 52,555 ms);
  - each format has 53 keyframes.
  The approved poster is kept.
- **`sources.json`** records the new bytes and SHA-256, plus an `encoding` note for the re-encode.
- **`scripts/media-keyframes.mjs`** is a pure-JS keyframe reader (MP4 `stss`, WebM block flags), so tests need no
  decoder.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/screening-media.test.js`, written first | The reader agrees with ffprobe on the fixture (6 and 3 keyframes). The new rule failed on the published WebM: `16 keyframes, widest gap 5334 ms`. Now 9/9 with the screening contract tests. |
| `node scripts/make-screening-fixture.mjs --check` | 7 files of 2 films match `sources.json` |
| `scripts/ipic-short/decode-check.mjs` (Metal Chromium over HTTP) | Hashes match; both formats decode to the manifest durations; 4 seeks at 1280×720; the 8 cues equal the transcript; the poster decodes |
| `node preview/e2e/ipic-screening-runner.mjs` | Passed |
| `node preview/e2e/ipic-screening-soak-runner.mjs 10` | Passed at load 18–31. All 11 late joins converged in 2–4 ms; worst spread after converging 108 ms (6–108 per cycle). |
| `pnpm run verify` | The first run failed one test, #447's `connection-rotation` timing flake (3/3 alone; this branch changes nothing in `server/` or `preview/src/`). The rerun passed: agent 112, preview 3346, server 753 with Redis skips, 76/76. |

## Notes

- The approved WebM and MP4 are republished with new bytes, under the same id and duration; the server's
  allowlist is unchanged.
- **Rollback:** use a build that has these files. The id is the same, so an older build plays its own copy.
- The 30 s fixture keeps its own keyframes and was not regenerated (goal rule).
