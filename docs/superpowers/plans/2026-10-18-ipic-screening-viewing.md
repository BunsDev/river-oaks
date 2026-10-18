# IPIC screening: screen-focused viewing, Join screening and truthful sound (#500)

- **Issue:** #500 (S3 under tracker #497). UX engineer role. Design, human accessibility and audio review are still
  owed.
- **Task:** `ipic-screening-viewing-500` (live register), owner `claude:river-oaks-4b (6191db50)`.
- **Branch / worktree:** `feat/screening-viewing-500-20261018` in `../river-oaks-screening-500`, stacked on #499
  (`5e02df80`, then #498's `45a9f401` merged).
- **Scope kept:** seat and position authority, the player, house lights and the panel. No second decoder, no
  replicated camera, no forced fullscreen or orientation, no microphone, and no new audio context.

## Decisions

- **Focus looks from the screen's centre line, at the viewer's row depth, not from the seated eye.** Measured with
  `framingFov`: at a 16:10 viewport, showing the whole 16:9 film from the front row's seated eye needs 103° vertical
  (99° from its east end), and from the back row 57°. From the centre line at the row's depth it fits within 80° for
  both rows. That point is inside the auditorium (at least 2.5 m from the screen), at the film's centre height,
  above seated heads. The avatar and seat never move. The journey proves nothing is in front of the film there.
- **Fit range 30–80°.** A narrow portrait phone cannot see the whole film within 80° from either row. `focus.fits`
  is then false and the framing stays centred. Whether to show a hint is a design question for review.
- **Exits:** Look around, a drag on the world, an arrow key, standing, leaving, disconnecting or a rebuild. The game
  has no pointer lock, so none needs reacquiring.
- **Stop watching** leaves a small panel with **Join screening**, and no decoder. Join opens a fresh player on the
  room's current timeline and sends nothing.
- **Volume:** detected by setting the element's volume and reading it back. Where that does not stick (iOS Safari),
  the slider is not offered, and the panel says to use the device's volume buttons.
- **Sound:** a browser refusal with sound on reads "Sound is on, but this browser needs a tap first: press Play
  film".

## Files

- `preview/src/ipic-screening-view.js` (new): the framing geometry and the easing.
- `preview/src/ipic-screening-ui.js`: the focus control and `applyCamera`, Join screening, volume support and the
  refused-sound text.
- `preview/src/main.js` (two lines): `getSeat`, `input` and `reducedMotion` for the screening, and
  `ipicScreening.applyCamera(camera)` after the walking camera and before a render-audit override.
- `preview/src/ipic-interior.js` and `preview/src/store-interiors.js`: the screen's frame (centre, right, up,
  size) on the published screen entry.
- `preview/e2e/ipic-visit.js` and `ipic-runner.mjs` (`IPIC_REDUCED_MOTION=1`): focus, look around, keys, drag,
  Stop/Join, and focus at 390 px, then Stand up.

## Checks

| Check | Result |
| --- | --- |
| New UI and view regressions on #499's head `5e02df80` | Failed: no focus control, no view module, no volume rule or refused-sound text |
| Same, on the branch | Screening unit tests 47/47 (view 3/3, UI 13) |
| `node preview/e2e/ipic-runner.mjs` (both motion settings) | Pending (browser lock) |
| `pnpm run verify` | Pending |

## Gaps and owners

- **Listening review:** real dialogue and music through the authored stereo mix, voice-chat balance, and how
  audible the ±8 % rate correction is. Blocked on #501's film. Reviewer: Val.
- **Physical devices:** whether volume is honoured, whether gesture unlock works and touch on iPhone Safari and
  macOS Safari. #502's device rows (Val).
- **Human review:** screen-reader labels and focus order (VoiceOver), and whether the focused framing is
  comfortable. Val.

## Next step

Run the visit journey with both motion settings and `pnpm run verify`, then commit, PR and hand off to #502.
