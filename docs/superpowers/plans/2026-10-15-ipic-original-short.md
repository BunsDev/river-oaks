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

## Next

After the stack (#400–#407) lands, rerun the two-account journey on main with the short as the default.
