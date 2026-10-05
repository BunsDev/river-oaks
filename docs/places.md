# Places: go anywhere, keep what you find

The **Places** tab combines a top-down world map with the destination and
landmark lists. Roads, buildings, named places, and the current location come
from the active world's compiled data, so a newly published region has its own
map without hand-authored artwork.

## What is there

- **Where you are.** A live label names the nearest place within 45 m
  ("You're at Toulouse", "You're near Dior (23 m)"), or says you are out on
  the street. A bright marker follows the player on the map.
- **World map.** Click a named marker or any point inside the current world to
  preview a destination, then choose **Go here**. Arrow keys move the selected
  point when the map has focus; Shift moves it one metre at a time. **Copy link**
  shares the selected world and position. Roads and buildings are visual
  context, never permission to enter a private home or pass through a wall:
  travel still uses the server's outdoor arrival check in shared play. Saved
  landmarks appear on the map only in their own world; the account list below
  continues to show landmarks from every world.
- **People in this world.** In shared play, outdoor players in the same world
  appear as live map markers and in a keyboard-accessible list. Choose a player
  and **Meet nearby** to ask the server for a clear spot beside their current
  position. The server resolves the player at the moment of travel, requires
  that they are still in the same room and outdoors, and keeps the arrival clear
  of other players. A peer selection cannot enter a private home or create
  a link to that player's current position. Players who leave or enter an
  interior disappear from this outdoor map.
- **Land parcels.** Creator worlds can show up to 32 named plots as map
  boundaries and in a keyboard-accessible list. Selecting one reports its area
  and whether it belongs to your signed-in account. Parcel selection does not
  teleport into a building; the ordinary map point and travel checks still
  govern movement. Ownership is recorded by Jevica in the region studio and
  does not grant building or wish powers.
- **Events.** Find scheduled gatherings across worlds, RSVP privately, or host
  a gathering at a named outdoor meeting point. Times use your local time zone;
  venue links use the same shared-world arrival checks. See [events](world-events.md).
- **Go somewhere.** Every named place in the district, once each: the arrival
  point, the community meeting spots, and any storefront that is not already a
  meeting spot. In the shipped district the 30 spots *are* the 30 storefronts,
  so the list is 31 long. **Go** teleports beside the place; **Link** copies a
  URL that brings someone else there.
- **Your landmarks.** Stand somewhere, name it, **Save here**. A landmark keeps
  the exact position, the way you were facing, and its world. In shared play,
  the Places tab lists your private landmarks from every published world. **Go**
  opens the saved world when needed; **Link** shares that world and position.
  The server saves the player's current pose, and landmarks remain private
  across devices and server instances. Existing landmarks stay in their
  original worlds and appear in the combined list without migration. Each
  world allows up to 50 landmarks per account. Solo play keeps up to 50
  landmarks in browser storage (`river-oaks-landmarks`).
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
- `preview/src/world-map.js`: map projection, geometry, selection, and live
  player marker.
- `preview/src/main.js`: `goToPlace` (solo and shared), the deep link on load.
- `server/world.js`: `travel` destinations `placeId`, `position`, and `peerId`.
- `server/landmarks.js`: private per-world account landmark storage; Redis
  persists shared play across edge instances.
- `server/world-landmarks.js`: combines the bounded per-world lists for the
  account and tags each location with its origin world.

## Next

Owner-managed parcel permissions and an economy remain future work. Jevica
continues to control all shared building and wish granting.
