# IPIC screening: a second approved short with dialogue and music (#501)

- **Issue:** #501 (S4 under tracker #497). Media owner role. Val holds creative, rights and likeness approval.
- **Tasks:** `ipic-screening-second-short-501` (the tooling, #516) and `ipic-screening-second-short-register-501` (the
  film, #547), both retired 2026-10-19 by `claude:river-oaks-4b (6191db50)`.
- **Branches:** `docs/screening-second-short-501-20261018` (#516, from main `153471bc`) and
  `feat/screening-second-short-register-501-20261019` (#547). Both are retired; the bundles are under
  `~/worktree-backups/river-oaks/retirement-qqXknR` and `retirement-LE7YKC`.
- **State: approved, registered and in production (2026-10-19).**
  - **Source and approval.** Val chose the source on 2026-10-18 (about 14:30Z): "New in-game scene", with local Kokoro
    voices and an original music bed. Val approved candidate B's exact bytes on 2026-10-19 (about 04:10Z).
  - **Landing.** #516 merged as `b76ab77c` (deployed 05:03:12Z). #547 merged as `a4b889e3` (deployed 05:43:17Z).
  - **Still open:** Val's listening on headphones and a device speaker, and #500's voice-chat balance.
  - **Unchanged:** `ipic-original-v1` (silent) and `ipic-fixture-v1` (synthetic).

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
| Retake, 18:51–18:54Z, source `847aa444`, Metal, load ≤ 59 | **Healthy:** 0 page errors; every shot online with both seated; the longest frame gap 33–83 ms per shot, 183 ms once in `faces`. Cut, intake (`engineering-candidate`, no problems: 62 s, 1280 × 720, 24 fps, −18 LUFS, −1.4/−1.5 dBTP, 1 s keyframes, 8 speaker and 3 sound cues) and decode (Chromium: both encodes decode, 4 seeks, 11 cues equal the transcript) all passed. **Not sent for review:** the contact sheet showed (1) Maya and Theo identical, because both fixture accounts wear the default guest look (Sable), so Theo's male voice came from a woman's figure, and (2) the back wall's lettering in the `faces` shot, against the script's "no signage" rule |
| Framing probe (scratch, stills only), 19:12Z and 19:33Z | Theo wears Rowan, chosen in the in-game character picker (any player can; account, name and seat unchanged). Six `faces` framings: four still showed the lettering. One moved the eye 0.5 m west and kept it out, at 40° and 38°; at 40° the camera page's own player showed at the edge. Chosen: eye [−2.1, 7.35, 33.25], target [−1.6, 6.9, 31.0], 38°, with the camera page's player moved up the west aisle (d 28.2) after the friends sit. No other shot shows that player |
| Recast take 1, 19:36–19:47Z, `d4ce2929` | **Refused by the health check:** `faces` paused 533 ms between frames (load 54; Val's Dia tab was rendering the game) |
| Recast take 2, 19:55–19:58Z, `d4ce2929` | **Healthy:** 0 page errors, online and seated throughout; longest frame gaps 50–67 ms, 150 ms in `dim` at the film's start. Cut, intake (`engineering-candidate`, no problems), decode (Chromium, both encodes, 4 seeks, 11 cues) passed. Contact sheet: Maya (Sable) and Theo (Rowan) distinct; no lettering or street in any shot; the camera page's player out of shot. **The review candidate:** WebM `dae76acd…` (12,943,978 B), MP4 `9e767fd8…` (16,901,709 B), VTT `2a6b54e0…`, poster `2e53991c…`; private copy in `~/Documents/river-oaks-drafts/ipic-two-seats-v1-20261018/` with `REVIEW.md` |
| Speech over music, candidate A (music bed 0.45) | Measured per line by rebuilding the cut's voice bus and ducked music bus: two lines under the cut's own 10 dB target (8.9 and 9.7 dB) |
| Candidate B, 2026-10-19 03:3xZ: the same take, voices, score, edit and captions, music bed 0.38 (`MUSIC_WEIGHT=0.38`) | Speech over music 10.4–19.5 dB (median 16.9). Intake `engineering-candidate`, no problems: WebM VP9 Profile 0/Opus 62.008 s, −17.9 LUFS, −1.6 dBTP; MP4 H.264 Main/AAC-LC 62.000 s, fast start, −18.0 LUFS, −1.5 dBTP; 1280 × 720, 24 fps, 1 s keyframes, stereo 48 kHz. Decode (Chromium 156, Metal): both encodes full length with audio, 4 seeks, 11 cues equal the transcript, poster decodes. In-world (local, unpushed registration on `eb8553ae`): both rows played it with audio and the panel's speaker lines |
| **Val's approval, 2026-10-19 about 04:10Z** | Candidate B as cut: WebM `24f08a74…` (12,940,976 B), MP4 `85b1079e…` (16,902,639 B), captions `2a6b54e0…` (745 B), poster `2e53991c…` (106,530 B), with the script, voices, music, likenesses and setting (`approvedItems` in `sources.json`). Candidate A is superseded and not approved |
| #547 registration | `sources.json` and `SCREENING_MEDIA` entries, the catalog tests and `docs/screenings.md`. Hosted CI: all 17 checks green at `c540b37b`, including `preview`. Merged `a4b889e3` with `pnpm run land 547` |
| On main `a4b889e3`, 2026-10-19 | `node --test preview/tests/screening-media.test.js preview/tests/screening-contract.test.js preview/tests/ipic-screening*.test.js server/tests/screenings.test.js`: 79/79. `node scripts/make-screening-fixture.mjs --check`: 11 files of 3 films match `sources.json` |
| Production, read-only, 2026-10-19 about 05:45Z | typesafe.place serves all four files: 206 with byte ranges and the right types, and the same sizes and SHA-256 as approved. Films and captions are `private, no-store`, and the poster `public, max-age=3600` |
| Take health (`shot-health.mjs`), new | The capture samples each shot in the camera page (longest gap between animation frames; every 200 ms, offline and fewer than two seated) and refuses a take that dropped, lost a seated friend or stalled more than 250 ms; `second-cut.mjs` refuses one without healthy samples. On `cecb90dd` the cut accepted any take. Regression: 6/6 intake tests. The cut refuses the 17:00Z take |

## The film: "Two Seats, One Screen" (`ipic-two-seats-v1`, approved 2026-10-19)

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

## Delivered, 2026-10-19

- **The approved package:** `preview/public/assets/ipic/screening/ipic-two-seats-v1.{webm,mp4,en.vtt}` and
  `ipic-two-seats-v1-poster.jpg` on main since `a4b889e3` (#547), served by production since 05:43:17Z.
  - Approval, provenance, licence, components, credits and transcript are in `sources.json`.
  - The catalog entry is `SCREENING_MEDIA['ipic-two-seats-v1']`: 62,000 ms, "dialogue and music", English captions,
    and the poster.
  - The delivery receipt is #501's comment of 2026-10-19.
- **Private source (not in the repository):** `~/Documents/river-oaks-drafts/ipic-two-seats-v1-20261018/`.
  - `REVIEW.md` is marked approved.
  - `source/` holds the capture, voices, score, mix masters, the speech-over-music script and
    `SOURCE-MANIFEST.sha256`.
  - Candidate A is under `superseded/`.
  - Reproduce the cut with `MUSIC_WEIGHT=0.38 node scripts/ipic-short/second-cut.mjs <capture> <voices> <score.wav> <out>`.

## Still open, with owners

1. **Listening on named devices (Val).** Headphones and a device speaker: is the dialogue clear over the music, and is
   there no clipping? The measured ratios are not a listening test. #501 stays open for this.
2. **The film against live voice chat (#500; Val or two people in a screening).**
3. **Done, 2026-10-19 06:18Z: the two-film journey on main `a4b889e3`.** It passed 18 checks locally (SwiftShader,
   load 9–18) with `ipic-two-seats-v1` as the second film: chooser, Start film, its own 1280 × 720 texture, captions,
   transcript, decoded audio, background-and-back (254 ms) and host loss. Three earlier runs on the candidate, at load
   20–53, failed load-bound steps.

A defect found by listening means a recut with a new id (`ipic-two-seats-v2`) and its own approval.
`ipic-two-seats-v1` keeps its id and duration, so saved timelines that name it still restore.

## Listening packet for Val (2026-10-28)

The one decision left on #501 is a human listening record. Everything else is on main and in production (`v0.2.2`).
Machine evidence so far: −17.9/−18.0 LUFS, −1.6/−1.5 dBTP, speech 10.4–19.5 dB over the music per line, and
whisper.cpp heard 44 of 45 words, missing only "Westheimer" (the same with the music removed, so it is the synthetic
voice, not the mix). None of that is a listening test.

**Production files (the approved bytes, served with 206 ranges and a one-hour public cache):**

- `https://typesafe.place/assets/ipic/screening/ipic-two-seats-v1.webm` (VP9/Opus, 12,940,976 bytes, SHA-256 `24f08a74…`)
- `https://typesafe.place/assets/ipic/screening/ipic-two-seats-v1.mp4` (H.264/AAC, 16,902,639 bytes, SHA-256 `85b1079e…`)
- `https://typesafe.place/assets/ipic/screening/ipic-two-seats-v1.en.vtt` (captions, `2a6b54e0…`)

Listen to the MP4 at least once: it is what Safari gets if the WebKit option lands, and what every engine falls back
to. In the game, Safari currently plays the WebM; Chromium plays the WebM.

**Where the lines are** (from the captions; music under everything from 0.6 s):

| Cue | Time | Speaker | Line |
| --- | --- | --- | --- |
| 1 | 0:00.6 | — | [Soft piano music] |
| 2 | 0:09.0 | Maya | Two seats, front row. Told you we'd make it. |
| 3 | **0:13.4** | **Theo** | **Barely. Westheimer was all brake lights.** (the one word the recogniser misheard) |
| 4 | 0:21.8 | Maya | So what's on tonight? |
| 5 | 0:24.6 | Theo | Whatever the host picks. That's half the fun. |
| 6 | 0:34.8 | Maya | No spoilers, then. |
| 7 | 0:37.4 | Theo | None. Just a good seat and good company. |
| 8 | 0:46.4 | — | [The house lights dim] |
| 9 | 0:49.0 | Maya | Here it comes. |
| 10 | 0:51.4 | Theo | Phones down. Sound on. |
| 11 | 0:56.5 | — | [The piano swells, then fades] |

**The form** (answer once per listening device; two devices are enough):

1. **Device:** headphones (model) or speaker (device model and OS); which file (WebM or MP4); volume setting.
2. **Clarity over music:** is every line intelligible at a comfortable volume without captions? Name any line that is not.
3. **Balance:** is the music under the dialogue at the right level, and is the swell at 0:56 pleasant rather than loud?
4. **Clipping or artefacts:** any crackle, distortion, pumping (the ducking) or hard edits?
5. **"Westheimer" at 0:13.4:** does Theo say it the way a Houstonian would ("WEST-hy-mer")? Yes, no, or close enough.
6. **Speaker vs headphones:** anything audible on one and not the other (the low bass under the piano, the room)?

Also, in the game (#500's rows): Sound on inside the auditorium, then **Stand up** and **Step outside**: the film is
silent in the lounge; and with a second person on voice chat, whether the film and the voice balance (record the
film's volume slider position, or the device volume on iPhone, and whether the ±8 % rate correction is ever audible).

**Outcome:** a pass closes #501. Any "no" on 2, 4 or 5 means a recut, below.

## v2 recut: dry run (prepared, not run; nothing here is registered)

Only if listening fails. `ipic-two-seats-v1` keeps its id, duration and files, so saved timelines and receipts still
restore; v2 is a new catalog entry that needs its own approval of the exact bytes.

1. **Pronunciation of "Westheimer" (the only known miss).** `scripts/ipic-short/second-voices.py` renders each cue's
   `line` through `LocalVoice` (`src/river_oaks/voice.py`, Kokoro-82M, text in, 24 kHz mono out; it takes text, not
   phonemes). The fix is a spelling the voice reads right, in the private source copy only:
   - copy `scripts/ipic-short/second-short.json` to `~/Documents/river-oaks-drafts/ipic-two-seats-v2-<date>/second-short.json`
     and change cue 3's `line` to a phonetic spelling for rendering (candidates: `West-heimer`, `Westhimer`, `West hymer`),
     while the caption text stays "Westheimer" (the cut script writes captions from the script's `line`, so add a
     `caption` override there or patch the VTT after the cut: whichever is smaller, with its test);
   - render only that line (`python3 scripts/ipic-short/second-voices.py <script> <model-dir> <voices-dir>` renders all
     eight; it is deterministic, so the other seven lines' hashes must equal v1's `voices.json`);
   - check with the recogniser that produced the 44/45 (whisper.cpp `ggml-base.en`, already on this machine; the probe
     script is `checks/asr-probe.json`'s neighbour in the private folder) that "Westheimer" is now heard; no download
     and no paid service.
2. **Cut:** `MUSIC_WEIGHT=0.38 node scripts/ipic-short/second-cut.mjs <capture> <voices-v2> <score.wav> <out>` with
   the same 2026-10-18 19:55Z capture and the same score (both in the private `source/`); only the voices directory
   changes. Expect the same 62.000 s MP4 and 62.008 s WebM, −18 LUFS, −1.5 dBTP, and the same eleven captions.
3. **Intake:** `node scripts/ipic-short/intake-check.mjs <out>/sources.candidate.json` → `engineering-candidate`,
   no problems; `node scripts/ipic-short/decode-check.mjs` in Chromium; speech-over-music per line ≥ 10 dB
   (`source/speech-over-music.mjs`); the ASR probe again.
4. **Approval:** Val listens to v2 (the form above) and approves the exact bytes (four SHA-256s) as on 2026-10-19.
5. **Register, as #547 did, with a new id:** files `preview/public/assets/ipic/screening/ipic-two-seats-v2.*`; a new
   `sources.json` entry with `approval`, `approvedItems`, provenance and the transcript; a new `SCREENING_MEDIA`
   entry `ipic-two-seats-v2` (62,000 ms, `dialogue and music`, the poster); `preview/tests/screening-contract.test.js`
   catalog list; `docs/screenings.md`. **v1 stays in `SCREENING_MEDIA`** so checkpoints and receipts naming it restore;
   to retire it from the chooser later, drop it from `screeningChoices` (a `retired: true` flag the chooser filters),
   never delete the entry. `node scripts/make-screening-fixture.mjs --check` must report 15 files of 4 films.
6. **Verify and land:** media and contract suites, `pnpm run test:screening` (the committed journey still names v1; a
   follow-up switches it to v2 once v2 is the chooser's second film), core verify, `pnpm run land` with Val's go.
