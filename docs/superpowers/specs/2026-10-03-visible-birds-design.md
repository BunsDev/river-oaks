# Visible birds

Date: 2026-10-03. Status: approved, then revised during implementation (see
*Revisions after measurement*); implemented on `feat/visible-birds`.

## Problem

Jev's three birds (mourning dove, blue jay, cardinal) have bodies, but a player
on the street never sees them. In a 60 s sample at the default walking view, a
bird was inside the frame 0% of the time.

The cause is geometry, not size. The walking camera has a 42° vertical field of
view and a default pitch of −0.16 rad, so the top of the frame is about 12°
above eye level. A bird circling a scene at 9 m above the ground and 13 m out
sits 29° above eye level. At that range its 0.8 m wingspan would be about 60 px
on a 900 px tall view; it is simply above the frame.

## Goal

A player walking the street regularly sees a bird flying nearby, at a
believable size, with no new interface.

Acceptance: standing on the street for 60 s at the default view, a bird is
inside the frame with at least 24 px of wingspan in at least 30% of samples.

## Design

### 1. Flight tuning

Change `BIRD_FLIGHT` in `preview/src/bird-cams.js`:

| Constant | Now | New | Effect |
|---|---|---|---|
| `watchClearance` | 9 m | 4 m | circling height above the ground |
| `orbitRadius` | 13 m | 14 m | circling radius |
| `cruiseClearance` | 15 m | 10 m | height between scenes |

At 4 m up and 14 m out a circling bird is about 9° above eye level and its
wingspan is about 66 px. `minClearance` (3 m), `clearAltitude` (rising ahead of
buildings) and `canFly` (never inside a building or under cover) are unchanged.

Draw each bird at 1.3×, as a scale on the model group. The ride-along eye point
(`0.3` m ahead of the bird, `0.07` m up) is multiplied by the same factor so the
beak stays out of the ride-along view.

### 2. The companion rule

One bird keeps the player company, so there is usually a bird in the player's
part of the street.

- **Role.** Each update, the bird nearest the `player` interest holds the
  companion role. The role changes hands only when another bird is at least
  10 m closer, so it does not flap between birds. With no `player` interest
  (not walking), no bird holds the role.
- **Effect.** For the companion only, interests within 35 m of the player,
  including the player, have their weight multiplied by 3 before
  `chooseInterest` ranks them. The other two birds rank the unmodified list.
- **Shape.** Two pure, exported functions in `bird-cams.js`:
  - `companionOf(flock, player, current)` returns the bird that should hold the
    role, given the current holder (for stickiness).
  - `companionInterests(interests, player, radius = 35, boost = 3)` returns the
    weighted list.
  `createBirdCams.update` calls them and passes the result to `stepBird` for
  the companion. A bird in `manual` mode is never given boosted interests.

Constants `COMPANION = { radius: 35, boost: 3, handover: 10 }` live beside
`BIRD_FLIGHT`.

### 3. Unchanged

Keys, the Bird cams panel, manual takeover and hand-back, the 0.8 s glide into
a bird, and the rule that birds are local to each browser.

One consequence to accept: while a bird circles a scene, the ride-along view is
now a low, close view of that scene, not a rooftop view. Transit between scenes
still climbs over buildings.

## Verification

- **Unit** (`preview/tests/bird-cams.test.js`):
  - a bird watching a scene settles within 0.5 m of `ground + 4` and within
    1.5 m of a 14 m radius;
  - `companionInterests` multiplies only weights of interests within the
    radius, and leaves the input list untouched;
  - `companionOf` picks the nearest bird, keeps the current holder until
    another is at least 10 m closer, and returns `null` without a player.
- **End to end** (new `preview/e2e/birds-visible.js`): load the district, stand
  on the street at the default view for 60 s, sample twice a second. Using each
  bird's projected screen position and wingspan (added to the dev-only
  `window.__riverBirds()` state: `screen: [x, y]`, `inFrame`, `wingspanPx`),
  require a bird in frame at ≥ 24 px in ≥ 30% of samples. Save a screenshot of
  a frame with a bird in view.
- **Regression**: the existing `preview/e2e/bird-cams.js` ride-along check
  passes; `render-budget` is unchanged.
- **Docs**: `docs/bird-cams.md` gets the new heights and the companion rule;
  `docs/testing.md` describes `birds-visible`.

## Revisions after measurement

The design above was approved, then changed where measurement showed it fell
short. What shipped:

1. **The companion circles ahead of the player.** Weighting scenes near the
   player (×3 within 35 m) put a bird in view only 4% of the time: the
   companion circled scenes off to the side or behind. The companion's only
   scene is now the spot the player is looking toward, 20 m ahead
   (`COMPANION.ahead`), on a tight 8 m lap (`COMPANION.orbit`), stepped back
   toward the player until the lap is clear (`lapClear`), else a lap around the
   player, else the player's own scene. The role sticks with one bird until
   someone flies it by hand. The interest gains a `view` (where the player is
   looking) and an optional per-scene `radius`.
2. **Circling uses pursuit steering.** The old law (fly the tangent, corrected
   by radius error) swung through the middle of a tight lap. A bird now aims at
   the point on the lap 0.9 rad ahead of its own angle, and slows so its tightest
   turn is 70% of the lap radius.
3. **A circling bird looks 5 m ahead, not 10** (`watchLookahead`), and is
   lifted only by a real obstruction. `lapClear` checks the same things the
   flight rules do: open air at the centre and on rings at half the radius, the
   radius, and radius plus look-ahead, and the lap clear of the 18 m district-edge
   turn-back (`edgeMargin`). An earlier lap check tested less than the flight
   rules probed, so "clear" laps were still lifted out of shape.

The ride-along harness (`bird-cams`) waits for the 0.8 s glide on frame time
rather than a fixed 1.2 s (it failed on `main` under load), and its "view from
the air" threshold is 1 m above the walking view: birds never fly below 3 m and
the walking eye is at 1.68 m.

## Out of scope

Perching, on-screen markers, ground shadows as cues, bird calls, and birds
shared between players.
