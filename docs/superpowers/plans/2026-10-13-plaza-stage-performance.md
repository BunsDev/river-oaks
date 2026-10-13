# The plaza stage as a shared performance — 2026-10-13

**Objective (Val):** "make this stage interactive", for the plaza salon's music
stage. Val chose a **shared performance**:
- X takes the stage;
- the town holds it for one performer at a time;
- everyone sees the performance and the stage lights;
- X or walking off ends it.

**Branch / worktree:** `feat/plaza-stage-20261013` in
`../river-oaks-plaza-stage-20261013`. river-oaks-c2 (plaza games) and
river-oaks-f1 (voice) confirmed there's no overlap. A performer's voice
carrying across the plaza would be a separate PR in f1's voice server.

## Change

- **Server** (`server/world.js`):
  - **Commands.** `{ type: 'stage', action: 'take' | 'leave' }`.
    - Taking requires the player to be within the stage radius + 1.6 m, on
      foot, not seated and outdoors.
    - A second taker gets `stage_busy`, with a message naming the performer.
  - **Where the performer stands.** At the stage centre on the 0.22 m top,
    facing the salon (`seatYaw(heading − π)`, as seats do).
  - **Pinned.** Pose updates may turn the performer but not move them
    (`leave_stage_before_moving`).
  - **Gestures and other actions.** Wave and bow still play, and the resting
    gesture is `perform`. Sitting, watering and interactions answer "Leave the
    stage first."
  - **Stepping down.** The performer returns to where they stood. If that is
    taken, they step to a free spot around the stage, front first.
  - **Ending.** Travel, leaving town and the admin reset end a performance.
  - **Checkpoints never hold a performer.** A performer is saved standing where
    they stood. Without this, restoring would fail: the stage blocks walking,
    and its top is 0.22 m above ground.
- **Client:**
  - `preview/src/plaza-stage.js`: the X action offers "Take the stage", "Step
    down from the stage", or a disabled "⟨name⟩ is performing". It sends the
    command and applies the town's answer. It also turns the stage lights on or
    off from the snapshot.
  - `walking-ui.js` pins a performer like a seated player: they can turn but
    not walk or fly. The title reads "On stage" and the hint "Drag to look
    around · X steps down".
  - `contextual-action.js`: a play action offered while standing (only the
    stage today) is the primary action, ahead of talking to a nearby local.
  - `resident-gestures.js` adds the `perform` pose: a sway to the beat, chin
    up, the left hand at the microphone and the right hand open to the
    audience. Reduced motion holds it still, like every gesture.
  - `plaza-salon.js` adds the stage lights: an additive shaft fading upward and
    a warm pool on the boards, hidden until someone performs
    (`userData.stage.setLive`).
  - `main.js` wires the X provider, and adds a debug hook
    (`__riverPlazaStage().goNear()`).

## Verification

- `node --test server/tests/plaza-stage.test.js`: 6/6. The tests cover:
  - placement, facing, one performer, and the busy message;
  - the pin, turning, wave, and refused seats and interactions;
  - reach, on-foot and argument checks;
  - travel and departure freeing the stage;
  - a checkpoint taken mid-performance restoring the performer beside the
    stage. With that handling removed, restore fails with `invalid_checkpoint`.
- `node --test preview/tests/plaza-stage.test.js`: 5/5 (offer, reach, busy,
  step down, lights, pose). `contextual-action.test.js`: 8/8.
- `pnpm run verify`: `core: passed` (unit 2756 pass, 0 fail, 1 skipped; server
  427 pass, 134 skipped without Redis).
- `pnpm run test:experience plaza-stage`, a two-browser journey with 13 checks,
  passed three times in a row. One earlier run lost its browser when another
  session stopped its own run. Another run read the walking title before its
  150 ms repaint; the journey now waits for the title.
- `plaza-salon` journey: passed.
- Screenshots: the performer stands on the stage between the stools, arms out,
  under the light shaft; the audience sees them perform.

## Next step

PR, then `pnpm run land`.
