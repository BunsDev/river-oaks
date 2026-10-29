# #640 GTA-inspired on-foot encounter: increments 3, 4 and 5

Goal: Val, 2026-10-27 (`goal-640-crime-feel-increments-3-5`). Session `claude:river-oaks-d1 (c6ab037e)`.
Consumes #637 (#645, merged) and #640 increments 1–2 (#646, merged). Supplies evidence to #599.
Register tasks, one per PR branch:

| Increment | Task | Branch | Worktree |
| --- | --- | --- | --- |
| 3 resident reactions | `onfoot-encounter-640-inc3-20261027` | `feat/onfoot-encounter-640-inc3-20261027` | `../river-oaks-onfoot-640-inc3` |
| 4 client presentation | (stacked on 3, claimed when started) | | |
| 5 evidence | (stacked on 4, claimed when started) | | |

Not authorized here: merging or landing, deploys, production activation, budget or threshold
changes, new animation assets or audio, paid services. Timings and distances below are proposed
tuning, not approved budgets.

## State at start (2026-10-27 17:00Z)

- `main` `697c4a0d`, hosted Verify green on `95882097`.
- #645 (locomotion handoff) merged 2026-10-25 `3af2…`; #646 (melee phases, police perception, resisted
  capture) merged 2026-10-25. Checkpoint v17, writer generation 21/22.
- Register task `onfoot-encounter-640` is delivered with no owner. Its presentation worktree
  `../river-oaks-onfoot-presentation-640` holds one uncommitted, untracked file,
  `preview/tests/combat-motion.test.js`: a specification test for a `preview/src/combat-motion.js`
  that was never written. Left untouched; its design is adopted for increment 4 (credited below).
- `outdoor-residents-admin-controls-20261024` (codex:road-bricks-20261024): uncommitted work in
  `../river-oaks-outdoor-admin` restoring up to eight outdoor residents through the remote-player
  renderer (`preview/src/outdoor-residents.js`, figure ids `resident:<id>`). Lease expired
  2026-10-24T20:30Z; its last Codex transcript write is 2026-10-24T14:01. Not live, not taken over.
  Increment 3 draws residents through the same figure scheme in its own module so either lands
  first; the one-line `main.js` wiring overlaps and is recorded on #640.
- Milestone zone (Val's default in the goal): the south service lane, rival at (−2800, −1440).
  It lies inside `site_ring` (the ring's south edge passes about 1.8 m south of the rival), so
  residents can path there. Westcreek Lane is outside the ring.

## Increment 3 design: resident reactions

Server-authoritative, in the resident simulation the server already runs
(`preview/src/resident-life.js`, shared, not a garment-bake input), through the existing bounded
`motion.action` / `reactionUntil` override. Residents stay protected targets.

- **Alarms** (world.js, after `crime.step` and `police.step`):
  - a strike or counter that resolved at contact (hit, miss or evaded; not cancelled), at the
    actor's position (`crime.drainContacts()`, process-local, not checkpointed);
  - a police grab starting or an arrest starting (`alarm` callback from `createPolice`);
  - a wanted player (stars > 0) on foot within 6 m of a resident, checked at most every 250 ms.
- **Perception:** outdoor, non-stationary residents at street level within 20 m of the alarm
  (6 m for a wanted player) with a clear chest-height sight line (the police `sight` rule).
  Nearest first, at most 6 reacting residents at once, one reaction per resident per 10 s.
- **Reaction:** `startle` for 1 s (stop, face the alarm), then `flee` for 6 s along a routed path
  to clear non-road ground 12–18 m away from the alarm at about twice walking pace, or `cower`
  in place for 5 s when no flee route exists; then back to the routine. Held residents (a
  conversation, a wish, a visit) do not react.
- **State:** `motion.reaction = { kind, from: [east, north], until }` plus `motion.reactionCooldownUntil` on the
  resident's life record, so it rides in the checkpoint with the rest of resident life
  (`state.locals`). Restore validates it (kind, times, point). Snapshots add `life.reaction`
  (the kind or null). The resident count is unchanged.
- **Display:** `preview/src/resident-figures.js` maps outdoor residents within 120 m of the
  player (nearest 8) to remote-player figures, gesture `startled` while startled and `bow`
  (bent over, the existing crime `down` stand-in) while cowering; fleeing residents walk fast.
  Increment 4's pose layer gives them a dedicated cower.

## Files owned (increment 3)

See the register task. Not touched: garment-bake inputs, `community-ui.js`, `world-policy-ui.js`,
`walking.js`, `crime-release*`.

## Checks

- `node --test server/tests/resident-reactions.test.js` first failure kept under
  `.runtime/evidence-640/`.
- Focused suites with an isolated Redis; `pnpm run verify`; `crime-shared` journey with two
  Chromium clients; hosted CI on the pushed head; two independent reviews.

## Results (increment 3, 2026-10-27, worktree `../river-oaks-onfoot-640-inc3`)

Logs under the worktree's `.runtime/evidence-640/` (not committed).

- `node --test server/tests/resident-reactions.test.js`: first failure kept
  (`inc3-first-failure.txt`); now 6 pass.
- `node --test` on resident-reactions (preview, 2), resident-figures (3), volunteer-visits (9),
  remote-players (20): 40 pass after the review fixes.
- Focused suites (crime, crime-phases, police, resident-reactions ×2, resident-figures,
  resident-life, world-policy): 79 pass, 0 fail (`inc3-focused-suites.txt`).
- Transport suites without Redis: 22 pass, 4 skipped (`inc3-transport-suites.txt`). With an
  isolated `redis-server` on 127.0.0.1:6399 (crime-transport, world-policy-transport, redis-room,
  redis-backend, crime-phases): 44 pass, 0 skipped (`inc3-redis-suites.txt`).
- `pnpm run verify` (python 3.12 first on PATH): core passed before and after the review fixes
  (`inc3-verify-core.txt`, `inc3-verify-core-2.txt`; the second server stage: 127 pass, 0 fail,
  5 skipped, the Redis-gated tests covered by the isolated run above).
- `crime-residents` journey, two Chromium clients under `scripts/browser-lock.mjs`: run 1 failed on
  a stale stillness comparison (`crime-residents-run1.txt`), run 2 passed after the fix, run 3
  passed after the review fixes (`crime-residents-run3.txt`). `data/reports/shared-experience.json`
  restored after each run.
- Two independent reviews (fresh subagents on the diff: server; client and journey). Addressed:
  the tracked receipt the journey overwrote (restored); restore accepting a reaction on an indoor or
  stationary resident or timers far in the future (rejected / brought back to now, tested); the
  journey racing the rival's 20 s recovery (health clause dropped, population read during the
  flight); volunteer visits drafting a reacting resident (pool filter, tested); a flight that could
  end nearer the alarm (least-distance rule, tested); alarms during a storm (none); a held resident
  keeping a reaction (dropped, tested); the render audit and the indoor journey counting figures
  as peers (`kind` on remote stats); churn of the eight drawn residents at the cut (hysteresis,
  tested); the startle facing never shown (remote heading, tested); doc and ledger drift.
  Left for Val: nameplate ranking between residents and players; render-budget samples now
  include up to eight resident rigs; one hidden flight vehicle per resident entry.
- Hosted CI: on the pushed head, recorded on the PR.

## Results (increment 4, 2026-10-27, worktree `../river-oaks-onfoot-640-inc4`)

Logs under the worktree's `.runtime/evidence-640/` (not committed). Branch
`feat/onfoot-encounter-640-inc4-20261027`, stacked on increment 3.

- `preview/src/combat-motion.js` written to the adopted spec
  (`preview/tests/combat-motion.test.js`, copied from the untracked presentation worktree):
  15 pass after the pose and settle fixes (axis probes in `.runtime/evidence-640/probe*.mjs`).
- Wiring: `crime-ui.js` publishes `combatState` / `combatFocus` / `telegraph`; `player-avatar.js`
  faces the focus and layers the pose after `avatar.update()`, releasing held inputs once when
  held; `remote-players.js` plays the state forward from the snapshot's arrival; `main.js`
  attaches the state to player, rival and officer figures; `multiplayer.css` pulses the evade
  button on a telegraph; `docs/crime.md` "How a fight looks".
- `node --test` on combat-motion, crime-ui, remote-players: 50 pass, 0 fail after the reviews.
- `crime-shared` journey under the browser lock: run 1 passed (`inc4-crime-shared-run1.txt`),
  run 2 passed after the review fixes (`inc4-crime-shared-run2.txt`, 30.9 s; receipt copied to
  `inc4-crime-shared-run2-receipt.json`, tracked report restored).
- `pnpm run verify`: core passed before the reviews (`inc4-verify-core.txt`); core passed again on the reviewed tree (`inc4-verify-core-2.txt`, receipt `.runtime/agent/core.json`, dirty: uncommitted candidate): tooling 289/289; preview 4307 tests, 4306 pass, 1 existing skip; server 1320 tests, 1042 pass, 278 Redis-gated skips (no `REDIS_URL`; this increment touches no server code); desktop 132, 127 pass, 5 skips; then build, Python, demo and secrets.
- Two independent reviews (module; wiring and journey). Fixed with regressions: travel turn vs
  combat turn stacking on the local figure; legacy shove stacking on the strike layer; evade
  double-counting snapshot age; rival stagger pop after the strike ends; zero-duration
  `combatState` never ending / NaN; dead `arrest` hold; doc wording (hold releases push-to-talk and
  the look drag; subdued shows hands up). Noted for Val: start the local strike from the reply
  instead of the next snapshot (increment 5 measures the cost).
- Hosted CI: recorded on the PR.

## Gaps and next step

- Lane resident stops (optional re-routing) not added: the wanted-player alarm makes the journey
  deterministic without them.
- Reduced motion keeps the rest pose for residents; increment 4's layer owns poses.
- Increment 4 delivered as a draft PR (stacked on #708); see its results above.
- Next: increment 5 (`feat/onfoot-encounter-640-inc5-20261027`, `../river-oaks-onfoot-640-inc5`,
  stacked on increment 4): `server/crime-workload.js` (the #599 protocol of 2026-10-24, main vs
  branch), `preview/tests/combat-timing.test.js` (30/60/120 Hz under the proposed RTT 0/100/200 ms
  profiles, input-to-pose and contact alignment), the on-demand `crime-night` journey (two browsers
  in the south service lane at the latest authored hour), `pnpm run verify full` with isolated
  Redis from a clean detached snapshot.

## Increment 5 (2026-10-28, session `claude:river-oaks-3d (c317fd0a)`, worktree `../river-oaks-onfoot-640-inc5-3d`)

Goal: Val, 2026-10-28, the #599 follow-up prompt ("Resume #599 from its latest exact candidate…").
Branch `feat/onfoot-encounter-640-inc5-20261028` from #710's head `b7df2c6a`, draft PR stacked on
#710. Takeover: d1 (c6ab037e) last wrote 2026-10-27T18:26Z and its lease lapsed 13:00Z; ae
(68138fda) had planned the 13:00Z claim but last wrote 09:08Z. d1's branch
`feat/onfoot-encounter-640-inc5-20261027` (no commits past `b7df2c6a`, no upstream) and worktree
`../river-oaks-onfoot-640-inc5` are untouched. The four handoff files were copied byte-identical
(sha256 `5d8ad3aa…` crime-workload.js, `8158f9ea…` crime-night.js, `ca336764…`
combat-timing.test.js; shared-runner.js and package.json wiring; `docs/crime.md` with ae's run-2
paragraph) and committed signed as `aeb95f85`, d1 credited in the message. Logs under
`.runtime/evidence-640/` (not committed) and the session scratchpad.

- **Focused server suites with an isolated Redis** (`redis://127.0.0.1:16603/3`, this session's
  own server): crime, crime-phases, police, police-capture, police-world, crime-transport,
  world-policy, world-policy-transport, resident-reactions, redis-room, redis-backend:
  **100 pass, 0 fail, 0 skipped** on `aeb95f85` (80 s). These are the server proofs for the #599
  rows "policy off in every phase", "retry/reconnect/writer takeover exactly once", "surrender and
  resisted capture", "stars held under observation" and "search after sight loss".
- **`RIVER_OAKS_COMBAT_EVIDENCE=… node --test preview/tests/combat-timing.test.js`**: 1/1 on
  `aeb95f85`; the 30/60/120 Hz × RTT 0/100/200 ms table in `docs/crime.md` is reproduced
  (deterministic seeds).
- **Crime workload, `main` `6f85ba9b` vs `aeb95f85`** (sustained mode, 2 × 20 s per tier, load
  12–17 with other sessions on the host; `main` run in a clean detached snapshot with the harness
  copied in and removed after, so its receipt reads `dirty`): step p95 1.46–1.89 ms on `main`,
  1.49–2.23 ms on the branch (one 1-player outlier at 6.12 ms under host noise); step max
  115–222 ms on both (cold route searches, 3–5 steps over 50 ms per run in both arms); snapshot
  60,302 / 67,526 / 74,722 / 89,073 bytes on `main` against 61,848 / 69,072 / 76,268 / 90,619
  (+1,546 per tier, the published combat state); checkpoint −50 bytes per tier; police at the cap
  of 6 from 8 players; identical admissions and outcomes (8/160/320/640 strikes, 8/80/80/80 hits).
  Report `data/reports/crime-workload.json` (branch, with `main` embedded as `baseline`).
- **Zone geometry probe** (`createWalkingEnvironment` on `district.json` + vegetation, chest-height
  `hasSightLine`): inside the south service lane 0 of 27,200 free points are hidden from the
  officer post and no pair of free points within 3–12 m is blocked; inside Westcreek Lane 0 of
  19,320 and none. Leaving a zone cancels pursuit. So "break sight around real geometry → search →
  escape" cannot be shown in a browser in either authored zone; it stays server-proven
  (police.test.js "sight loss searches the last seen point…", police-capture.test.js "a searching
  officer looks around the last-seen point…", "a watched wanted player keeps their stars; out of
  sight they cool off"). Routed to zone authoring as a decision for Val (below).
- **Three-browser encounter journey** `preview/e2e/crime-encounter.js` (new, on demand through
  `RIVER_OAKS_SHARED_JOURNEY=crime-encounter`, not in the default journey list; wired in
  `preview/e2e/shared-runner.js`): owner page for the rules, a visitor and a witness with
  `recordVideo` contexts, per-frame samplers on both, raw-command exactly-once challenges, socket
  drop, window blur with W held, emergency off mid-pursuit, resisted and voluntary capture.
  Described with the run-6 numbers in `docs/crime.md` ("The encounter in one run, three browsers").
  Six runs on `aeb95f85` + the journey, each under the shared browser lock with `caffeinate -s`,
  logs and receipts in `.runtime/evidence-640/crime-encounter-run{1..6}-*`:
  1. 09:22Z fail, harness: "Walk then sprint on the local figure: 3.19 then 3.2 m/s" — the walk
     analysis window (`t('walk:up') + 1500`) overlapped the sprint hold; window moved to +850 ms
     with the motion JSON in the message.
  2. 09:25Z fail, harness: "A timed evade (U) beats the rival's counter: seen null ×3" — the raw
     duplicate-attack challenge ran before the keyboard strike, its star brought the officer in and
     the rival's counter never targeted the visitor during the loop. The challenge moved to the
     third approach (after the third strike) and the check now expects 25 damage / 1 star.
  3. 09:31Z fail, harness: after emergency off the test waited for the HUD line "Nobody can be
     harmed", which the HUD shows only beside a rival; the visitor stood by a resident. Dropped;
     the town state (no unit on the visitor, nothing pending) is the proof.
  4. 09:33Z fail, harness: "Emergency off during null" — no officer was on the visitor when the
     switch flipped because the resident stood beyond the lane post's sight. The visitor now walks
     back within sight before the pursuit is awaited.
  5. 09:35Z fail, harness: the post-off movement proof used a server travel to an unwalkable spot.
     Replaced by a real W hold reading `pose.speed > 0.3`.
  6. **09:36–09:38Z pass, 31/31 checks in 125 s** (Apple M5 Max, ANGLE Metal, full rendering,
     frame time p50 35 / p95 54 ms with three browsers; host load 10–17). Receipt
     `data/reports/crime-encounter-shared.json` (sha256 `1a8d3f0c…`, copied to
     `.runtime/evidence-640/crime-encounter-run6-receipt.json`); videos
     `output/playwright/crime-encounter-video/crime-encounter-run6-{visitor,witness}.webm`
     (`3ff709d0…`, `d108fcdb…`, 1280×860 at 25 fps, 125 s; git-ignored, kept on this host);
     21 screenshots `output/playwright/crime-encounter-*.png`. Rows: movement pass, fight and
     resisted capture pass, grab evaded pass, civilian reaction pass, policy off mid-pursuit pass,
     exactly-once pass, reconnect mid-pursuit pass, focus loss pass, voluntary surrender pass;
     not-run with reasons: search after sight loss, stars under observation, altitude/safe-ground
     during windup (server-proven). No page errors on any of the three pages.
- **What the recordings show** (frame sheets extracted with ffmpeg, read by this session, not a
  human disposition): the visitor's figure walks, sprints, turns, strafes and backs up on the
  crossing with feet planted and the chase camera following smoothly; the witness in first
  person sees the same figure cross its view at the same cadence; the strike, the rival's flinch,
  the officer's reach and the hands-up pose read on the witness's screen within a frame or two
  of the town. Two things worth a human eye: the published HUD latency under three browsers (351
  ms key → strike on this host, 51 ms when crime-night ran alone) and the chase camera sitting in
  tree foliage when the visitor stands under the lane's trees (visible in the resident capture).
  The hour is 19:00 daylight (no authored night sky), as ae found.
- **`pnpm run verify` core on the uncommitted increment-5 tree** (`aeb95f85` dirty, 14:42–14:50Z,
  receipt `.runtime/agent/core.json`, log `verify-core-inc5.log` in the session scratchpad):
  **passed** — tooling 289/289; preview 4307 tests, 4306 pass, 1 existing skip; server 1320 tests,
  1042 pass, 0 fail, 278 Redis-gated skips (no `REDIS_URL` in the core profile; the focused
  100/100 run above covers the crime/police/transport suites with this session's isolated Redis);
  desktop 132, 127 pass, 5 platform skips; then build, Python, demo and secrets. `pnpm run verify
  full` (Redis, dependency audit, browser journeys) was **not run** on this tree; the three browser
  runs above ran under the shared browser lock on their own.
- Gaps: no human has watched the recordings (the disposition row stays open); the published
  strike latency under three browsers on one host (351 ms) is a measurement, not a budget;
  concealment escape needs zone geometry; the hour is daylight at 19:00.
- Next: done below (draft #732, hosted checks, `verify full` and `verify browser` on `700bddb2`);
  the #599 matrix (#731) consumes these receipts.
- **Writer takeover and fencing on real transports** (2026-10-28 15:00Z, `REDIS_URL=redis://127.0.0.1:16603/5`,
  this session's isolated Redis; log `writer-takeover-suites.log` in the session scratchpad):
  `node --test server/tests/redis-room.test.js server/tests/world-policy-transport.test.js
  server/tests/crime-transport.test.js server/tests/police-world.test.js` → **37 pass, 0 fail,
  0 skipped**, among them "redis: one hit is seen by every client once, through retries,
  reconnects and writer replacement", "redis: police, authenticated surrender and one arrest
  agree across clients and writer replacement", "an upgraded coordinator takes over an older
  lease without waiting for its TTL", "coordinators: a v13 town committed by an older writer is
  fenced…" and "redis: owner rules … survive reconnect and writer replacement". A browser-level
  takeover (two world processes behind a switching proxy in front of the page) is not built;
  the journey records that row not-run with this reason.
- **Encounter runs 7–10** (two more episodes: safe-zone transition inside the windup by server
  travel, stars held under observation; the not-run rows rewritten with exact reasons and a
  writer-takeover row):
  7. 15:03Z fail, harness: U 340 ms ahead of a grab's estimated contact reached the town late
     under load (31 → 25 load averages), the grab landed and the arrest wiped the stars.
  8. 15:20Z fail, harness: U 420 ms ahead of a counter's contact on a quiet loop was too early.
     Replaced the fixed lead by a per-telegraph round-trip probe plus 160 ms.
  9. 15:45Z fail, harness: the town's 1 s travel cooldown refused the step out of the zone
     (`travel_cooldown`) and the step back from the rival, so the rival's counters wore the
     visitor down (100 → 20) and the officer arrested the downed player. Travel retries through
     the cooldown; the windup challenge waits it out.
  10. **16:14–16:17Z pass, 37/37 checks in 201 s** (receipt `.runtime/evidence-640/
      crime-encounter-run10-receipt.json`, videos `crime-encounter-run10-{visitor,witness}.webm`,
      hashes appended to `crime-encounter-run6-SHA256SUMS`): safe-zone transition during windup
      pass (`cancelled` / `not_danger_zone`, nothing lands); stars held under observation pass (11
      evaded grabs over 36.4 s, star kept; cooled 30.1 s after leaving); the first grab after the
      surrender offer was seen with 86 ms left, so "grab evaded" reads not-run in this run (pass
      in run 6, and eleven evaded in the observation episode). Logs for 7–10 under
      `.runtime/evidence-640/`.
- **Gates on `700bddb2`** (clean tree, `.runtime/agent/<profile>.json` receipts copied under
  `.runtime/evidence-640/`; no single-run green `verify full` receipt exists for this head, each
  stage is reported by the run that produced it):
  - `pnpm run verify full` attempt 1, 16:31–17:39Z with isolated Redis (`redis://127.0.0.1:16603/7`),
    host load 17–21: **failed** at `experience` (`ETIMEDOUT` at the 20-minute stage budget after
    15/17 journeys, killed inside `garden-campus-suite`). Passed before it: dependency-audit,
    agent-tests, preview-tests (4307 pass / 1 skip), server-redis-tests (1362 pass / 0 fail /
    0 skipped), desktop-tests (127 / 5 skipped), build, python-lint, python-format, python-tests,
    demo, demo-verify, secrets, secret-history, security-browser, reflections. Not run:
    experience-commons, shared, ipic-screening. `data/reports/experience.json` restored. Log
    `verify-full-700bddb2-attempt1.log`.
  - `pnpm run verify browser` attempt 1, started 22:04Z after waiting for load under 8 / 10
    (started at 3.98 / 8.16), finished 2026-10-29 00:57Z: build, security-browser, reflections,
    **experience passed (16/16 journeys, 961 s)**, experience-commons passed (246 s); **shared
    failed** on 1 of 29 journeys, `crime-residents`: "Esme then runs (town state): undefined m/s"
    (the startled resident did not reach run speed within the 12 s wait; the journey's own note
    names cornering, a blocked step or the route search as causes); ipic-screening not run.
    The increment-5 diff touches no client or server runtime file, and the hosted
    `preview shared (development)` shard passed on this head. Receipt and log
    `verify-browser-700bddb2-attempt1-{receipt.json,log}`, failed report
    `shared-experience-700bddb2-attempt1-failed.json`.
  - Shared stage rerun once, `pnpm run test:shared` 2026-10-29 00:58–02:24Z at load 6.7 / 6.8:
    **29/29 passed**, `crime-residents` in 20.3 s; then `node preview/e2e/ipic-screening-runner.mjs`
    02:24–02:25Z **passed** (19 checks, converged after 5 ms, paused spread 0 ms). Log
    `verify-browser-700bddb2-shared-attempt2-ipic.log`, report
    `shared-experience-700bddb2-attempt2.json`; `data/reports/shared-experience.json` restored.
    The `crime-residents` first failure is a flee-timing flake, not fixed here: one failure in
    two local runs plus the hosted pass; it is routed to the residents journey (#708 lane) if it
    recurs.
  - Hosted (PR #732): Verify run 40726781752 on `700bddb2`: `preview experience (heights)` failed
    on attempt 1 (`bayou-heights: alice home: stalled`, not touched by this diff), rerun once with
    `gh run rerun 40726781752 --failed`, attempt 2 passed 17:02–17:20Z; final 21 success /
    5 skipped / 0 failed. Desktop run 40726781917 success. The earlier Verify run on `149567d7`
    (40710075919) lost its heights shard to the 20-minute cutoff and was superseded by the push.
  - Not proven by any of the above: production, live auth, native Unreal, target GPU, human
    accessibility (Val's device pass pending), a browser-level writer takeover (Redis suites only).
