# Crime: the first criminal action

Issue [#597](https://github.com/BunsDev/river-oaks/issues/597) adds one criminal action, a melee attack, with visible consequences: the target loses health and the attacker gains wanted stars. It happens only where the [world rules](world-policy.md) allow, which they don't by default. `server/crime.js` is a narrow resolver. It has no inventory, weapons, ballistics, loot, criminal record or economy. Police pursuit and capture are described below.

## Who can be attacked

- **Authored rivals** (`CRIME_TARGETS`), one standing in each River Oaks danger zone: the Westcreek rival (−2908, −1320) and the service lane rival (−2800, −1440). These are the only eligible targets.
- **Residents** are always protected (`protected_target`).
- **Players** need PvP from the owner *and* the target's consent. Nobody can give consent yet, so player attacks are refused (`pvp_off` or `pvp_consent_required`).

## The command

```js
{ type: 'attack', targetId: 'rival:westcreek', attackKind: 'melee', attackId: 'a1b2c3d4' }
```

The attacker is the authenticated session. The target, its position, damage, health and stars are the town's. Any other field (damage, health, stars, severity, identity, position) is refused as `invalid_attack`, as is any `attackKind` but `melee`. `attackId` is optional (8–64 of `A–Z a–z 0–9 _ -`).

The admission checks, in order: a valid message; a replay of an `attackId` the town already started; the attacker on foot on the street (not seated, riding, flying, performing or upstairs); the target known and eligible; the attacker not staggered or down; the target not already down; the world rule from the town's positions and clock (zone, hours, safe ground, boundaries, PvP); arm's reach (1.6 m), height (0.6 m), the same room and a clear line at chest height, so walls and doors block; and a 0.9 s cooldown. The ordinary command budget, office and upper-floor gates apply first.

## Timed melee (#640)

An admitted strike is an **action**, not a hit. The reply is `{ ok: true, action }` with the action in `windup`; it never confirms damage. Proposed tuning, to be playtested:

| Action | Windup | Contact | Ends | Reach / arc | Effect |
| --- | --- | --- | --- | --- | --- |
| Player strike | 300 ms | at 300 ms | 900 ms (the cooldown) | 1.6 m, height 0.6 m, ±60°, same room, sight | −25 rival health, +1 star |
| Rival counter | 750 ms telegraph | at 750 ms | 1500 ms | 1.6 m, ±60° | −20 participant health, 600 ms stagger |
| Evade | — | window 0–350 ms | cooldown 800 ms | — | contacts against the evader miss |

- **Contact** (the crime step, and before any attack, evade or rule change) rechecks everything from the town's state at that moment: the attacker still on foot at street level and not knocked off balance, the target not down, the world rule, reach, height, room, sight, and the **arc**. A strike's direction is fixed at admission toward where the rival stood; contact needs the rival still within ±60° of it from where the attacker stands now. Stepping out of reach or out of the arc misses (`attack_out_of_reach`, `attack_out_of_arc`); a refusal by the rule (safe ground, zone, hours, policy) cancels. Only a hit changes health and stars; the star and the quiet period count from the contact.
- **Cancellation:** emergency off and every rule change cancel all pending contacts at once (`violence_off`, `policy_changed`); emergency off also ends every participation. A departing session's actions are cancelled (`attacker_left`). Earned stars stay.
- **Participants:** an admitted strike in an active zone makes a player a participant, with `health` 100 on the player record (the field police capture already reads; it is public in `players[].health` and stays at 100 afterwards). A counter that reaches 0 leaves the participant **down**: poses and other commands are refused (`incapacitated`; chat stays open) for at most 8 s, after which they get up whole. Health also recovers 20 s after the last damage. Participation ends with full health on arrest, emergency off, leaving the danger zone (or street level, or getting into a seat or vehicle), departure, or 30 s without engagement.
- **Rival response:** a struck, conscious rival faces its last attacker (`targets[].engagedId`, `targets[].yaw`). After its stagger (0.7 s from the hit) and at most one counter per 2.5 s, it telegraphs one counter if that participant is still within 3 m, on foot, in the zone and not held by police; otherwise it lets them go. It stays on its authored spot. Only its engaged participant can be hit; a bystander in the swing never is. A hit while winding up does not cancel its counter; going down does. A participant hit during their own windup misses (`staggered`).
- **Evade:** `{ type: 'evade', direction?: 'left'|'right'|'back', evadeId? }` opens a 350 ms window for a participant or wanted player on foot in an active zone (`evade_unavailable` otherwise; `staggered`, `incapacitated`, `evade_cooldown`). A counter whose contact falls in the window resolves as `evaded`. The client moves the body within its normal movement budget; the town only times the window. A repeated `evadeId` replays without extending it.
- **Snapshots:** `crime.actions[]` holds each action in progress and each finished one for 1.5 s: `id` (`strike:n` / `counter:n`, the town's own, never the private `attackId`), `kind`, `actorId`, `targetId`, `phase` (`windup`, `contact` for 120 ms from contact, `recovery`, `done`), `remainingMs` in that phase, `outcome` (`null`, `hit`, `miss`, `cancelled`, `evaded`), `reason`, `direction` (`[east, north]` unit vector) and, for a hit, `effect` (strike: `damage`, `health`, `incapacitated`, `stars`; counter: `damage`, `health`, `down`). A late snapshot shows the current phase; nothing replays.

## Exactly once

- **Retries:** a repeated `attackId` returns the action it already started, as it stands now (phase and outcome), marked `replayed`, and changes nothing: it is never restarted, re-timed or landed twice, including after it was cancelled. Receipts are kept per attacker for 60 s (at most 16) and checkpointed with their actions, so a retry after a reconnect, another gateway or a writer replacement still lands at most once. Receipts from a v15/v16 town hold the instant hit they landed and still replay it. Refusals change nothing and are not kept, so an ID refused while the town was peaceful can start later.
- **Writers:** Redis commands commit under the fenced lease with their replies, so a replaced writer neither loses nor repeats a queued attack. A pending action is part of the checkpoint; the replacement resolves its contact exactly once, and a resolved contact is never resolved again.

## Health, recovery and stars

- Rivals have 100 health. At 0 they are incapacitated (`target_incapacitated`) and never die. 20 s after their last hit they are whole again, whether hurt or down. Recovery is applied before every decision, so it doesn't depend on step timing.
- Each landed hit sets the attacker's stars to `min(5, stars + 1)` and restarts their quiet period. Every full 30 s of quiet removes one star, exactly, however the town steps.
- Snapshots carry `crime.targets` (health, `incapacitated`, `staggered`) and `crime.wanted` (`[userId, stars]`). Cooldowns, receipts and quiet-period timing stay private.

## Storage

Checkpoint **version 15** holds rivals' health and hit times, wanted levels, cooldowns and receipts. Older checkpoints restore with no crime. An untouched section is accepted in an older version; anything else is refused there. **Version 17** (#640) adds rivals' engagement and last counter, actions (with their absolute times, outcome and effect), participants' timers (health stays on the player record and must agree: a down participant has 0), evade windows with their receipts, and the action sequence. v15/v16 sections restore with no actions or participants; a v17 section cannot ride in an older envelope. Region migration keeps wanted levels, receipts and finished actions, cancels pending ones (`region_changed`), ends participation and starts rivals fresh. Redis writers are `v17:`/`v18:` for v15, `v19:`/`v20:` for v16 and `v21:`/`v22:` for v17.

## What players see

- **Rivals** are drawn with the remote-player renderer from `crime.targets`, with a name label. When hit they flinch (`stagger`); while down they are bowed over, winded (`down`), labelled "· down". The attacker's `shove` is an arm-forward strike. `crime-poses.js` maps these to existing gesture poses (`throw-release`, `startled`, `bow`), so no new animation, asset or audio is added and the garment bakes, which hash `resident-gestures.js`, stay valid. Non-graphic; reduced motion keeps the rest pose, and the HUD text carries the meaning.
- **The crime HUD** (`preview/src/crime-ui.js`) appears near a rival or while you are wanted. It shows the rival's name, a labelled health progress bar, whether they are down, the risk where you stand, and wanted stars with a spoken label ("Wanted level: 2 of 5 stars"). In an active danger zone it offers **Shove … (T)**. Anywhere else it says "Peaceful here. Nobody can be harmed." and offers nothing.
- A strike's reply is announced as "Winding up…". The hit is confirmed only from the snapshot's action outcome at contact ("Hit landed. Westcreek rival has 75 health left. Wanted level 1 of 5."), as are misses and cancellations, announced politely, each event once. A rival's telegraph is announced in text ("Westcreek rival is winding up to strike back. Evade with U."), then its outcome. **Evade (U)** is a keyboard and touch button offered in an active danger zone while you are wanted or in a fight. Refusals use the town's own message. Health on screen always comes from the latest snapshot; nothing is predicted. A lost reply is retried once with the same attack or evade ID. Dedicated strike, evade, flinch and down poses are #640's presentation increment; until then the existing reused poses stand in.

## Tests

`server/tests/crime-phases.test.js` (#640) covers timed contact, the contact recheck (reach, arc, rule, safe ground), cancellation, exactly-once retries across restore and writer replacement, the rival's counter and evade, participant health, the down hold and every recovery, departure, and v17/v16 checkpoints. `server/tests/crime.test.js` covers rules, refusals without mutation, forgery and fuzz, reach, a real wall, cooldown, recovery, star clamp and decay, and checkpoints. `server/tests/crime-transport.test.js` covers two clients on two gateways, retries, a reconnect and writer replacement. `preview/tests/crime-ui.test.js` covers the HUD's copy, reach and poses, and `preview/tests/town-snapshot.test.js` the snapshot validation. The development-shard journey `crime-shared` runs two browsers. The owner enables danger, the visitor shoves with T, a mutation trace proves the health bar only ever shows the town's value, the owner's browser sees the same hit and star, and after emergency off there is no shove and T changes nothing.

## Police pursuit and capture (#598)

The town owns at most six foot officers. Stable `police:0` through `police:5` slots originate at authored street posts, validated by the existing resident navigation. Police navigation uses the full physical walking area, including the public lane outside the resident site ring; the existing grid bound, terrain and collision checks remain in force for live and restored officers. Each wanted account receives one response before higher wanted levels add units (one officer per two stars, rounded up, at most three per account). Account ordering and response rotation are deterministic; when more than six accounts are eligible, twelve-second response turns prevent permanent starvation. Peaceful players are never targets.

Officers acquire a target only within 35 metres and a clear chest-height sight line. They move at 3.4 metres per second on the existing navigation with roads allowed and stop 1.25 metres from a visible target, within arrest reach without walking into the player. A director tick permits at most one route search, with at least one second between replans per officer; every actual movement segment rechecks collision, including placed objects. Positions and routes use east/north metres, with source elevation as the third component.

A visible target updates the last-seen position. After sight loss, an officer searches that position for at most eight seconds; hidden positions never update the search route. Search timeout, zero stars, disconnect, leaving an active danger zone, entering an interior or upper level, sitting, riding, flight, or a policy shutdown cancels pursuit and capture. Officers return to their posts and despawn on arrival, or after fifteen seconds if blocked. The policy command and disconnect path cancel immediately, without waiting for the next simulation tick. Wanted stars retain #597's existing quiet-time decay.

`{type:'surrender'}` (or `action:'offer'`) refers only to the authenticated account. Extra identity/position fields are rejected. While surrendered, movement and other gameplay actions are blocked; chat remains available. `{type:'surrender',action:'resume'}` withdraws surrender before arrest begins. An officer needs clear sight and a distance of at most 1.5 metres to start arrest, then holds a 1.4-second server-owned transition. Capture clears stars once, recovers any authoritative player health to 100, releases interactions and returns the player to the existing collision-validated arrival spawn. PvP has no consent or player-damage path in #597, so player incapacitation is not ordinarily reachable; the director also accepts authoritative zero health as capture eligibility, without adding another damage system.

Public snapshots add `police.units` (`id`, `position`, `yaw`, `targetId`, `state`) , `police.surrendered` (account IDs), and `police.eligible` (accounts currently permitted to surrender). The HUD uses that eligibility directly, so safe-ground, peaceful and disconnected states do not offer an action the server would refuse. States are `pursue`, `search`, `arrest`, and `return`. Checkpoint version **16** also persists last-seen positions, post locations, transition times and allocation cursor. Existing version 15 checkpoints restore with empty police state; incompatible writers are fenced by Redis writer generations **19/20**. Routes are bounded disposable caches regenerated from current geometry after restore. Region migration preserves wanted stars and attack receipts while clearing geography-dependent patrol state.

The existing remote-player renderer draws officers with the shipped Sable human rig and authored midnight palette, labelled with their current state. The crime HUD describes pursuit, last-seen search, surrender and arrest in text and live announcements; it provides keyboard-accessible Surrender and Resume moving controls. A server-confirmed surrender action uses the existing optional game-sound tap, unlocked in the user gesture and released on disposal. Shared game sound preferences apply. No siren, new audio file, new rig or audio-only information is introduced. Reduced-motion players receive the same authoritative text and actions.

Focused director tests cover real obstacle routing, last-seen search, caps, fairness, a shared route-search budget, incapacity, surrender, checkpoint validation and restore. World tests cover the mapped street, movement holds, safe arrival, immediate cancellation and atomic rejection. Real WebSocket tests exercise two clients, Redis coordinator replacement during arrest, and repeated surrender after completion. The `crime-shared` browser journey additionally checks the replicated palette/figure, keyboard surrender with reduced motion, peer-visible arrest, safe arrival and phone layouts. Actual results and unverified scope belong in the task ledger; test descriptions here are not acceptance receipts.

A local 32-player comparison on the verified police implementation observed six officers maximum. With identical wanted/player positions, warm world-step main-thread CPU p95 was 7.229 ms with policy off and 7.360 ms with police enabled; snapshot JSON grew from 72191 to 73448 bytes. The fixture records 20 cold and 140 warm samples per world. These are short local simulation measurements; hosted/network load, long-duration stability and target-device rendering acceptance belong to the broader release gate. Exact source hashes, samples and verification scopes are recorded in the task ledger.

## Perception, cooldown under watch and resisted capture (#640)

Values are proposed tuning to playtest, not approved budgets (`POLICE_RULES`).

- **Sight.** An officer sees within 35 m, ±2 m height, along a clear chest-height line, and within a 140° field of view around its attention direction; within 3 m (close contact) it notices anyone with a clear line. A dispatch post still sees all round. An officer watching its target keeps its attention on it while it moves; otherwise it looks where it goes, faces its target at stand-off, and sweeps 90°/s while searching the last-seen point. The rendered body faces its travel either way.
- **Cooldown under watch.** Every step in which an officer sees its target calls `crime.observe`, which moves that account's quiet period start to now. The existing 30 s per-star decay therefore runs only from the end of observation: no second wanted clock, no new checkpoint field. Concealment (no line, out of view, out of range) lets the stars cool off as before.
- **Resisted capture.** In contact (1.5 m) with a wanted player who is an active crime participant (`crime.participating`), an officer offers surrender for 4 s (the HUD says so). If the player does not surrender, it telegraphs a grab for 0.9 s (state `grab`, `remainingMs`, direction fixed at the start). At contact it rechecks eligibility (through the zone rule), participation, its own sight, reach 1.6 m, height 0.6 m, a ±60° arc and the player's evade window: an evade (U), stepping away or out of the arc misses, and the officer recovers for 2 s. A grab that lands marks the player `subdued` by that officer, which arrests from where it holds them (grab reach) through the existing 1.4 s arrest and its movement hold. Only that officer's arrest, release or stand-down ends the hold; another officer losing sight does not, and offering then withdrawing surrender does not. Wanted players who are not fighting, surrendered players and peaceful bystanders are never grabbed.
- **Cancellation.** Policy off, safe ground, leaving the zone, disconnect and sight loss cancel a grab or a grab-started arrest at once and release the hold; earned stars stay. Voluntary surrender does not cancel a rival's counter already telegraphed (only an evade beats it); police taking hold of the player (`captured`) does.
- **State.** Checkpoint v17 adds `police.subdued` (`[player, officer]`, the officer still on them) and, per unit, `grabDirection`, `recoverUntil` and `closeSince`; v16 police state restores with none, and an older envelope accepts only an untouched section. A restored town calls off a grab more than 250 ms overdue and brings timers left in the future back to now, as crime does for contacts. Snapshots add `police.subdued` and `remainingMs` on a `grab` unit.
- **Tests.** `server/tests/police-capture.test.js` covers the field of view and close contact, the search sweep, observation, the telegraphed grab and arrest hand-over, every way to avoid it, cancellation and hold release, bystanders, and v17/v16 state; it also checks in a real town that a watched wanted player keeps their stars.

## Residents react (#640 increment 3)

The street responds, and the town decides how. Residents stay protected targets; none is added or removed. Values are proposed tuning to playtest (`REACTION_RULES` in `preview/src/resident-life.js`).

- **Alarms.** After each step the town tells the resident simulation about a strike or counter that resolved at contact (hit, miss or evaded, at the actor's position), an officer's grab or arrest beginning, and any wanted player on foot at street level (checked every 250 ms). Alarms are not checkpointed: a restored or reset town raises none for a fight it slept through (pending contacts and police alarms are dropped on load, reset and restore), except an action still pending at contact, which resolves on the next step. A contact by an airborne actor raises no alarm, as the wanted scan skips airborne players.
- **Perception.** Outdoor, non-stationary residents at street level within 20 m of the alarm (6 m of a wanted player), within 1.8 m of its height, with a clear chest-height sight line (the police `sight` rule). Nearest first; at most six residents react at once; a resident reacts at most once per 10 s. A resident held by a conversation, a wish, a volunteer visit or a wait for help they asked for keeps it and uses no reaction slot.
- **Reaction.** `startle` for 1 s: the resident stops where they stand and turns to face the trouble. Then `flee` for 6 s: a routed walk, at about twice the usual pace, to clear ground off the roadway 12–18 m from the alarm (4 m beyond where they stood when that is farther), away from it first and never nearer to it than they were, using the simulation's one bounded route search per step. With no such ground or no route, `cower` in place for 5 s instead. Afterwards a short rest and the usual routine; a flight changes no anchor. A storm overrides a reaction as it does everything else and none starts during one; a resident the visitor engages mid-reaction drops it and keeps the cool-off.
- **State.** `life.reaction = { kind, from, until }` and `life.reactionCooldownUntil` on the resident's motion record ride in the checkpoint with the rest of resident life. They raise the checkpoint to **version 18** (writer generation `v23:`/`v24:` in `server/redis-room.js`): a v17 writer restores them but keeps walking to the flee destination with a stale reaction and writes both back, so it must be fenced. v17 rooms restore with no reactions and are written forward as v18. Restore validates them: none on an indoor or stationary resident, and timers left in the future come back to now. Snapshots carry `locals[].life.reaction` (`startle`, `flee`, `cower` or `null`) and the statuses `startled`, `fleeing` and `cowering`.
- **What players see.** `preview/src/resident-figures.js` draws the eight nearest outdoor residents within 120 m as remote-player figures (ids `resident:<id>`, shipped human looks chosen by id). A startled resident shows the existing `startled` pose and a cowering one bends over (`bow`), both through `crime-poses.js`; a fleeing resident simply runs, and a startled or cowering one faces the trouble as the town turned them. The set keeps a drawn resident until another is 5 m nearer or they pass 130 m, so it does not flicker at the cut. Reduced motion keeps the rest pose. The development-shard journey `crime-residents` runs two browsers: a wanted visitor walks up to the nearest outdoor resident, who startles and runs in the town's state and on both screens.
- **Tests.** `server/tests/resident-reactions.test.js` covers the strike, the cap and nearest-first order, the cool-off, a wanted player at arm's length against a peaceful one and a held resident, police taking hold, checkpoint and restore with a forged reaction refused, and the public snapshot. `preview/tests/resident-reactions.test.js` covers the rule alone (range, sight, cap, storm, flight ground that is never nearer, a visitor's hold, cower); `preview/tests/volunteer-visits.test.js` that a reacting resident is not drafted as a helper; and `preview/tests/resident-figures.test.js` the figures.

## How a fight looks (#640 increment 4)

Presentation only, in `preview/src/combat-motion.js`: the town decides every phase; the client reads the snapshot and shows it. Timings mirror the proposed tuning in `CRIME_RULES` and `POLICE_RULES` (a test keeps them equal) and remain proposed tuning.

- **State from the snapshot.** `combatStateFor(id, snapshot)` turns an action's phase and remaining time into `{ kind, progress, durationMs, facing }`: `strike`, `counter`, `evade` (this client's admitted evade), `flinch` (a landed hit, timed from contact), `down`, `grab`, `arrest`, `surrender`, or `kind: null` with a facing for a figure that is engaged between actions. A late snapshot advances to the current phase; nothing ever replays an earlier one, and a finished or cancelled action shows nothing. `combatFocusFor` names the opponent: the officer reaching for a player first, else the rival they fight.
- **Facing.** Engaged figures turn their body toward the opponent at a bounded rate (`COMBAT_TURN_RATE`, then an exponential settle, refresh-rate independent) while the feet keep the travel heading from the locomotion handoff (#637), so strafing and backpedalling step along travel. Seated, riding or flying figures never turn. Rivals face the player the town engaged them with; officers face their target.
- **Pose layer.** `applyCombatPose` multiplies a bounded pose (no bone more than 1.75 rad, feet where they stood) onto the rig after `avatar.update()` has posed it, so garment-bake inputs are untouched. Timed actions start and end on the posed rig; `createCombatBlend` eases a state in and out (240 ms), crossfades a change between at most two layers and never runs an action backwards. Strike: draw back, drive forward at contact. Counter: a raised fist held through the telegraph, then the swing. Evade: lean back, or to the side the town admitted. Flinch: a short recoil. Down: doubled over, winded. Grab: both arms reach. Arrest: hands forward and low. Surrender: hands up.
- **The local player.** The crime HUD publishes `combatState`, `combatFocus` and `telegraph` (`counter` or `grab`) on its element; `player-avatar.js` reads them each frame, faces the focus, layers the pose, and when the town holds the player (down, or surrendered: an arrested or subdued player shows the same hands-up state) releases held keys, walk buttons, the look drag and push-to-talk once. The evade button pulses while a telegraph is up. `#canvas-host[data-combat]` names the shown state for journeys.
- **Other figures.** `main.js` attaches the town's state to every player, rival and officer figure; `remote-players.js` plays it forward from the snapshot's arrival, faces the opponent and layers the pose. A figure the layer poses drops the legacy `shove` / `stagger` / `down` gesture so the two never stack. Keyboard and touch reach the same states: the HUD's buttons and keys send the same messages.
- **Reduced motion.** No swings: strikes, evades and flinches keep the posed rig and the HUD text carries the event. Held states (down, surrender, arrest, a grab's reach) and the counter's telegraph show one static key pose, so a downed or held figure is never shown standing at rest. The blend snaps instead of easing.
- **Tests.** `preview/tests/combat-motion.test.js` (spec adopted from the earlier presentation worktree) covers timing parity, phase reading and late snapshots, facing at 30/60/120 Hz with foot placement, every pose on every shipped rig, bounds and determinism, reduced motion, the blend and the HUD reader; `preview/tests/crime-ui.test.js` the published state; `preview/tests/remote-players.test.js` the figure state and facing. The `crime-shared` journey checks the published strike and the figure state on both screens, the telegraph cue, the admitted evade, surrender holding the figure with inputs cleared, and a clean exit.

## Evidence (#640 increment 5)

Measurements, not budgets: every number below is what one machine produced on one day, bound to
the revisions named, under the load averages recorded in the receipts. Nothing here changes an
acceptance threshold, a budget or a harness default.

### Crime workload, main vs branch (the #599 protocol of 2026-10-24)

`pnpm run audit:crime` (`server/crime-workload.js`, report in `data/reports/crime-workload.json`):
server simulation only (`createSharedWorld` on a synthetic clock, 50 ms steps); every player stands
around the service lane rival at five stars in `south-service-lane` and strikes every simulated
second; the police respond at the six-officer cap; two runs of 20 s per tier after a 2 s warm-up;
the same script on `main` and on the branch, same machine. The town is deterministic, so the two
runs of a tier differ only in timing. What the protocol produces: the rival is down after four
hits and recovers 20 s later, so most strikes miss (`target_incapacitated`); officers arrest the
standing strikers, who are returned to the safe arrival and then strike from outside the zone
(`not_danger_zone`). Step maxima of 70–90 ms are host noise (load averages 29–102 during these
runs; other sessions shared the machine).

main a1fa945a [ 101.97, 51.06, 29.31 ] branch b7df2c6a [ 65.77, 47.16, 28.65 ]
| Head | Players | Step p95 (ms) | Step max (ms) | Snapshot (bytes) | Checkpoint (bytes) | Officers (max) | Strikes admitted / hit / miss |
| --- | --- | --- | --- | --- | --- | --- | --- |
| main (a1fa945a) run 1 | 1 | 1.1 | 86 | 59896 | 141629 | 3 | 4 / 4 / 0 |
| main (a1fa945a) run 2 | 1 | 0.88 | 83.76 | 59896 | 141629 | 3 | 4 / 4 / 0 |
| branch (b7df2c6a) run 1 | 1 | 1.28 | 88.21 | 61464 | 141629 | 3 | 4 / 4 / 0 |
| branch (b7df2c6a) run 2 | 1 | 0.96 | 69.66 | 61464 | 141629 | 3 | 4 / 4 / 0 |
| main (a1fa945a) run 1 | 8 | 1.34 | 83.69 | 62845 | 145761 | 6 | 8 / 4 / 4 |
| main (a1fa945a) run 2 | 8 | 1.41 | 84.81 | 62845 | 145761 | 6 | 8 / 4 / 4 |
| branch (b7df2c6a) run 1 | 8 | 1.09 | 78.21 | 64413 | 145761 | 6 | 8 / 4 / 4 |
| branch (b7df2c6a) run 2 | 8 | 1 | 66.7 | 64413 | 145761 | 6 | 8 / 4 / 4 |
| main (a1fa945a) run 1 | 16 | 1.36 | 92.4 | 67790 | 153715 | 6 | 18 / 6 / 12 |
| main (a1fa945a) run 2 | 16 | 1.16 | 87.89 | 67790 | 153715 | 6 | 18 / 6 / 12 |
| branch (b7df2c6a) run 1 | 16 | 1.29 | 79.16 | 69358 | 153715 | 6 | 18 / 6 / 12 |
| branch (b7df2c6a) run 2 | 16 | 1.36 | 76.2 | 69358 | 153715 | 6 | 18 / 6 / 12 |
| main (a1fa945a) run 1 | 32 | 1.18 | 78.85 | 79119 | 170373 | 6 | 52 / 8 / 42 |
| main (a1fa945a) run 2 | 32 | 1.14 | 82.53 | 79119 | 170373 | 6 | 52 / 8 / 42 |
| branch (b7df2c6a) run 1 | 32 | 1.21 | 73.48 | 80687 | 170373 | 6 | 52 / 8 / 42 |
| branch (b7df2c6a) run 2 | 32 | 1.1 | 73.14 | 80687 | 170373 | 6 | 52 / 8 / 42 |

### Input to pose and contact alignment, 30/60/120 Hz under the proposed network profiles

`RIVER_OAKS_COMBAT_EVIDENCE=<path> node --test preview/tests/combat-timing.test.js`: a simulated
town (the strike phases of `server/crime.js`, a 50 ms loop that broadcasts at most every 200 ms as
`server/app.js` does) and the shipped `combat-motion.js` run the way `crime-ui.js`,
`player-avatar.js`, `main.js` and `remote-players.js` call it, under the #637 profiles (RTT 0/100/
200 ms, one-way jitter ±0/15/40 ms, 0/1/3 % head-of-line stalls of 250/400 ms, seeds 3/11/29).
Milliseconds after the key press, or after the town's contact instant; p50 (min–max) over seeds.
The striker's own figure starts from the first snapshot that carries the admitted action, not from
the reply: the "if started from the reply" column is what that would save (not implemented).

| Profile | Hz | Striker: key → pose shown | …if started from the reply | Striker: contact shown after the town's contact | Other player: key → strike shown | contact shown after the town's contact | rival flinch after the town's contact |
| --- | --- | --- | --- | --- | --- | --- | --- |
| rtt0 (RTT 0 ms, ±0 ms, 0 % stalls of 0 ms) | 30 | 133 (133–133) | 0 (0–0) | 33 (33–33) | 133 (133–133) | 0 (0–0) | 33 (33–33) |
| rtt0 (RTT 0 ms, ±0 ms, 0 % stalls of 0 ms) | 60 | 117 (117–133) | 0 (0–0) | 17 (17–17) | 117 (117–133) | 0 (0–0) | 33 (17–33) |
| rtt0 (RTT 0 ms, ±0 ms, 0 % stalls of 0 ms) | 120 | 117 (108–125) | 0 (0–0) | 8 (8–8) | 117 (108–125) | 0 (0–0) | 25 (17–33) |
| rtt100 (RTT 100 ms, ±15 ms, 1 % stalls of 250 ms) | 30 | 167 (167–200) | 100 (100–133) | 58 (58–58) | 167 (167–167) | 58 (58–58) | 291 (258–291) |
| rtt100 (RTT 100 ms, ±15 ms, 1 % stalls of 250 ms) | 60 | 167 (150–183) | 100 (100–117) | 58 (41–58) | 167 (167–167) | 58 (41–58) | 274 (258–275) |
| rtt100 (RTT 100 ms, ±15 ms, 1 % stalls of 250 ms) | 120 | 158 (150–175) | 100 (92–108) | 49 (41–58) | 158 (158–158) | 49 (41–58) | 266 (249–266) |
| rtt200 (RTT 200 ms, ±40 ms, 3 % stalls of 400 ms) | 30 | 200 (200–233) | 200 (167–233) | 88 (87–121) | 200 (200–200) | 120 (88–121) | 320 (287–321) |
| rtt200 (RTT 200 ms, ±40 ms, 3 % stalls of 400 ms) | 60 | 200 (183–233) | 183 (167–217) | 88 (87–104) | 183 (183–200) | 104 (71–120) | 304 (271–304) |
| rtt200 (RTT 200 ms, ±40 ms, 3 % stalls of 400 ms) | 120 | 200 (175–233) | 183 (167–217) | 79 (71–96) | 183 (183–200) | 96 (71–120) | 295 (271–304) |

What the model says: the striker's pose follows the key by one way plus up to one broadcast
interval plus a frame; the other player's shown contact trails the town's by one way plus jitter
plus a frame (the state is played forward from the snapshot's age); the rival's flinch trails by
more, because it waits for the first snapshot that carries the hit. The pose never leads the town
and never runs backwards (asserted).

### Two-browser capture in the south service lane

`RIVER_OAKS_SHARED_JOURNEY=crime-night RIVER_OAKS_SHARED_REPORT=crime-night-shared.json pnpm run test:shared development` (`preview/e2e/crime-night.js`,
on demand, not in the default journey list): two Chromium pages at 1280×860, both at the latest
authored hour (19:00; the time-of-day control ends there, so a night sky is not yet authored), the
visitor strikes with T and evades the rival's counter with U while the owner watches from a few
metres east. Each page stamps on its own clock when the key went down, when its figure took up
the pose, when the hit arrived and when the other figure's contact and flinch showed; screenshots
at the lane, the strike (the visitor's right after T, the owner's once their page shows it), the telegraph and the
evade go to `output/playwright/crime-night-*.png`.
The receipt's `evidence` carries the stamps. Run 1 on this head (receipt `crime-night-run1-receipt.json` in the worktree's evidence
folder; Apple M5 Max, ANGLE Metal, full rendering; both pages ran at about 28 animation frames per
second over the fight, screenshots included): striker key → HUD published the strike 70 ms, figure
took up the pose 68 ms (the pose and the attribute land in the same frame), hit snapshot 409 ms
(40 ms after the town's contact by the striker's own estimate), counter telegraph 791 ms after the
hit, evade key → lean 109 ms, counter evaded on the first attempt; the other browser showed the
strike 194 ms after the key (16 % into the swing), its contact 37 ms after the town's contact, the
rival's flinch 37 ms after it (the same frame as the hit snapshot) and the counter telegraph 16 ms
after the striker's HUD did. Two things the capture shows that the model does not: the other
browser never showed the evade (the evade window lives only in the evader's reply; the snapshot
carries no evade state for peers, so increment 4 leans the local figure only), and 19:00 renders
with a daylight sky (clear weather keeps the daytime HDR; the hour only lowers and warms the
sun), so a night encounter needs an authored sky and lamps before it can be captured.
Run 2 on the same head (`b7df2c6a` with these files, another session's detached copy, 2026-10-28
08:28Z, receipt `data/reports/crime-night-shared-ae.json` kept out of the commit; same machine and
renderer, about 38 animation frames per second on both pages): striker key → HUD 51 ms, pose
49 ms, hit snapshot 448 ms (99 ms after the town's contact by the striker's estimate), counter
telegraph 633 ms after the hit, evade key → lean 79 ms; the first evade press was late (131 ms of
the window left when it reached the town), the second evaded with 593 ms to spare. The other
browser showed the strike 36 ms after the key (at the start of the swing), its contact 6 ms before
the striker's estimate of the town's contact and 119 ms before the striker's hit snapshot (the two
pages stamp on their own clocks and the owner plays the snapshot forward, so the sign is not a
lead over the town), the flinch 128 ms after the town's contact and in the same frame as its own
hit snapshot, and the counter telegraph 17 ms before the striker's HUD. The evade was again not
shown to the other browser. The 9 checks passed in 18.8 s. The same two pages at 19:00 again
rendered a daylight sky.

### The encounter in one run, three browsers (crime-encounter)

`RIVER_OAKS_SHARED_JOURNEY=crime-encounter RIVER_OAKS_SHARED_REPORT=crime-encounter-shared.json pnpm run test:shared development`
(`preview/e2e/crime-encounter.js`, on demand, not in the default journey list): the owner page sets
the rules; a visitor, whose browser context records video, plays; a witness, also recorded, stands in
the lane in first person and watches the same figures, the peer recording. One run, one candidate,
the south service lane at 19:00, clear weather. The visitor walks (W 2.5 s), sprints (Shift+W 1.8 s),
turns (← 1 s), strafes (D 1.5 s) and backs up (S 1.2 s) 22 m east of the rival while both pages
sample every animation frame (position, yaw, speed, camera, foot contact and IK error from
`__riverCarriage` / `__riverPlayerAttention`, and the visitor's drawn figure from the witness's
`remotes`); then strikes the rival with T, evades its counter with U, steps back, is offered
surrender by the officer, evades the first grab with U and is taken by the next (resisted capture,
safe arrival); walks back, strikes again, alarms the nearest outdoor resident, is drawn back
into pursuit and cut off by **Emergency off**; walks back once more, strikes, sends a duplicate
attack ID three times and a stale evade ID twice through the development command hook, steps back,
has the socket dropped under pursuit (`__riverConnection.drop`), loses window focus with W held,
and surrenders. The receipt's `evidence.rows` carry pass / not-run per row with the numbers; the
videos go to `output/playwright/crime-encounter-video/`.

Run 6 on `aeb95f85` + this journey (2026-10-28 14:36–14:38Z; Apple M5 Max, ANGLE Metal, full
rendering, load about 10–17 with other sessions; 31 checks in 125 s; receipt sha256 `1a8d3f0c…`,
videos `3ff709d0…` visitor and `d108fcdb…` witness, kept out of the commit). Five earlier runs
failed on the harness, never on the town (each log is in the task ledger): a walk window that
overlapped the sprint; a duplicate raw strike sent before the keyboard strike, whose star brought
the officer in before the rival's second counter; a HUD line that is only shown beside a rival;
emergency off pressed before any officer was on the visitor; a travel probe to an unwalkable spot.
Measurements, not budgets:

- **Movement, local figure** (380 frames, frame time p50 35 ms / p95 54 ms with three browsers on
  the host): walk peak 1.65 m/s, 90 % of it 258 ms after the key, stopped 360 ms after release;
  sprint peak 3.2 m/s, 90 % at 243 ms, stopped at 380 ms; a held ← turned the body 91° in 1.0 s;
  strafe 1.65 m/s at 90° to the facing with 0° body turn; backing up 1.65 m/s with 0° body turn;
  worst figure displacement between frames 4.5 m/s and worst camera displacement 8.3 m/s (no
  jumps); of 229 moving frames every one had a foot planted, worst IK error 0.000 m.
- **Movement, as the witness drew it**: the visitor on screen for 311 of 380 frames, 264 moving
  frames with no frozen frame, a foot planted in every one, worst drawn displacement 5.1 m/s.
- **Fight**: strike published by the HUD 351 ms after the key and the pose 358 ms (the figure
  starts from the first snapshot that carries the action; crime-night measured 51 / 49 ms on a
  quieter host, so this is the snapshot cadence under load, see the timing table above); hit
  snapshot 789 ms after the key, 140 ms after the town's contact; counter telegraph 605 ms after
  the hit; evade key → lean 74 ms; the counter was evaded on the first attempt (647 ms left when
  timed). The witness showed the strike 394 ms after the key, its contact 8 ms after the town's
  contact, the rival's flinch 153 ms after it, the counter telegraph 7 ms after the striker's HUD
  and the grab telegraph 34 ms after it; the arrest pose was shown.
- **Capture**: the first grab (850 ms left when timed) was evaded with U and the officer went back
  to pursuit, not subdued; the next grab landed 11.6 s after the first telegraph; the arrest
  returned the visitor 149 m to the safe arrival with full health and no held input or published
  state.
- **Residents**: Ima Hogg startled at 1.2 m from the wanted visitor and ran at 1.83 m/s; the
  witness's town state showed the flight.
- **Emergency off during `pursue`**: no unit on the visitor, nothing subdued, no pending action,
  no held walk key, the visitor walked under their own key, and the one earned star stayed.
- **Exactly once through raw commands**: three sends of one attack ID returned the same action
  (`strike:7`: windup, replayed, replayed with outcome `hit`), one hit, one star; a repeated evade
  ID replayed with no new window (350 → 0 ms remaining).
- **Reconnect under pursuit**: the socket came back in 1103 ms with the same identity and stars
  (3); the officer, having lost the player for that second, was in `search` and the pursuit went on.
- **Focus loss with W held**: 1.60 → 0.00 m/s, no held key left.
- **Voluntary surrender**: hands up on both screens, arrest shown to the witness, safe arrival.
- **Run 10 on the same tree plus two more episodes** (2026-10-28 16:14–16:17Z, 37 checks in
  201 s, frame time p50 37 / p95 55 ms; receipt `data/reports/crime-encounter-shared.json`, videos
  `crime-encounter-run10-{visitor,witness}.webm`, about 200 s each). Every run-6 row again
  (walk 257 / 325 ms, sprint 277 / 361 ms to 90 % and to stop; 228/228 moving frames with a foot
  planted; counter evaded; reconnect 1320 ms; blur 1.61 → 0.00 m/s), then:
  - **Safe-zone transition inside the windup**: T on the keyboard, and 20 ms later the town moved
    the visitor 149 m out of the danger zone by travel; at contact the strike resolved
    `cancelled` / `not_danger_zone`, rival health 100 → 100, stars 0 → 0, no combat framing,
    nothing held.
  - **Stars held under observation**: one star, out of the rival's reach, pursued; **11 grabs
    evaded with U over 36.4 s** while watched (health 100 throughout) and the star stayed; after
    travelling out of the zone the pursuit ended, the star was still there at 15 s and cooled off
    **30.1 s** after leaving (`starDecayMs` 30 s from the last observation).
  - Timing the key: a U pressed a fixed 340 ms before the estimated contact lost a grab under
    load (run 7) and 420 ms before lost a counter on a quiet loop (run 8), because a key reaches
    the town 5–250 ms after the press (the loop can be inside a 100–200 ms route search). The
    journey now sends a command the town refuses at once just as the telegraph appears, measures
    the round trip (1–8 ms in run 10) and presses that far plus 160 ms ahead of the contact. In
    run 10 the first grab after the surrender offer was seen with 86 ms left, too late to time,
    so that row reads not-run while the observation episode evaded eleven.
  - Runs 7–9 failed on the harness (the fixed lead; the town's 1 s travel cooldown refusing the
    step out of the zone and the step back from the rival, so the rival's counters wore the
    visitor down and the officer arrested a downed player); each log is kept.
- **The three rows the encounter could not show, in one run on two world processes
  (crime-takeover, run 6, 2026-10-29 03:18–03:20Z, 25 checks in 115 s)**: `pnpm run
  test:crime:takeover` with `REDIS_URL` naming an isolated Redis runs
  `preview/e2e/crime-takeover-runner.js`: two `server/tests/takeover-world.js` processes (the
  browser fixture's loopback identities on `createWorldGateway`, one Redis namespace) behind a
  plain TCP relay on the Vite town port, so the page, its `/auth`, `/api` and `/multiplayer`
  traffic reach whichever process the relay names. The runner's page is the Jevica fixture owner
  (rules; the one identity that may fly), alice the visitor (recorded,
  `output/playwright/crime-takeover-video/crime-takeover-run6-visitor.webm`), bob the witness.
  Receipt `data/reports/crime-takeover-shared.json`; a copy with hashes under
  `.runtime/evidence-640/crime-takeover-run6-*`.
  - **Search after sight loss, by distance** (the lane is 213 m long; an officer sees 35 m): with
    the officer at stand-off and alice in view, a server travel moved her 85 m east, still inside
    the lane. 290 ms later the officer was in `search`, standing within 0.6 m of the spot she was
    last seen on (0 m at its nearest) and 85 m from her, turning on the spot for 7.9 s with her
    star kept, then `return`; back within 35 m she was seen and pursued again to 2.2 m. Runs 2
    and 3 showed the rule's other side: an officer still walking to the strike spot, facing
    away, had never seen her at the new spot and searched the strike spot instead, standing on it
    and sweeping at the 90°/s rate; the journey had mis-read that as the last-seen point. The
    server-only probe `.runtime/evidence-640/search-probe.mjs` reaches the spot in 2 s in both
    timings.
  - **Writer takeover mid-pursuit**: wanted and pursued 25 m from the officer, alice sent one
    evade id to world A; A was killed with SIGKILL (gone in 12 ms) and the relay switched to B.
    The visitor, witness and owner pages reconnected through it in 5.6, 6.1 and 5.4 s with the
    same identities, her position (0 m drift), one star, rival health 50, her health 100 and the
    rules still on; B held a new lease; the officer came back `pursue`, read `search` for a moment
    and was `pursue` again 2.5 s later. The same evade id sent to B replied `replayed` with the
    window spent: the action had been committed and carried over in the checkpoint. The witness
    still drew her and the officer; the surrender offer, keyboard surrender, arrest and safe
    recovery, and the owner's emergency off, all went through B.
  - **Altitude inside the windup**: the owner pressed B (take-off) and 150 ms later the raw
    attack went while the local figure was 0.11 m up; the town accepted it on its last pose, on
    the ground (110 ms reply), and at contact found the attacker airborne: `miss` /
    `attack_on_foot`, rival health 100 → 100, no star. Run 5, the same sequence under a 209–378 ms
    loop, landed two of three: the airborne pose reached the town after the contact, because
    flight poses are acknowledged one at a time (`multiplayer-client.js`), and the town struck
    from the last pose it had. That is contact resolved on the authoritative pose, recorded as a
    finding for the lane rather than a rule violation.
  - Runs 1–5 failed on the harness (public units carry no last-seen field; the last-seen spot
    mis-read; a grab landing before the far step; the strike looked up by a field public actions
    do not carry); each log and receipt is under `.runtime/evidence-640/crime-takeover-run{1..5}-*`.
  - Escape by concealment still has no browser row, and on `e09ed8d5` it cannot have one with the
    authored zones (server-only probes of 2026-10-29, `.runtime/evidence-640/conceal/`): a 2 m grid
    inside both danger zones has no blocked point, and none of 26,848 sampled chest-height sight
    lines within 35 m is blocked (westcreek-lane 8,317 pairs, south-service-lane 18,531). The
    nearest free spot hidden from an officer standing in the lane is the alley at (-2799, -1414),
    behind the corner at (-2802, -1422), which is north of the lane's edge (-1425): staged in the
    shared world, the visitor stepping there left the zone, so the officer returned at once (an
    officer only keeps a target that is wanted inside a danger zone) and despawned 0.35 s later.
    A hiding place therefore needs a content decision (a sight-blocking prop inside the lane, or a
    zone that includes the alley), not a runtime change; `server/tests/police.test.js` and
    `police-capture.test.js` cover the concealment geometry rule itself.