# #365: the approved original short

- **Task:** `ipic-original-short-365` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-original-short-20261015` in `../river-oaks-ipic-short-365`, from main
  `cd99570a`.
- **Decision:** Val, 2026-10-15, asked directly in session river-oaks-39: "Approve as is". That covers
  candidate 1 as cut, including Jevica's in-game appearance, the IPIC lounge's floral wall (cut from venue
  photo `IMG_9761.jpg`) and its lettering, and the visible signage. Committing it here publishes it.

## What lands

| File | What |
| --- | --- |
| `preview/public/assets/ipic/screening/ipic-original-v1.webm` | VP9 + Opus, 1280×720 at 24 fps, 1.41 Mbps, 9.3 MB, 52,563 ms |
| `…/ipic-original-v1.mp4` | H.264 Main 3.1 + AAC-LC, `+faststart`, 2.04 Mbps, 13.4 MB, 52,555 ms |
| `…/ipic-original-v1.en.vtt` | 8 cues, timed to the cut |
| `…/ipic-original-v1-poster.jpg` | 1280×720, from the office shot (the player does not show a poster yet) |
| `…/sources.json` | Now `{ media: [...] }`. Each film's entry records provenance, license, approval, transcript, and per-file bytes, SHA-256 and `durationMs`. |
| `preview/src/screening-contract.js` | `ipic-original-v1` first, so host Start plays it (52,555 ms). The fixture stays allowlisted. |
| `scripts/make-screening-fixture.mjs` | Rewrites only the fixture's entry; `--check` covers every film |
| `scripts/ipic-short/` | The capture, cut and decode-check scripts that made the film |
| `preview/tests/screening-media.test.js` | Each allowlisted film against `sources.json`: types, bytes, SHA-256, duration within 60 ms, captions equal to the transcript, approval recorded |
| `preview/e2e/ipic-screening.js` | The transcript check follows the playing film; Start must play the short |

The film is 52.6 s, silent and captioned, captured from the game itself at `7712634b` with Metal ANGLE on an
Apple M3 Max. It uses the default office layout, synthetic fixture identities and an idle IPIC screen. Every
edge has a black border of at least 4 px. The OpenStreetMap (ODbL) credit stays in frame in the street shots.

## Checks

| Check | Result |
| --- | --- |
| Red first: contract, UI and media tests before the change | 4 failed: no short, Start played the fixture, no manifest entries |
| The same after the change | 10/10 |
| `node scripts/make-screening-fixture.mjs --check` | 7 files of 2 films match `sources.json` |
| Decode check (`scripts/ipic-short/decode-check.mjs`, Metal Chromium over HTTP, on the candidate files) | Hashes match. WebM 52,563 ms and MP4 52,555 ms, each equal to its manifest entry; 0 dropped frames; 4 seeks at 1280×720; cues equal the transcript; the poster decodes. |
| `node preview/e2e/ipic-screening-runner.mjs` run 1 | Failed at "transcript readable": it expected the fixture's "test pattern". Fixed to follow the playing film. |
| Run 2 | Passed: two browsers, Start, late join within 500 ms after 5 ms, pause, replay and stale commands, transcript, cleanup |
| #406's two-account journey with the candidate allowlisted locally (before this branch) | 31 checks, both viewers on `ipic-original-v1` |

## Independent review (794e4644)

| Finding | Disposition |
| --- | --- |
| Bug: the caption track and transcript were built once from the venue's first film, so another allowlisted film (a restored fixture, or one started by command) played under the short's captions | Fixed. `filmText()` in `ipic-screening-ui.js` swaps the track and transcript when the playing film changes. New journey step: the host starts the fixture by command, and the viewer's single track and transcript must be the fixture's. It failed first (`{"tracks":["…ipic-original-v1.en.vtt"],"transcript":false,"stale":true}`). |
| Risk: a server build before #429 refuses a checkpoint naming `ipic-original-v1` | Documented in `docs/screenings.md` under "Rolling back": roll back by configuration on a build that has the entry; never redeploy an older one (as with #400's v11). Fail-closed restore is kept. |
| `ipic-photo-views.mjs` recorded "fixture film" | It now records the playing film's `mediaId` per capture. `office-ipic-perf.mjs` reached main after this branch was cut; it is fixed when main is merged here before landing. |
| The generator swallowed manifest read errors | Only a missing file counts as a first run. The pre-#365 single-entry shape is still accepted. |
| `approvedItems` read as open questions | Reworded as what Val approved |
| The test's VTT parser was loose | It reads cue text after the timing line and skips NOTE/STYLE/REGION blocks, with its own test |

A screening run during the review failed once in the replay step: spreads of 1581–1948 ms, then a steady 657 ms, at load average 16. Checked by measurement:
- the short's seeks take a median of 45 ms in headless Chromium (the fixture's 15 ms), so slow seeks don't explain it;
- the next run, at load average 9–21, passed that step.

It was a load transient, recorded here rather than retried away.

## Next

After the stack (#400–#407) lands, rerun the two-account journey on main with the short as the default.
