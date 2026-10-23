# World rules: the shared clock and danger zones

Issue [#596](https://github.com/BunsDev/river-oaks/issues/596) makes danger an explicit world rule.
The town decides it; nothing a browser sends or shows can change it. The rule ships **off**: a
new or upgraded town is as peaceful as before. The crime work that uses it is
[#597](https://github.com/BunsDev/river-oaks/issues/597) (attacks, harm and wanted stars; see [crime](crime.md)),
[#598](https://github.com/BunsDev/river-oaks/issues/598) (police) and
[#599](https://github.com/BunsDev/river-oaks/issues/599) (release safety). Turning the rule on lets
players attack the authored rivals in enabled danger zones ([crime](crime.md)); residents are never targets.

## The rule

`preview/src/world-policy.js` is pure and shared by the server and the browser:

- **Clock.** World time is a minute of the day, kept as integer milliseconds (`dayMs`) and
  advanced only by the town's own steps at `rate` world minutes per real minute (0 pauses it, at
  most 60). It wraps at midnight. Snapshots carry `minute`. It is independent of the
  **Light & atmosphere** sun slider, which stays a local view setting.
- **Mode.** `off` (default), `scheduled` (inside the window) or `forced` (all hours).
- **Window.** `start` and `end` minutes, half-open `[start, end)`, and may cross midnight:
  18:00–06:00 is on at 23:59 and 00:00, off at 06:00. Equal start and end is never on.
- **Zones.** Authored per world, in town coordinates (`[east, north]` metres, `levelId` null for
  the street). Rectangles are `[minEast, minNorth, maxEast, maxNorth]`, half-open, so a point on a
  shared edge belongs to exactly one zone. River Oaks has two danger zones that the owner can
  enable, Westcreek Lane and the south service lane, and two safe zones, the plaza and the
  Gardens. Their measurements and a test that keeps the danger zones off every building footprint
  and room are in the module and `preview/tests/world-policy.test.js`. Other worlds have no zones.
- **PvP.** `false` by default; players can only harm players when the owner turns it on.

`evaluateViolence` is the one decision. It allows an attack only when every condition holds:
the attacker is a player, the target a resident or (with PvP) another player, the mode and
window are on, and both stand in the **same enabled danger zone**. Indoors, upper levels and safe
zones are always safe, from either side, and so is attacking across a zone boundary. A malformed
policy, place or type refuses. The server calls it as `world.violenceFor(attackerId, {type, id})`
with its own positions, levels and clock.

**Residents keep their routines.** The town still steps residents at hour 15. A shared night does
not pause them; that is a separate decision, tested in `server/tests/world-policy.test.js`.

## Owner commands

Only accounts that pass the town's `isAdmin` predicate (Jevica's accounts) may change the rules.
The command goes through the ordinary world dispatcher; identity comes from the authenticated
transport, never the message.

```js
{ type: 'worldPolicy', action: 'update', expectedRevision: 3,
  changes: { clock: { minute: 1380, rate: 0 }, violence: { mode: 'scheduled', schedule: { start: 1080, end: 360 }, zones: ['westcreek-lane'], pvp: false } } }
{ type: 'worldPolicy', action: 'emergencyOff' }
```

- `update` may name only `clock.minute`, `clock.rate` and the `violence` fields; the result is
  validated whole. It must name the current `revision` (`world_policy_conflict` returns the current
  rules otherwise), spends the ordinary command budget, and waits a second between changes
  (`world_policy_cooldown`).
- `emergencyOff` sets `mode: 'off'` and `pvp: false`, keeps zones and hours for later, and has no
  revision, budget or cooldown. Commands are applied in order, so every attack queued after it is
  refused.
- Other accounts get `world_policy_owner_only`; malformed commands get `invalid_world_policy`.

## What players see

The town panel's **World rules** section shows the world time, a sentence for the current rules,
the risk where the player stands (from the town's record of their position), and a polite
announcement when the owner changes the rules or turns danger off. The owner also sees the
controls and a large **Emergency off** button. The page only displays; the town refuses anyone
else's commands whatever the page shows.

## Storage and versions

The rules live in the private world checkpoint, **version 14**. Older checkpoints restore with
the peaceful default and keep everything else. An untouched default (revision 0) in an older
version is accepted, like an empty campus section; rules an owner changed are refused in an older
version. Region migration keeps the rules.

The Redis **writer generation** is now separate from the checkpoint version. v13 and v14 writers
both wrote checkpoint v13, so version-14 writers are `v15:` (plain) and `v16:` (with the character
store) and fence both. Crime state (checkpoint 15) moved writers to `v17:`/`v18:`. Raise `WRITER_GENERATION` in `server/redis-room.js` by two whenever older
writers cannot read a new checkpoint version. The browser protocol stays 3: the snapshot field is
optional, and `validTownSnapshot` refuses it only when present and malformed.

## Operating it

1. **Deploy.** Nothing to configure. The town starts and stays peaceful (`mode: 'off'`). Confirm in
   the panel: "The town is peaceful everywhere." Do not deploy a build from before #596 over a
   town that has written checkpoint 14; it cannot read it and will not take the lease.
2. **Turn danger on**, from Jevica's account: open the people panel, choose a mode, hours and
   zones, set the clock if needed, and select **Apply rules**. Everyone connected is told.
3. **Stop it**: select **Emergency off**. It takes effect at once, before any further attack, and
   everyone is told. Zones and hours are kept, so turning danger back on is a single update.
4. **If the panel is unavailable**, the same commands work from any authenticated owner session
   over the town socket.

The browser journey `world-rules-shared` (development shard) and the transport tests in
`server/tests/world-policy-transport.test.js` cover two clients, reconnects, writer replacement
and a v13 town. They use local fixture identities, not live WorkOS sign-in.
