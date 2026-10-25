# #640 GTA-inspired on-foot encounter

## Objective and ownership

One coherent night encounter in an existing danger zone: grounded walk/jog/sprint and
directional combat movement; one readable server-timed strike, an evade and a telegraphed
rival response; bounded protected-resident reactions; capped foot pursuit with meaningful
concealment and last-seen search; voluntary surrender and a telegraphed, avoidable resisted
capture; usable peaceful recovery. Task `onfoot-encounter-640`, branch
`feat/onfoot-encounter-640-20261024`, worktree `river-oaks-onfoot-640`, base `origin/main`
`e17fd94d`. Owner `claude:onfoot-637-640-728d6f06`. Consumes #637 (`locomotion-handoff-637`,
same owner). Supplies evidence to #599; #599 is not a build prerequisite.

Not in scope: PvP or production activation, firearms, vehicles, a new engine, full ragdolls,
paid services. No merge or deployment.

## Increments (each test-first, verified, signed draft PR)

1. **Server melee phases** (`server/crime.js`, `server/world.js` attack/evade wiring,
   checkpoint v17, writer generation 21/22, snapshot `crime.actions`, client snapshot validation,
   existing crime HUD reading outcomes from the snapshot, `crime-shared` updated).
2. **Police perception and capture** (`server/police.js`): facing-aware sight with a close-contact
   exception; wanted cooldown paused while actively observed; one telegraphed, avoidable,
   server-validated resisted-capture grab for a refusing participant; cancellation on policy off,
   safe ground and disconnect.
3. **Resident reactions**: capped nearby perceiving residents startle, flee or cower, recover.
4. **Client presentation**: combat-ready directional locomotion (consumes #637's heading seam),
   strike/evade/flinch/down/get-up/surrender poses, telegraph cues, reversible combat framing
   with a reliable exit, keyboard/touch parity, reduced motion, held-input clearing.
5. **Evidence**: two-player night encounter capture, 30/60/120 Hz and proposed 0/100/200 ms RTT
   profiles, input-to-pose, contact alignment, 1/8/16/32-player workloads with capped police.

## Increment 1 design (proposed tuning, to be playtested)

Coordinates: town `[east, north, elevation]` metres. Player `yaw` is the camera yaw; the
server does not know body facing, so a strike's direction is fixed at admission from the
authoritative attacker-to-target vector, and contact requires the target to still be inside that
arc. This is what a lock-on melee does, and it is what a sidestep beats.

| Action | Windup | Contact | Ends | Reach / arc | Effect |
| --- | --- | --- | --- | --- | --- |
| Player strike | 300 ms | at 300 ms | 900 ms (existing cooldown) | 1.6 m, height 0.6 m, ±60°, same room, sight | −25 rival health, +1 star (existing) |
| Rival counter | 750 ms telegraph | at 750 ms | 1500 ms | 1.6 m, ±60° | −20 participant health, 600 ms stagger |
| Evade | — | window 0–350 ms | cooldown 800 ms | — | contacts against the evader miss |

- Admission validates as today (policy, eligibility, reach, sight, cooldown), records a pending
  action with a stable ID (client `attackId`, else server-generated) and returns its phase. No
  damage, star or confirmation before contact.
- Contact (crime step, and before any decision that reads it) rechecks policy from current
  positions, attacker eligibility (on foot, street level, not seated/riding/flying/performing),
  target not down, reach, height, room, sight and arc. Failure resolves the action as a miss with a
  reason; it never lands later.
- Emergency off and policy updates cancel every pending action at once. Entering safe ground
  fails the contact recheck. Earned stars stay.
- Receipts store the action; a retried ID returns the same action and its current phase/outcome
  (`replayed`) and never restarts or re-lands it. Checkpoint v17 persists pending actions,
  participants and evade windows; writer generation 21/22.
- A player becomes a participant only by an admitted strike in an active zone. Participants carry
  `health` (100); a counter at 0 health leaves them down (existing police capture eligibility).
  Health recovers 20 s after the last damage, on arrest, on policy off and when participation
  lapses (no engagement for 30 s or leaving the danger zone).
- Rival response: a struck, conscious rival faces its attacker and, after its stagger and a
  cooldown of 2.5 s, telegraphs one counter if the participant is within 3 m; otherwise it
  disengages. It stays on its authored spot.

## Increment 2 design: police perception and resisted capture (proposed tuning)

- **Sight:** existing 35 m, ±2 m height and chest-height line, plus a facing cone of ±70° around
  the officer's facing, except within 3 m (close contact), where line of sight alone suffices.
  Officers face their travel; at stand-off they face the target; while searching they scan
  (90°/s sweep) at the last-seen point. A new response faces its target from the post (the
  dispatch is still the post's omnidirectional sight, as today).
- **Observation pauses cooldown:** each step in which an officer sees its target calls
  `crime.observe(userId, at)`, which moves that account's `quietSince` to `at`. The existing
  30 s decay then runs only from the end of observation. No second wanted clock; state is the
  existing checkpointed `quietSince`.
- **Resisted capture:** a pursuing officer within 1.5 m, with sight and the target in its cone,
  telegraphs a grab for 900 ms (state `grab`, direction fixed at the start). At contact it
  rechecks eligibility, policy (through `eligible`), reach 1.6 m, height, sight, a ±60° arc and
  the target's evade window. Success starts the existing 1.4 s arrest transition (the existing
  movement hold); failure gives a 2 s officer recovery. Only accounts with stars that refused to
  surrender are grabbed; a peaceful bystander never is. Policy off, safe ground, disconnect and
  ineligibility cancel the grab and release holds, as they already cancel pursuit.
- One checkpoint bump (v17) covers increments 1 and 2 on this branch.

## Increment 3 findings: residents (source read at `e17fd94d`)

- The server is the only resident simulator (`server/world.js` `createCommunity` /
  `createResidentLife`, stepped before `crime.step`): 24 outdoor + 74 indoor locals, replicated in
  `snapshot.locals[]` with `life.{action, status, reactionUntil, ...}`. There is no flee, cower or
  startle behavior; `motion.action` with `reactionUntil` (`resident-life.js`) is the existing
  bounded override to extend.
- Clients currently hide the 24 outdoor locals (`community-ui.js` keeps indoor only). The
  `outdoor-residents-admin-controls-20261024` task (owner `codex:road-bricks-20261024`, uncommitted)
  is restoring up to eight nearby outdoor residents through the remote-avatar renderer. Display of
  reactions must go through that adapter: coordinate, do not duplicate.
- Placement gap: resident navigation rejects points outside `site_ring`. Westcreek Lane is outside
  it; the service-lane zone is inside, but the nearest resident stop (Vince) is 62 m away. Adding
  residents would change the checkpointed resident count (restore requires the same count).
  Decision needed before increment 3 can make reactions visible in the encounter: which zone hosts
  the milestone, and whether resident routes or stops may change there.

## Presentation constraint

`scripts/lib/bake-provenance.mjs` hashes `avatars.js`, `foot-placement.js`, `upper-body-gait.js`,
`resident-gestures.js` and other avatar modules as garment bake inputs. Combat poses must not edit
them (that would invalidate the bakes); they are a separate procedural layer applied by
`player-avatar.js` / `remote-players.js` after `avatar.update()`, using the rig's bones and axes.
Directional combat movement uses #637's `heading` (travel) with the body facing the opponent.

## Results

### Increment 1: server melee phases (uncommitted candidate, base `e17fd94d`)

Implemented by a forked session test-first (it stopped on an authentication error after the
server suite; this session reviewed and continued its work). Evidence in `.runtime/evidence-640/`.

- **First failure** (`increment1-first-failure.txt`): the new and updated crime tests against the
  instant-hit resolver: 16 of 33 failed (timed contact, contact recheck, cancellation, retry across a
  restore, counters, evades, participants, checkpoints, transport, writer replacement), 2 skipped
  (Redis); crime-ui/town-snapshot 2 of 9 failed.
- **Change:** `server/crime.js` (timed actions, contact recheck incl. a ±60° arc fixed at admission,
  rival counter, evade window, participants, cancel/release, v17 state), `server/world.js` (attack
  reply is the admitted windup, `evade` command, `crime.cancel` on emergency off and policy update,
  `crime.release` on leave, down hold, checkpoint v17, region migration cancels pending actions),
  `server/redis-room.js` (writer generation 21/22), `server/avatar-preferences.js` (accepts v17),
  `preview/src/town-snapshot.js` (validates `crime.actions`), `preview/src/crime-ui.js` (outcomes
  from the snapshot, telegraph text, Evade button and U key), version expectations in 16 server test
  files (16 → 17), `docs/crime.md`, and `preview/e2e/crime-shared.js` (windup before contact,
  evade timed against the town's remaining windup, retried over up to three counters).
- **Core gate** (`verify-core-1.txt`): passed. Tooling 233/233; preview 4017, 4016 pass, 1 existing
  skip; server 1118, 895 pass, 223 Redis skips; desktop 118, 115 pass, 3 skips; build, Python, secrets.
- **Isolated Redis** (own `redis-server`, no persistence, random test namespaces): crime, phases,
  transport, police-world, world-policy transport, redis-room: 57/57, 0 skips
  (`increment1-redis-focused-2.txt`). An earlier fork run failed once in
  `crime-transport.test.js:81` (`landed.action` undefined on an `ok` reply, `increment1-redis-focused.txt`);
  it did not reproduce in 11 later runs on the current source (3 by the fork, 8 here with the reply
  logged). Cause not established; kept as an open item.
- **Independent review (fresh context):** no double damage/star/down, no client-forgeable timing,
  target or evade. Found and fixed: voluntary surrender cancelled a telegraphed counter at no cost
  (now only police capture cancels it; a held attacker's own strike lands nothing); a snapshot could
  report an unresolved contact as `done` with no outcome, which the client rejects (reconnect loop);
  restore landed contacts it slept through, kept future participant timers and stale health on
  non-participants; the HUD kept warning about a cancelled counter and announced only the newest
  action; an overstated emergency-off comment; a transport assertion that passed when the action
  was missing. Regressions added for each server finding.

### Increment 2: police perception, cooldown under watch, resisted capture

- **First failure** (`increment2-first-failure.txt`, on the increment 1 candidate): 7 of 9 failed;
  the world-level check showed a wanted player in plain view of police losing the star after 30 s
  (expected 1, got 0). The 2 passing tests are guards main satisfies trivially (no cone, no grabs).
- **Design change found while testing:** grabbing every wanted player on contact ended every rival
  fight within about 3 s (the post is 4 m from the rival) and broke #598's readable stand-off. The
  issue's wording is narrower ("an active crime participant who refuses to surrender"), so grabs
  need participation and a 4 s surrender offer in contact first. Officers keep attention on a target
  they see while routing (a cone with path-facing made them give up around walls).
- **Existing tests changed to the new contract, with reasons:** `crime.test.js` star decay now
  leaves the zone first (watched stars no longer cool); `crime-phases.test.js` lapse uses a missed
  strike (a participant without stars, so no capture).
- Focused suites with isolated Redis (police, crime, phases, transport, world-policy, HUD,
  snapshot): 87/87, 0 skips. Core gate `verify-core-2.txt` passed. Journeys on this tree (hashes in
  the run log): `crime-shared` passed (27 checks: windup before contact, hit, a timed evade of the
  counter, police, keyboard surrender, arrest, phone layout) and #599's `world-rules-shared` passed
  (12 checks), Chromium on Apple M5 Max (ANGLE Metal).
- **Increment 2 review (fresh context):** found and fixed: a second officer could release another
  officer's landed grab (subdued is now owned by the grabbing officer); a restored grab landed after
  any outage (now called off past 250 ms, future timers clamped); offer-then-resume escaped a landed
  grab and the HUD left those buttons enabled; a held player could stay held if the grabber stood
  between grab reach and arrest range (the grabber now arrests from grab reach); validation accepted
  a subdued player with no officer and v17 state in a v16 envelope; participation and height were not
  rechecked at grab contact; an evade could be pruned before a late police step. Tests added for
  each, and the world test now asserts the cool-off half.
- **Rebased onto current main** `1cb9a475` (no commits existed yet; work re-applied by a temporary
  local commit and rebase, backup patch in the session scratchpad). On the new base the v16 checkpoint
  test needed a v16 police section; older envelopes accept an untouched v17 police section, as crime
  does. Focused suites with isolated Redis incl. redis-room and main's corner-elbow test: 116/116.

## Gaps and next step

Next: failing tests for timed contact, contact recheck, cancellation and exactly-once retry.
