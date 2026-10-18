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
  size, and the back row's distance) on the published screen entry; `preview/src/ipic-plan.js`: `IPIC_RECLINER_ROWS`.
- `preview/e2e/ipic-visit.js` and `ipic-runner.mjs` (`IPIC_REDUCED_MOTION=1`): focus, look around, keys, drag,
  Stop/Join, and focus at 390 px, then Stand up.

## Checks

| Check | Result |
| --- | --- |
| New UI and view regressions on #499's head `5e02df80` | Failed: no focus control, no view module, no volume rule or refused-sound text |
| Same, on the branch | Screening unit tests 47/47 (view 3/3, UI 13) |
| Hosted CI at `b9d78b86` | All 10 checks green, including the visit journey on Mesa |
| GPU visit (`IPIC_GPU=1`, Metal ANGLE, M3 Max, Chromium 156.0.8078.4, 1280 × 800), reduced motion, `b9d78b86`, 16:31Z | Passed, 11 checks: focus framed the film at 73.4°; Stop/Join; Stand up at 1280 and 390 px |
| Same, normal motion, 16:31Z | **Failed** at the journey's first check ("Step outside is offered in reception"): the first-visit store intro (6 s; `body.store-introducing` hides the walking console) was up. Journey timing, not product; fixed in the journey |
| In-world focus inspection (scratch runner, Metal, 1440 × 900, two accounts), `b9d78b86`, 16:34Z | Both rows framed the whole film within 80° (front 73.4° from 2.79 m, back 39.5° from 5.79 m); raycasts at the centre and four inset corners met the screen; seats unchanged. **But the captures show the screening panel over the bottom quarter of the focused film** |
| Band regression (`ipic-screening-view.test.js`) on `b9d78b86` | Failed: the front row's film reached NDC y −0.865, below the panel's edge at −0.28 |
| Same, with the band framing | Passes: front row steps back to 3.49 m at 80° (92.7° at its own row), back row 53.6° at its own row; film centre shifted up 0.36 |
| Hosted CI at `0adfc53e` | All 10 checks green, including the visit journey's new check that the film is above the panel |
| GPU visit, normal motion, `0adfc53e`, 17:33Z (Metal, 1280 × 800) | **Passed, 11 checks** (the intro fix let the reception check through): focus framed the whole film above the panel at 80° from 3.75 m (row 2.79 m) |
| GPU visit, reduced motion, `0adfc53e`, 18:30Z | **Passed, 11 checks:** the same framing, immediate |
| In-world focus inspection, `0adfc53e`, 18:39Z (Metal, 1440 × 900, alice front 1-1, bob back 0-1) | Both fit: front 80° from 3.49 m (stepped back from 2.79 m), back 53.6° at its own 5.79 m; the film's lowest corner at NDC −0.255, above the panel's top at −0.306; all five raycasts on the screen; seats unchanged. Captures: the whole film with black mattes above the panel in both rows. Design note: in the back-row view, alice's nameplate floats over the film |
| Lens shift through the pipeline (review) | The projection's off-centre term is set after `updateProjectionMatrix` each frame, with its inverse. Culling and raycasts use the matrices; GTAO copies `projectionMatrix` and its inverse on every render and never reads `fov`; bloom is screen-space. The next `updateProjectionMatrix` (focus ending) clears it |
| `pnpm run verify` | Queued (chain14, after #501's retake) |

## Gaps and owners

- **Listening review:** real dialogue and music through the authored stereo mix, voice-chat balance, and how
  audible the ±8 % rate correction is. Blocked on #501's film. Reviewer: Val.
- **Physical devices:** whether volume is honoured, whether gesture unlock works and touch on iPhone Safari and
  macOS Safari. #502's device rows (Val).
- **Human review:** screen-reader labels and focus order (VoiceOver), and whether the focused framing is
  comfortable. Val.

## Band framing (16:40Z)

The in-world captures showed the panel (captions and controls, which the issue requires in both views) covering the
bottom of the focused film. Focus now fits the film into the band above the panel's top edge with a lens shift (the
projection's vertical off-centre term, reapplied each frame after `updateProjectionMatrix`), stepping back along the
centre line when the front row needs it, never past the back row (`screenFrame.back`, from the new
`IPIC_RECLINER_ROWS`). Lowering the camera instead would have put it at seated head height for the front row.
The visit journey now checks that the film's lowest corner is above the panel's top edge, and it skips the
first-visit store intro before its reception check.

## Next step

Rerun the GPU visit (both motion settings) and the in-world focus inspection on the band framing, run
`pnpm run verify`, then commit, push and post the #500 handoff.
