# Bird cams

Three city birds, a mourning dove, a blue jay and a cardinal, fly over the
district on Jev's autopilot. Open **Play & rides → Bird cams** and choose
**Ride along** to see through a bird's eyes.

## Jev's autopilot

Each bird ranks what is worth watching (`birdInterests` in `main.js`):

- residents by what they are doing: held by the Force or enchanted, then
  chatting, helping or greeting, then walking, then resting;
- Jevica and other players;
- the community spots, as a quiet fallback.

Nearer, livelier scenes win, and a scene just watched waits its turn. The bird
flies there, circles it for 12–20 s at 4 m above the ground, then moves on,
cruising at 10 m between scenes. On the way it rises ahead of buildings
(`clearAltitude`), and only a real obstruction lifts it.

## The companion bird

While you walk, the bird nearest you keeps you company, so you see one flying
nearby. It circles the spot you are looking toward, 20 m ahead, on a tight 8 m
lap, stepping the spot back toward you until the lap is clear of buildings,
trees and the district edge (`lapClear`). The role stays with that bird until
someone flies it by hand. Birds are drawn at 1.3× so they read at a distance.
`companionOf` and `companionInterests` in `bird-cams.js` hold the rules. It never
enters a building (`canFly`, the same rule as Jevica's flight) and turns back
at the district edge.

## Riding and taking over

| Key | While riding |
|---|---|
| W / S | faster / slower (any flight key takes the controls) |
| A / D | turn |
| Space / C | climb / dive |
| drag | look around without changing course |
| T | take the controls, or give the bird back to Jev |
| N | next bird |
| Esc | land, back on foot |

Handing back to Jev resumes from wherever the bird is; nothing snaps. Walking
pauses while you ride, and the camera glides into the bird over 0.8 s.

Birds are local to each browser; in shared play every visitor has their own.

## Files

- `preview/src/bird-cams.js`: birds, autopilot (`stepBird`, `chooseInterest`),
  the bird's-eye camera.
- `preview/src/bird-cams-ui.js`: the dock card and the ride bar.
- Tests: `preview/tests/bird-cams.test.js`, `preview/e2e/bird-cams.js`.
