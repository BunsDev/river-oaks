# Crime: the first criminal action

Issue [#597](https://github.com/BunsDev/river-oaks/issues/597) adds one criminal action, a melee
attack, with visible consequences: the target loses health and the attacker gains wanted stars.
It happens only where the [world rules](world-policy.md) allow, which they don't by default.
`server/crime.js` is a narrow resolver. It has no inventory, weapons, ballistics, loot, criminal
record or economy. Police ([#598](https://github.com/BunsDev/river-oaks/issues/598)) come later.

## Who can be attacked

- **Authored rivals** (`CRIME_TARGETS`), one standing in each River Oaks danger zone: the
  Westcreek rival (−2908, −1320) and the service lane rival (−2800, −1440). These are the only
  eligible targets.
- **Residents** are always protected (`protected_target`).
- **Players** need PvP from the owner *and* the target's consent. Nobody can give consent yet, so
  player attacks are refused (`pvp_off` or `pvp_consent_required`).

## The command

```js
{ type: 'attack', targetId: 'rival:westcreek', attackKind: 'melee', attackId: 'a1b2c3d4' }
```

The attacker is the authenticated session. The target, its position, damage, health and stars
are the town's. Any other field (damage, health, stars, severity, identity, position) is
refused as `invalid_attack`, as is any `attackKind` but `melee`. `attackId` is optional
(8–64 of `A–Z a–z 0–9 _ -`).

The checks, in order: a valid message; a replay of a landed `attackId`; the attacker on foot on
the street (not seated, riding, flying, performing or upstairs); the target known and eligible;
the target not already down; the world rule from the town's positions and clock (zone, hours,
safe ground, boundaries, PvP); arm's reach (1.6 m), height (0.6 m), the same room and a clear
line at chest height, so walls and doors block; and a 0.9 s cooldown. The ordinary command
budget, office and upper-floor gates apply first.

A landed hit is **one transition**: −25 health, +1 star (at most 5), a 0.6 s `shove` gesture on
the attacker and a short stagger on the rival. All of it is in the next snapshot for every client.

## Exactly once

- **Retries:** a repeated `attackId` returns the hit it already landed, marked `replayed`, and
  changes nothing. Receipts are kept per attacker for 60 s (at most 16) and checkpointed, so a
  retry after a reconnect, another gateway or a writer replacement still lands once. Refusals
  change nothing and are not kept, so an ID refused while the town was peaceful can land later.
- **Writers:** Redis commands commit under the fenced lease with their replies, so a replaced
  writer neither loses nor repeats a queued attack.

## Health, recovery and stars

- Rivals have 100 health. At 0 they are incapacitated (`target_incapacitated`) and never die. 20 s
  after their last hit they are whole again, whether hurt or down. Recovery is applied before
  every decision, so it doesn't depend on step timing.
- Each landed hit sets the attacker's stars to `min(5, stars + 1)` and restarts their quiet
  period. Every full 30 s of quiet removes one star, exactly, however the town steps.
- Snapshots carry `crime.targets` (health, `incapacitated`, `staggered`) and `crime.wanted`
  (`[userId, stars]`). Cooldowns, receipts and quiet-period timing stay private.

## Storage

Checkpoint **version 15** holds rivals' health and hit times, wanted levels, cooldowns and
receipts. Older checkpoints restore with no crime. An untouched section is accepted in an older
version; anything else is refused there. Region migration keeps wanted levels and receipts and
starts rivals fresh. Redis writers are `v17:`/`v18:`.

## What players see

- **Rivals** are drawn with the remote-player renderer from `crime.targets`, with a name label.
  When hit they flinch (`stagger`); while down they are bowed over, winded (`down`), labelled
  "· down". The attacker's `shove` is an arm-forward strike. `crime-poses.js` maps these to existing
  gesture poses (`throw-release`, `startled`, `bow`), so no new animation, asset or audio is added
  and the garment bakes, which hash `resident-gestures.js`, stay valid. Non-graphic; reduced motion
  keeps the rest pose, and the HUD text carries the meaning.
- **The crime HUD** (`preview/src/crime-ui.js`) appears near a rival or while you are wanted. It
  shows the rival's name, a labelled health progress bar, whether they are down, the risk where you
  stand, and wanted stars with a spoken label ("Wanted level: 2 of 5 stars"). In an active danger
  zone it offers **Shove … (T)**. Anywhere else it says "Peaceful here. Nobody can be harmed." and
  offers nothing.
- A hit is confirmed only from the town's reply ("Hit landed. Westcreek rival has 75 health left.
  Wanted level 1 of 5."), announced politely. Refusals use the town's own message. Health on screen
  always comes from the latest snapshot; nothing is predicted. A lost reply is retried once with
  the same attack ID.

## Tests

`server/tests/crime.test.js` covers rules, refusals without mutation, forgery and fuzz, reach, a
real wall, cooldown, recovery, star clamp and decay, and checkpoints.
`server/tests/crime-transport.test.js` covers two clients on two gateways, retries, a reconnect and
writer replacement. `preview/tests/crime-ui.test.js` covers the HUD's copy, reach and poses, and
`preview/tests/town-snapshot.test.js` the snapshot validation. The development-shard journey
`crime-shared` runs two browsers. The owner enables danger, the visitor shoves with T, a mutation
trace proves the health bar only ever shows the town's value, the owner's browser sees the same
hit and star, and after emergency off there is no shove and T changes nothing.
