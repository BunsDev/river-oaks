# Places: go anywhere, keep what you find

The **Places** tab (the first tab of the side panel) is the district's map in
list form, and the first piece of a world that people explore rather than
tour. It is built from the district data at load, so a new district brings
its own places without code changes.

## What is there

- **Where you are.** A live label names the nearest place within 45 m
  ("You're at Toulouse", "You're near Dior (23 m)"), or says you are out on
  the street.
- **Go somewhere.** Every named place in the district, once each: the arrival
  point, the community meeting spots, and any storefront that is not already a
  meeting spot. In the shipped district the 30 spots *are* the 30 storefronts,
  so the list is 31 long. **Go** teleports beside the place; **Link** copies a
  URL that brings someone else there.
- **Your landmarks.** Stand somewhere, name it, **Save here**. A landmark keeps
  the exact position and the way you were facing. In shared play, landmarks
  belong to the signed-in account and remain private across devices and server
  instances. The server saves the player's current position and facing. Solo
  play keeps landmarks in browser storage (`river-oaks-landmarks`). Up to 50
  per account or solo device.
- **Shared links.** `?place=spot:<id>` or `?place=shop:<id>` lands a visitor
  beside a named place after the district loads; `?at=<x>,<north>[,<yaw>]`
  restores an exact position inside the district. A link outside the district
  is ignored; a link into a building is refused, never nudged through a wall.
  Copied links include the current `world` ID and `play=multiplayer`, so a place
  in a published creator world opens that same shared world for the recipient.

## How a teleport lands

Nobody is ever placed inside a wall or a room. A spot is reached at the
nearest clear outdoor point within 4 m of it; a landmark or link within 1.2 m,
otherwise the request is refused with a message. The rule is the same in solo
play (`openSpotNear` in `preview/src/places.js`) and in the shared town, where
the server owns the decision: `travel` now accepts `placeId` (a community
location) and `position` (`[x, north]` inside `bounds_m`) alongside residents
and stores, applies the usual one-second cooldown, and keeps the traveller's
own facing for a bare position.

## Files

- `preview/src/places.js`: the place list, nearest-place search, landmark
  store, link formatting and parsing, open-spot search. Pure, unit tested.
- `preview/src/places-ui.js`: the tab's DOM and the status line.
- `preview/src/main.js`: `goToPlace` (solo and shared), the deep link on load.
- `server/world.js`: `travel` destinations `placeId` and `position`.
- `server/landmarks.js`: account landmark storage; Redis persists shared play
  across edge instances, and the standalone town keeps an in-memory store.

## Next

Creator regions can now be published as separate worlds with their own named
places. Parcels with owners remain future work.
