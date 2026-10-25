# #637 Local and peer locomotion handoff: travel heading and horizontal stride

## Objective and ownership

Local and peer avatar feet follow actual travel direction and horizontal movement, including
1.65 / 3.2 / 6.4 m/s walking, slopes, curbs and stationary lift or level travel, without changing
authoritative movement, character identity or the foot-placement solver. Task
`locomotion-handoff-637`, branch `fix/locomotion-handoff-637-20261024`, worktree
`river-oaks-locomotion-637`, base `origin/main` `e17fd94d`. Owner
`claude:onfoot-637-640-728d6f06`. #640 (same owner) consumes this seam; #599 consumes the evidence.

## Files owned

- `preview/src/locomotion-handoff.js` (new): one derivation for the local and peer payloads.
- `preview/src/player-avatar.js`: locomotion payload only.
- `preview/src/remote-players.js`: peer speed, stride distance, heading and lift carry only.
- `preview/tests/locomotion-handoff.test.js` (new).
- This ledger.

`foot-placement.js` already accepts `heading` (world yaw, `(sin h, cos h)` = scene `(x, z)`) and
`platform` (moving floor). Its own tests pass them. It is not changed.

## Source findings at `e17fd94d` (before any edit)

1. `player-avatar.js:349` computes `travelHeading` from `pose.velocity` and uses it only to turn the
   body. The `avatar.update` payload omits `heading`, and `office-world-scene.js` computes
   `heading` for its street presentation, which `player-avatar` also drops. Foot placement then
   places steps along the turning body's forward axis, not along travel.
2. `remote-players.js:116` adds the 3D interpolated move to `entry.distance`, and `:149` passes
   `Math.min(3.4, moved/delta)`, also 3D. A peer travelling vertically (campus lift/level change
   under the 8 m snap, office lift) therefore walks, and a legitimate 6.4 m/s Jevica peer animates
   at 3.4 m/s. No heading is passed.
3. The server accepts `fastWalkFor(id)+0.2` m/s for a pose (`server/world.js:656`): 6.6 for
   Jevica's accounts, 3.4 otherwise. The 3.4 cap matches only non-Jevica peers.

## Plan

1. Failing behavioral regressions first (preserve the first failure output below).
2. One pure handoff module used by both callers: horizontal speed/distance, explicit travel
   heading with an idle fallback, per-identity peer bound from `fastWalkFor`, vertical-only travel
   carried as a platform, snaps/reconnects cleared rather than counted as stride.
3. Measure with the real `createFootPlacement` and shipped rigs: planted-foot drift, IK error and
   steps at 30/60/120 Hz across reversal, turns, start/stop, slopes, curbs, lifts and 1.65/3.2/6.4.
4. Rendered two-player comparison in a real browser before claiming visual improvement.
5. `pnpm run verify`, applicable full/Redis, independent review, signed draft PR.

## Results

### Reproduction (first failures, `e17fd94d`, preserved in `.runtime/evidence-637/`)

`node --test preview/tests/locomotion-handoff.test.js` with remote-players unchanged: 2 pass, 6 fail.
`locomotion-handoff-local.test.js` with the payload extracted unchanged: 0 pass, 2 fail.

| Case | Measured on `e17fd94d` |
| --- | --- |
| Local reversal/strafe/restart, both shipped rigs, 30/60/120 Hz, 1.65/3.2/6.4 m/s | steps land 0.21–0.32 m off the travel line (first failure: jevica reverse 1.65 m/s 30 Hz, 0.248 m) |
| Peer at the real 5 Hz pose/broadcast cadence, steady 1.65 m/s | animation 0.32–3.40 m/s, body 0.32–6.75 m/s per frame: a surge every snapshot |
| Peer at 6.4 m/s (Jevica's account) | animated at 3.4 m/s; no heading |
| Peer lift 4 m + 3.6 m level change | stride advanced 7.59 m; walking cadence while standing |
| Peer on a slope | stride 5.04 m for 4.82 m of horizontal travel |
| Peer relocation | one frame advanced the stride 38.5 m |

Guards that already passed and must keep passing: a stopping peer never walks past and back; peer
animation speed never exceeds the account's accepted pose speed.

### Change

- `preview/src/locomotion-handoff.js` (new). `localLocomotion(pose)` hands foot placement the
  travel heading from the walking velocity (or a presentation pose's own `heading`), the existing
  horizontal speed/distance and floor; none when standing, seated or flying.
  `createPeerMotion(id)` follows a peer's town pose with a paced playhead: it walks the received
  path at the peer's speed over its last eight poses (distance over time), about 0.3 s behind the
  newest pose, corrects slowly (1.2 s), brakes at up to 24 m/s² into the last pose (the local
  walk's stopping distance from 6.4 m/s is about 0.8 m, as is this) and never passes it. A stiff
  per-axis spring (24/s) follows the playhead. Figures synced every rendered frame (the office's own
  actor), flight and rides keep the original 12/s lerp. Stride distance and speed are horizontal; speed is bounded by the
  account's accepted pose speed `fastWalkFor(id)+0.2`; heading is the frame's horizontal travel;
  vertical travel while standing is passed as a moving floor; snaps (> 8 m, seating) count nothing.
- `remote-players.js`: uses it; body heading now turns on horizontal speed > 0.05 m/s instead of a
  0.004 m per-frame step (frame-rate dependent). `stats()` adds `locomotion` and `feet` for the
  journey below (inspection only).
- `player-avatar.js`: payload from `localLocomotion`. Body facing is unchanged.
- `preview/e2e/locomotion-peer.js` + one selectable entry in `shared-runner.js` (not in the
  default list): two-client, normal-speed video and per-frame traces.

### Focused results on the candidate

`node --test preview/tests/locomotion-handoff.test.js preview/tests/locomotion-handoff-local.test.js
preview/tests/remote-players.test.js preview/tests/foot-placement.test.js preview/tests/avatar-culling.test.js
preview/tests/office-*.test.js`: 223/223 pass. Full preview suite (`pnpm test`): 4026 tests, 4025
pass, 1 existing skip, 0 fail.

| Case | Candidate |
| --- | --- |
| Local reversal/strafe/restart (same matrix) | 0.10–0.18 m off the travel line (test bound 0.2 m) |
| Peer 5 Hz steady, 30/60/120 Hz × 1.65/3.2/6.4 | animation and body within −10%/+15% (e.g. 60 Hz 6.4 m/s: 5.77–6.63) |
| Peer added display delay behind the newest received pose | under 0.6 s of travel (0.3 s buffer + 0.08 s follow + ≤ one 0.2 s pose of catch-up); the lerp it replaced added about 0.08 s |
| Proposed network profiles RTT 0/100/200 ms, ±0/15/40 ms jitter, 0/1/3 % TCP stalls of 250/400 ms, 3 seeds | 0 and 100 ms: pace −10%/+19%, never stops or reverses. 200 ms seed 29: a 400 ms stall outlasts the 0.3 s buffer, the figure brakes to 0.04–0.27× and catches up at about +20%; never reverses |
| Peer lift, level change, slope, relocation, reconnect | no stride while standing; floor carries 7.59 m; slope stride equals horizontal travel; relocation adds nothing |

These profiles are proposed test conditions for #637/#640/#599, not approved latency budgets.

### Core gate

`PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH pnpm run verify` on the uncommitted candidate
(source hash in `.runtime/evidence-637/candidate-source.sha256`): passed. Tooling 233/233; preview
4026 tests, 4025 pass, 1 existing skip; server 1107 tests, 884 pass, 223 Redis skips (no
`REDIS_URL`; this change touches no server code); desktop 118, 115 pass, 3 skips; then build,
Python, demo and secrets. Receipt `.runtime/agent/core.json` (dirty: uncommitted candidate).

### Independent review and fixes

A separate reviewer (fresh context, given only the code and contracts) found, with simulations in
the scratchpad:

1. High: fast flight (up to 21 m/s) jumped and froze. Braking at 24 m/s² needs more path than the
   8 m snap leaves above about 16 m/s (1.67 jumps/s, 36 % frozen frames vs 0.3/s, 6 % before).
2. Medium: riding peers' bodies pointed 9.5–13.9° off their travel in turns (base 2–3°): position
   was paced, the ride's own yaw was not.
3. A relocation counted as a pose step and spoiled the speed estimate for about 2 s.
4. Per-frame actors (office) were paced at ≤ 20 fps and hesitated after a pause.
5. Latency roughly doubled (pose to screen 0.26 → 0.55 s); seat snap and gesture timing shift with it.
6. A ≥ 600 ms stall cleared the speed history and the burst after it surged to 1.74×; the network
   test only asserted forward motion.
7. Per-frame allocations in the render loop.

Fixes: pacing applies only to walking peers; flight, rides and per-frame actors keep the original
lerp exactly. Per-frame detection is three consecutive changed frames; a snapshot cadence (two
changes a few frames apart, under 0.6 s) returns to pacing; entries start direct. A relocation
(> 8 m, seating, or a level change of more than 1.5 m in one walking pose) clears the history and
counts nothing. Pauses no longer clear the history; elapsed time per pose is bounded to 0.05–0.5 s.
State, platform and playhead are reused per peer. New regressions: fast flight, a riding turn,
relocation then walking on, a per-frame actor at 15–120 Hz from standing, and a real pace bound
under the network profiles (now 0.90–1.20× at every profile; RTT 200 ms stalls slow the figure to
0.04×, never reverse). Item 5 is the accepted trade-off; it is stated in the PR for review.

The 14 peer tests against main's `remote-players.js`: 10 fail (the fix), 4 pass (guards: speed
bound, no overshoot, fast flight, rides, per-frame actor). Journey fixes: peer windows shift by
0.6 s, the planted metric is labelled as ankle travel including heel-to-toe roll, peer frames count
only on screen.

### Re-review and second round

The same reviewer re-ran its simulations: six of seven findings fixed or improved (5 is the stated
trade-off). It found one new medium-low defect and five low ones from the rewrite:

- A newly seen peer's first walk surged, nearly stopped (0.00–0.36 m/s), then ran at 1.39×, because
  entries started in the direct lerp and switching to pacing threw away the history. Landing while
  moving did the same. Also: a stall released one snapshot per frame could flip a walker into the
  lerp; ≤ 10 fps observers never paced; the level-change snap could fire on escalators when poses
  merged; the speed history across a stop made a new speed lag; remaining per-frame iterator and
  closure allocations.

Second round, after three attempts measured frame by frame (a seeded switch still dipped to
0.55×, a spring lead to 0.41×, because a buffer cannot be built while switching without a pause):

- Walking peers are paced from the start. "Posed every frame" is detected from how often the
  figure is synced (`remote-players.sync()`), not from pose changes: five consecutive frames with a
  pose, spanning at least 50 ms, select the direct lerp (the office actor); the town's 5 Hz poses and
  a burst of queued snapshots never do. Switching back to pacing (and landing) resumes from the
  figure's position at the estimated walking speed with the history kept, and the buffer grows from
  the delay the figure has to 0.3 s over about 2 s.
- A level change is a new `levelId` or a rise over 1.5 m that exceeds the pose's horizontal travel.
- No iterator, closure or array allocation per frame in either mode; running sums replace reductions.
- New regression: a newly seen peer's first walk stays within 0.89–1.15× at 30/60/120 Hz and
  1.65/3.2 m/s. Per-frame actors stay within 0.15 m from standing at 15–120 Hz.

Remaining, documented: a speed change straight after a stop takes about 1.5 s to settle (the history
spans the last eight poses); an observer rendering at about 5 fps or less, where nearly every frame
carries a snapshot, follows peers with the original lerp.

### Final gate (the committed source)

`PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH pnpm run verify` on the final source (hashes in
`.runtime/evidence-637/final-source.sha256`, the tree committed next): passed. Tooling 233/233; preview
4031 tests, 4030 pass, 1 existing skip; server 1107 tests, 884 pass, 223 Redis skips (no server
change); desktop 118, 115 pass, 3 skips; build, Python, demo and secrets passed.

### Found, not changed here

Restarting from a stop at 3.2 or 6.4 m/s leaves the trailing foot 3–17 cm out of reach for about
50 ms (60/120 Hz; 0 at 30 Hz), with or without the heading. The walking spring reaches 5.7 m/s in
0.2 s and the single-support walk cannot keep the trailing foot in reach. This is a gait
(walk/jog/sprint) problem; it belongs to #640's grounded-locomotion increment.

## Gaps and next step

Pending: two-player rendered capture (queued in the browser lock; candidate and an unmodified
`e17fd94d` baseline in a scratch worktree, same journey), `pnpm run verify`, independent review.
Not possible here: 6.4 m/s in the browser (development identities are not Jevica's accounts; the
unit tests cover it), physical devices, human feel review.
