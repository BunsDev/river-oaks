# #637 follow-up: foot contact, horizontal speed, stairs, seated transitions and vertical motion

## Objective and ownership

The 28 October amendment on #637 asks to keep the stride/root-cause scope, reconcile the
controller and rig changes since #645, inspect foot contact, horizontal speed, stairs, seated
transitions and vertical motion, fix reproduced animation defects with exact clips and timing,
and include reviewed #745 clothing in the motion checks without waiting on new wardrobe art.
Server movement authority, the 1.65 / 3.2 / 6.4 m/s speeds and avatar identity are unchanged.

Task `locomotion-qualify-637-20261030`, branch `fix/locomotion-qualify-637-20261030`, worktree
`river-oaks-locomotion-qualify-637`, base `origin/main` `163c204a`. Owner
`claude:river-oaks-loco637 (1a47dca6)`.

This branch (part 1) ships the stair and seated-transition fixes. The run gait (part 2, below)
is measured and prototyped but not shipped here: as built, it makes the reviewed skirts clip.

## Files owned (part 1)

- `preview/src/foot-placement.js`: stair height transfer, `reset()`.
- `preview/src/avatars.js`: reset the feet after sitting, riding or flying.
- `preview/tests/locomotion-qualify.test.js` (new).
- The five garment `*-morph-receipt.json` files (both source files are bake inputs; rebaked,
  receipts only, morph data unchanged).
- This ledger.

## Reconciliation since #645 (`a437cbbf`..`163c204a`)

`foot-placement.js`, `foot-roll.js`, `upper-body-gait.js`, `locomotion-handoff.js` and
`seat-and-water.js` are unchanged since #645. `avatars.js` changed 10 times (recipes, rides,
Ribbonwing, studio build) and `walking.js` 6 times (new districts); none touches the gait.
#640's `combat-motion.js` layers fight poses after `avatar.update` and leaves the feet alone.

Clips: no shipped avatar plays an animation clip for locomotion. The gait is procedural
(`foot-placement.js`, `foot-roll.js`, `upper-body-gait.js`). The Quaternius packs (#722) load
only for the `quaternius-ual-v1` family through `animation-clips.js`, and no shipped character
belongs to it. The exact timing below is therefore the procedural gait's.

#745 has no reviewed capsule on main, and #719 (wardrobe) is an open draft. The reviewed clothing
on main is what was measured: Sable's mini dress, Vesper's wrap skirt, Lyra's drapes, and the
workwear and tailored coat tails.

## Reproduced defects on main `163c204a`

Measured on the shipped rigs with `instantiateAvatar` + `createFootPlacement` (the avatar loop's
order). The scratch probes are under `.runtime/loco637/` in the worktree (not committed).

1. **Stairs sank the body.** An abrupt rise is carried by `heightLag`, but the body followed the
   transfer only through the crouch-release path capped at 0.5 m/s. On the office penthouse
   stair (the only walkable stair; ground along its 0.45 nosing line) every frame of a 3.2 m/s
   climb counted as abrupt: the hip sank 2.52 m below standing, with a planted foot 0.94 m out
   of reach (3.16 m and 1.54 m at 6.4). On a riser-stepped stair the walk at 1.65 m/s sank
   1.4 m by the head.
2. **Standing up kept the old footprints.** The feet are not placed while seated, riding or
   flying, and the 1 m relocation reset does not fire for a seat 0.4-0.9 m away. On standing,
   the feet were 0.54-1.04 m from their stance with the leg up to 0.4 m short, sliding back over
   about 0.5 s.
3. **No run (part 2).** Every speed steps about 0.43 m with one foot down: 3.9 steps/s at
   1.65 m/s, 7.4 at 3.2 and 14.9 at 6.4 (swings of 59 ms).
4. Not a defect: the walk alternates with 0.84 symmetry on some rigs at 30 Hz, the same on main
   and this branch.

## Fix (part 1)

- **Stairs:** a rise counts as an abrupt step only when it is both faster than 1.2 m/s and
  steeper than 0.6 over the frame's travel, so a fast walk up the office stair's nosing line is
  a slope that the body follows directly. A single curb still rises through main's release,
  capped at 0.5 m/s. The body now trails that release's ceiling by at most 0.2 m
  (`RISE_DEFICIT`), so the risers of a stepped stair cannot accumulate into a sink.
- Review correction: the first version carried every abrupt rise with the body. That fixed the
  stairs but raised the hip up a single 0.15-0.20 m curb at 1.2-1.9 m/s instead of 0.5 m/s.
  The deficit floor leaves curbs at 60 and 30 Hz identical to main (peak rise 0.50 m/s for both
  rigs, 1.65 / 3.2 / 6.4 m/s). A 0.15 m deficit would have changed 0.20 m curbs at 30 Hz.
  At 15 Hz and below a curb can rise faster than on main (up to 1.25 m/s at 15 Hz). Main already
  leaves planted feet 2.4 m out of reach at 12.5 Hz.
- **Seat/ride/flight:** `avatars.js` calls the new `feet.reset()` on the first frame the feet
  are placed again, which stands them under the body as a relocation does.

| | main | part 1 |
|---|---|---|
| flat walk and fast walk | unchanged | unchanged (no flat-ground path changed) |
| office stair up, hip below standing (1.65 / 3.2) | 0.12-0.38 / 2.52 m | unchanged / 0.14 m |
| office stair, planted foot out of reach | 0 / 0.94 / 1.54 m | 0 / 0 / 0 |
| stepped stair, hip below standing (1.65 / 2.4 / 3.2) | 1.37 / 2.14 / 2.55 m | 0.37 / 0.41 / 0.44 m |
| stepped stair, planted foot out of reach (2.4 / 3.2) | 0.61 / 1.01 m | 0 / 0 |
| single 0.15-0.20 m up-curb, 60 / 30 Hz | hip rise 0.50 m/s | identical to main |
| stand from a seat 0.4-0.9 m away | foot 0.54-1.04 m off stance | under 0.09 m, in contact |

The stepped-stair crouch is bounded by the reach crouch plus `RISE_DEFICIT`. The test's limit
(0.45 m) was raised from 0.40 m after the review change measured 0.41-0.44 m. On main the same
measure is 1.37-2.55 m, with planted feet up to 1 m out of reach.

## Clothing in motion (reviewed garments on main)

`skirtContactFixture` (garment surface vs the actual upper-thigh triangles) sampled every sixth
frame of 4 s through walk, run, sprint, a stepped stair walk and an office-stair run.

Part 1 leaves flat motion unchanged. On stairs main sinks the body into the treads, which crushes
the garments. Penetrating samples, main / part 1:

| garment | stepped stair walk (1.65 m/s) | office stair run (3.2 m/s) |
|---|---|---|
| Vesper's wrap skirt | 4,658 / 1,291 | 16,153 / 1,941 |
| Lyra's drapes | 3,844 / 375 | 21,054 / 8,321 |
| tailored coat | 1,899 / 144 | 6,665 / 697 |

Workwear coat on main: 1,870 / 6,724 (not rerun on part 1). The remaining stair clipping is
the thighs climbing past the garments' fitted range. That is an art follow-up, which the amendment
keeps separate from locomotion. The probe's office-run `hemOverGround` of -2.9 m appears on main
and part 1 alike, and is a probe artefact (ground sampled off the stair).

## Part 2: a run gait

Prototype (in `.runtime/loco637/foot-placement.run.js` with its tests): a run from 2.1 m/s held
about 0.25 s, with hysteresis down to 1.8 m/s and a cadence of `2.35 + 0.15 v` steps/s. Swings
are body-relative and overlap into a flight phase. Landings are time-bound at 0.15 s. A cut
faster than 3 rad/s breaks the run.

Measured at 60/120 Hz on 10 rigs:
- At 3.2 m/s: steps of 1.15-1.17 m at 2.8 steps/s, flight 48-56 %.
- At 6.4 m/s: steps of 1.83-1.97 m, flight 70-73 %.
- No planted slide and pelvis drop of 6-7 cm.
- At 30 Hz and 6.4 m/s, alternation symmetry is about 0.8.

Why it is held back: the reviewed garments clip in it while main's 0.43 m shuffle does not. With
a 5 cm swing clearance:

| garment | run (3.2 m/s) | sprint (6.4 m/s) | main |
|---|---|---|---|
| Sable's mini dress | 226 | 269 | 0 / 0 |
| Vesper's wrap skirt | 234 | 288 | 0 / 0 |
| Lyra's drapes | 7,045 | 7,248 | 0 / not run |
| tailored coat | 401 | 534 | 0 / 160 |

The cause is the trailing leg, not the lifted knee. Restoring the rear thigh's rest pose removes
every mini-dress penetration at the worst frames; restoring the front thigh does not. A running
toe-off extends the thigh to -0.39 rad, where the walk reaches -0.02 rad. The garments' leg
weights (skin to pelvis and thigh, `skirt-skinning.js`) have no correction for hip extension.

A shorter rear stance (`RUN_BACK`, the distance a running foot may trail the hip) limits the
extension: -0.12 rad at 0.1 m, +0.12 rad at 0 m. At 0.1 m the counts become:

| garment | run (3.2 m/s) | sprint (6.4 m/s) |
|---|---|---|
| Sable's mini dress | 0 | 10 |
| Lyra's drapes | 673 | 2,199 |
| tailored coat | 0 | 11 |

Lyra's drapes already clip at a walk on main (222).

### Part 2 as shipped (`fix/locomotion-run-637-20261030`, stacked on #808)

Task `locomotion-run-637-20261030`, worktree `river-oaks-locomotion-run-637`.

- `RUN_BACK` 0.1. A running foot lands 0.25 m ahead of the hip and leaves 0.1 m behind it.
- Phase lock (`RUN_PHASE` 0.3, `RUN_EARLY` 0.1). A foot that leaves out of phase swings that much
  shorter or longer, and a late one may leave up to 0.1 m ahead of the hip. Without it, joining
  a run from a walk limped for about 3 s (alternate steps of 1.23/1.00 m), because only the
  0.12 m stretch allowance corrected the phase. Variants measured (min. alternate-step ratio
  after 1.5 s, Jevica):

  | variant | 3.2 m/s @ 60 Hz | 6.4 m/s @ 60 Hz | 6.4 m/s @ 30 Hz |
  |---|---|---|---|
  | none | 0.38 | 0.46 | 0.06 |
  | lead < 0.1 only | 0.76 | 0.62 | 0.42 |
  | 0.25 m stretch | 0.97, but planted feet 0.9-2.4 m out of reach | | |
  | phase lock 0.3 + lead < 0.1 | 0.95 | 0.95 | 0.90 |

- 10 rigs:
  - at 3.2 m/s, 1.14-1.17 m steps (2.8 steps/s), flight 56-65 %;
  - at 6.4 m/s, 1.95-1.98 m steps (3.3 steps/s), flight 70-79 %;
  - symmetry 0.93-0.97;
  - no planted slip, stance error 0, pelvis drop 5.6-7.3 cm;
  - walking at 1.65 m/s unchanged.
- Thigh range: -0.22..0.70 rad (garment envelope +/-0.75; the 0.25 m stance reached -0.40).

Garments, penetrating samples (main / part 2):

| garment | walk | run 3.2 | sprint 6.4 | office stair run |
|---|---|---|---|---|
| Sable's mini dress | 0 / 0 | 0 / 0 | 0 / 3 | 16,449 / 3,764 |
| Vesper's wrap skirt | 0 / 0 | 0 / 0 | 0 / 3 | 16,153 / 3,635 |
| Lyra's drapes | 222 / 222 | 0 / 197 | 4,152 / 1,563 | 21,054 / 6,916 |
| workwear coat | 0 / 0 | 0 / 0 | 48 / 1 | 6,724 / 1,251 |
| tailored coat | 2 / 2 | 0 / 0 | 160 / 9 | 6,665 / 1,230 |

Remaining run clipping is Lyra's drapes at 3.2 m/s (197, all at toe-off, like her walk's 222)
and three samples per skirt at 6.4 m/s. That is an art follow-up for drape run correctives. On
the office stair part 2 clips more than part 1 for the skirts (1,941 → 3,635 for the wrap
skirt), because a run's longer steps lift the thighs higher on the treads. It is still a fifth
of main's.

Independent review of part 2 (subagent, its own probes against 87d0d44f):
- **Instant stop:** a run into a wall zeroes the speed in one frame, and both feet can be in
  the air with the body stopped for up to 8 frames at 60 Hz (17 at 120 Hz). That is within the
  0.15 s landing (`RUN_LAND`); part 1 had 0. Kept: the body stopped mid-stride. The stop test now
  covers instant stops at five phases and bounds the overlap by `RUN_LAND`, where it previously
  claimed none.
- **A walking peer after a pose stall:** `createPeerMotion` catches up at up to the fast-walk
  clamp (3.4 m/s). After a stall of 0.6 s or more it moves faster than 2.1 m/s for longer than
  0.25 s, so it runs for about a second (0.55 s stall: no run). Kept deliberately: the peer is
  then actually crossing the screen at running speed, and the legs match it. Before this branch
  it shuffled at 7+ steps/s.
- Two checks that could not fail (no running swing below `RUN_EXIT`) were removed.
- Checked fine: phase-lock clamp (travel never below 0.38 m), mid-run reset, platform carry,
  curbs, reversals and strafes via `stepWalking`. A synthetic instant 90 degree heading jump at
  6.4 m/s leaves a planted foot 1.5-5.4 cm out of reach; a real key turn leaves it 0.9 cm or less.
  At 12.5 Hz (0.08 s frames) part 1 left planted feet 11-24 m out of reach at 6.4 m/s;
  part 2 leaves 0.24 m.

## Checks (part 2)

- Focused: `locomotion-qualify` 7/7 (run strides, thigh envelope, stops eased and instant,
  both stairs, curb, seat), `foot-placement` and `locomotion-handoff-local`: 18/18 in all.
- Garment receipts rebaked after the last source edit (receipts only).
- `pnpm run verify` (core), two runs on the final tree:
  - Run 1 failed. `navigation.test.js` aborted in V8 (`Fatal error ... Check failed:
    !IsFreelistEntry()`, a GC-internal check) with no assertion; the diff does not touch
    navigation, and the file passes 6/6 alone. Log kept at `.runtime/run637/verify-core-1-v8crash.txt`.
  - Run 2 passed: preview 4,807 tests, 0 fail, 1 skipped; agent 294/294; server 1,395, 0 fail,
    285 skipped (Redis); desktop 132, 0 fail, 5 skipped; Python 215 passed; build, lint and
    secrets passed.

### Rendered two-client journey (part 2)

`RIVER_OAKS_SHARED_JOURNEY=locomotion-peer node preview/e2e/shared-runner.js development`, run on
the #811 head (both passed). Then the same run with main's `foot-placement.js` and `avatars.js`
swapped in and restored afterwards, as a rendered baseline. Setup: Chromium, full rendering, ANGLE
Metal on the M5 Max, about 41 Hz. Two development clients on one machine; their brisk walk is
3.2 m/s.

| phase | main local | main peer | part 2 local | part 2 peer |
|---|---|---|---|---|
| walk | 1.62 m/s, 4.10 steps/s | 1.52, 3.51 | 1.51, 3.51 | 1.58, 4.09 |
| brisk | 3.62 m/s, 7.81 steps/s | 3.44, 7.81 | 3.12, 2.83 | 3.35, 4.25 |

- Planted-foot travel: 1.3/1.2 cm on main, 1.2/1.0 cm on part 2. Foot error is 0 on both.
- The peer's brisk window includes its walk-to-run transition: `RUN_SUSTAIN`, plus the peer's
  pacing from a 2.1 m/s p05, so its rate sits between the run's 2.8 and the shuffle.
- Inspected frames:
  - The side-on observer view shows the peer running, with the legs wide apart and a forward knee.
  - The following camera sits behind the walker and foreshortens the stride.
  - At 10 fps, main's 7.8 steps/s shuffle aliases into plausible stills, so the frames alone
    do not prove the change. The rendered step rate does.
  - No garment poke-through was visible at this size, but the mini dress is about 40 px tall in
    the observer view.
- Not a human feel review. The receipt is not committed (`data/reports` restored); videos are
  in the worktree's `output/playwright/locomotion-peer-branch/`.

## Checks (part 1)

- `node --test preview/tests/locomotion-qualify.test.js`: 4/4. On main the stair and seat tests
  fail: a 2.51 m stair sink with a 0.94 m planted reach, a 1.37 m stepped-stair sink, and a foot
  0.32 m from its stance after a seat. The curb test passes on main and failed (as intended) on
  the first, reviewed version.
- 20 related suites (foot placement, foot roll, both handoff suites, walking posture,
  upper-body gait, stance, gait, walk driver, continuous walk, bicycle and motorcycle riders,
  avatars, office stairs, skirt/drape skinning, coat tails, both seat bakes): 116/116 before the
  review change; all are in the core preview run below.
- Rebaked the five garment receipts after the last source edit: receipts only, no morph data.
- `pnpm run verify` (core) on the final tree: passed (`.runtime/agent/core.json`). Preview 4,804
  tests, 0 fail, 1 skipped, 35 todo. Agent 294/294. Server 1,395, 0 fail, 285 skipped (Redis,
  outside core). Desktop 132, 0 fail, 5 skipped. Python 215 passed; build, lint and secrets
  scan passed.
- Independent review (subagent; diff, focused tests and its own main-vs-branch probe): the
  up-curb finding above, fixed. Also noted that a curb can count as a slope at 25 Hz and below
  (6.4 m/s); accepted, as above.

## Not covered / next

- Rendered two-client journey (`locomotion-peer`): run for part 2 against a main baseline (above).
  It covers walking, reversing, strafing, stopping and brisk movement, but no stair or seat, so
  the part 1 fixes have no rendered evidence.
- Human review of the stair climb and stand-up: none.
- Physical devices: none.
