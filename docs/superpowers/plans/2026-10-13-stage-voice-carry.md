# A stage performer is heard across the plaza — 2026-10-13

**Objective (Val):** "please proceed with recommendations". One of them was
letting a performer on the plaza stage (#311) be heard across the plaza. It was
agreed earlier with river-oaks-f1, who owns shared voice and whose session has
since ended.

**Branch / worktree:** `feat/stage-voice-20261013` in
`../river-oaks-stage-voice-20261013`.

## Why this is client-side

- **Rooms:** shared voice puts every outdoor resident in one LiveKit room per
  world (`server/voice.js`, space `outdoor`).
- **Loudness:** each browser sets every voice's gain and subscription from
  confirmed town positions (`preview/src/voice-spatial.js`, "All of this is
  presentation").
- **So:** a performer carrying further is a presentation change. No new room
  or server change is needed. The snapshot already says who is `performing`.

## Change

- **`voice-spatial.js`:**
  - `STAGE_NEAR = 14`, `STAGE_FAR = 40`, `STAGE_RESUBSCRIBE = 36`. Most of the
    plaza lies within 14 m of the stage (median 13 m), and its farthest
    features are about 28 m out.
  - `voiceReach(player)` returns the stage reach for a performing player, and
    talking reach (`VOICE_NEAR`, 25 m, 22 m) otherwise.
  - `subscriptionDecision` takes the reach.
- **`voice-chat.js`:** `placePeers` uses each resident's reach for gain and
  subscription.
- **`docs/voice-livekit-setup.md`:** a live-acceptance step for the stage.

## Verification

- `node --test preview/tests/voice-spatial.test.js preview/tests/voice-chat.test.js`:
  24/24.
  - **Reach:** a performer has stage reach and everyone else talking reach. At
    28 m a performer is heard and a talker is not. Subscription uses the same
    hysteresis band, further out.
  - **Through the voice client:** a performer 30 m away is subscribed and
    heard while a talker at 30 m is not. Stepping down returns the performer
    to talking reach.
- `pnpm run verify`: `core: passed` (2942 of 2943 node tests, 1 skipped; 76 of 76
  Python).

## Gaps

- **`voice-shared` journey:** it can't run on this Mac today. It stops at "Unmute
  turns the microphone on" because the microphone stays `requesting`:
  - it fails the same way on unmodified `main` (`2429f4fd`);
  - a blank page in headless Chromium 156 with `--use-fake-device-for-media-stream`
    also never settles `getUserMedia`, with the audio service in or out of process.

  CI doesn't run `voice-shared`, so the voice-client unit test above is this
  change's browser-side evidence.
- **Live LiveKit audio:** still the separate live acceptance in
  `docs/voice-livekit-setup.md`.
