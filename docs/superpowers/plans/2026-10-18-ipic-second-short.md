# IPIC screening: a second approved short with dialogue and music (#501)

- **Issue:** #501 (S4 under tracker #497). Media owner role. Val holds creative, rights and likeness approval.
- **Task:** `ipic-screening-second-short-501` (live register), owner `claude:river-oaks-4b (6191db50)`.
- **Branch / worktree:** `docs/screening-second-short-501-20261018` in `../river-oaks-screening-501`, from main `153471bc`.
- **State: in production; approval pending.** Val chose the source on 2026-10-18 (about 14:30Z): "New in-game scene",
  with local Kokoro voices and an original music bed. Val approves the script, voices, likenesses and the final bytes
  before anything is committed or registered. `ipic-original-v1` (silent) and `ipic-fixture-v1` (synthetic) are
  unchanged and are not candidates.

## Inventory, 2026-10-18

| Part | What exists | Usable for #501? |
| --- | --- | --- |
| Footage | `scripts/ipic-short/capture.mjs` and `cut.mjs`: the game's own runtime capture, as for #365 | Yes, as the project's own capture. Marks and likenesses shown need Val's approval, as #365's did |
| Characters | Committed CC0 avatars, and Jevica's committed appearance (approved for public media on 2026-10-15, #365) | A new film needs Val's approval of each likeness shown in it |
| Dialogue | Local Kokoro-82M voices (Apache-2.0 weights, ignored `data/models/kokoro/`, no service or key). `output/jev-elevenlabs.mp3` came from a paid provider | Kokoro: technically yes, if Val accepts synthetic voices. ElevenLabs: no, without Val's decision on its terms |
| Music | Nothing in the repository | Needs a source: Val-supplied, licensed, or original |
| An existing short | None found in the repository or the #359 thread | Val may supply one |

## Prepared (engineering, no media)

- **`scripts/ipic-short/intake-check.mjs`:** checks a candidate directory statically. It covers hashes, both encodes
  (H.264/AAC MP4 with fast start, VP9/Opus WebM), matching size, frame rate and duration, a keyframe every second,
  and stereo 48 kHz sound that is not silent with a true peak at or below -1 dBTP. It also checks the caption rules
  (plain `Name:` speaker labels, bracketed sounds, no markup, transcript equal to the cues), the provenance record for
  each part, and Val's approval of the exact SHA-256s. It decides draft, engineering candidate or approved, and never
  published.
- **`scripts/ipic-short/decode-check.mjs`:** works for a candidate of any size. Seek points are fractions of the film,
  and it records decoded audio bytes.
- **`docs/screening-media-intake.md`:** the states, deliverables, caption rules, checks, registration steps and
  rollback.
- **`scripts/tests/ipic-short-intake.test.js`:** caption, loudness and record rules; the silent short and the fixture
  both fail as a second film; a synthetic temporary candidate passes as an engineering candidate, and as approved only
  with matching hashes.

## Checks

| Check | Result |
| --- | --- |
| `node --test scripts/tests/ipic-short-intake.test.js` | 6/6 (ffmpeg 9.0.1 locally; the two ffmpeg cases skip with a reason where it is missing) |
| `pnpm run verify` (core, at nice 19) | Agent 126/126 (the 5 intake tests included). Preview 3,523/3,524, with one existing skip. Then server 668 + 204 Redis skips, desktop 76/76, build, python (ruff) and security: all passed |
| Dry run of `second-cut.mjs` on stand-in footage, then `intake-check.mjs` | `engineering-candidate`, no problems. Awaiting Val's approval of the exact bytes |
| Real capture, 16:43–17:00Z, Metal (M3 Max), Chromium 156.0.8078.4, source `cecb90dd` plus the uncommitted seating fix | **Unusable.** Load rose from 57 to 212 during it. All three pages logged 1,163 page errors (`Cannot read properties of null (reading 'players')`, about 388 each): the fixture's sockets dropped, and `shared-seating-ui.js:51` reads `town.snapshot.players` unguarded beside the recliners, so each disconnected frame threw before its draw. `freezedetect` found the screen shot unchanged for 15 s. Frame timestamps stayed at a steady 25 fps (the recorder's own clock), so they could not show it. The seating guard is already in open PR #489 (`cafe-publication-pilot-420`); not duplicated here |
| Take health (`shot-health.mjs`), new | The capture samples each shot in the camera page (longest gap between animation frames; every 200 ms, offline and fewer than two seated) and refuses a take that dropped, lost a seated friend or stalled more than 250 ms; `second-cut.mjs` refuses one without healthy samples. On `cecb90dd` the cut accepted any take. Regression: 6/6 intake tests. The cut refuses the 17:00Z take |

## The film: "Two Seats, One Screen" (`ipic-two-seats-v1`, a draft id)

- **Script.** `scripts/ipic-short/second-short.json`: 62 s, six shots, eight lines and three sound cues. Two fictional
  friends, Maya and Theo, settle into IPIC's front row just before the house lights go down. Auditorium only: no
  lounge floral wall, no street frontage or signage, no brands, no OpenCoven marks, no implied IPIC partnership.
- **Voices.** `scripts/ipic-short/second-voices.py` renders the lines with the project's `LocalVoice` (Kokoro-82M v1.0
  int8, Apache-2.0 weights, pinned hashes, local inference only). Maya is `af_heart` and Theo `am_liam`, generic presets
  not tied to any persona. Lines run 1.1–2.5 s.
- **Music.** `scripts/ipic-short/second-score.mjs` synthesises original solo piano and soft bass (F major, 84 bpm, 22
  bars, a seeded touch of timing, a small Schroeder room). Deterministic: two runs give identical bytes. No samples or
  recordings. It swells only after the last line (from 53 s), then fades.
- **Footage.** `scripts/ipic-short/second-capture.mjs` records a third page (the owner fixture, out of shot at the back)
  on Metal while alice (Maya) and bob (Theo) sit side by side in front-row recliners 1-1 and 1-0, seated one after the other from the spot between the rows (the first try at 1-2 could not be reached: the gaps in the front row are narrower than a body). Six render-audit camera shots; alice starts the
  default film for the house-lights shot. Load-gated (below 40), so the footage does not stutter.
- **Cut and mix.** `scripts/ipic-short/second-cut.mjs`:
  - dialogue at its cue times, and the score ducked under it (sidechain, ratio 6);
  - two-pass loudness to −18 LUFS integrated with a true peak at or below −1.5 dBTP;
  - captions with plain speaker labels and bracketed sounds;
  - two-pass VP9/Opus and H.264/AAC encodes with a keyframe every second, a poster, and `sources.candidate.json` with a
    record for each part.
- **Measured on the dry run** (stand-in footage, the same audio): −18.0 LUFS, −1.5 dBTP, LRA 4.8. With the final duck, speech
  stays 12.7–23.7 dB clear of the music during every line. The intake check returns `engineering-candidate` with no
  problems. **No one has listened to it yet:** listening is Val's, on headphones and a device speaker.

## Blocker and owner

Val chose option 1 (a new in-game scene). Still open: Val's review and approval of the exact candidate bytes, the
script, the two synthetic voices, the likenesses shown (the fixture accounts' committed avatars) and the music. Until
then #499, #500 and #502 stay fixture-ready, and the two-film rows in #502's matrix remain blocked.

## Next step

1. Take the capture again, load-gated, with the health samples: a take that drops or stalls fails with `retake:`.
2. `second-cut.mjs`, then `intake-check.mjs` and `decode-check.mjs` on the candidate.
3. Copy the candidate to a private review folder outside the repository and ask Val to review and approve the exact
   bytes.
4. On approval: register it in #499's branch (`sources.json`, `SCREENING_MEDIA`), and run the two-film checks in #502.
