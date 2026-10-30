# Ribbonwing design brief (#777)

Status: **D2 paint pass** (`RIBBONWING_VERSION = 'd2-paint-1'`) on the D1 metric
blockout. This is a procedural, game-ready model matched to the two final references. It is
not finished detail art, not a pixel match and not Val's visual acceptance.

## Sources

| Reference | File | sha256 |
| --- | --- | --- |
| Exterior sheet (front, left, rear, top, underside, ¾) | `references/exterior.png` | `1ad22827e962a6543f10545fc549484f89a7bbda1831bb30d1cbace499c752cb` |
| Interior and motion sheet (right profile, cockpit, boarding, hover, stunt tuck, thruster joint) | `references/interior-motion.png` | `e0489437f601a7416caf842dec434866bb406788c2932c3289e157b4a94b49b8` |

Both are imported unchanged; provenance is in `reference-index.json`. They are
generated images, so their views do not agree exactly; the decisions below say
which view wins and why.

## D0: the craft this replaces

The landowner craft in Val's screenshots is the `hover` vehicle kind from #737
(`feat/landowner-hovercraft-20261028`, head `1cd96019`). `createFlightVehicle('jevica')`
in `flight-vehicles.js` is a different, unrelated sphere/ring and is untouched.

| Concern | Owner at the baseline | Ribbonwing change |
| --- | --- | --- |
| Renderer | `road-vehicles.js` hover branch (151-line coach) | `createRoadVehicle('hover')` returns `createRibbonwingVehicle` (`ribbonwing.js`) |
| Spec | `vehicle-config.js` `VEHICLES.hover` | dimensions, pads, seats and grips from `ribbonwing-design.js`; `chauffeur` flags (as #767) |
| Spawn UI | `player-avatar.js` garage `<option value="hover">` | label "Ribbonwing" |
| Entitlement | `server/world.js` `pose()` `exclusive_vehicle` via `isJevicaOwner` | unchanged |
| Authoritative motion | `pose()` speed/lift budget, `flies`, `flightCeiling`, 0.15 m path sampling against `canFly`/`isFree` | unchanged in this increment |
| Client motion | `carriage-motion.js` `stepHoverLift`/`hoverClear`, `parked-carriage.js` | parked-carriage feeds the accepted state to the rig; Jev no longer drives this kind |
| Observers | `remote-players.js` `syncRoad` → `createRoadVehicle(player.vehicle)` | rider seat from `riderSeat`; mechanisms follow the observed pose |

The kind id stays `hover`, so the server, checkpoints, chauffeur gates
(`server/chauffeur.js`, `src/river_oaks/chauffeur.py`) and saved vehicles need
no migration. Reverting the PR restores the coach.

## D1: metric decisions

Frame: metres, front −X, up +Y, left +Z, origin on the ground under the planform.

1. **Scale.** The two-seat canopy needs 1.44 m inside width for two seated
   adults (avatar envelope: seated width 0.78 m). At the top view's ratio
   (≈0.0119 m/px) this gives span 5.84 m, length 5.79 m and height 3.05 m. The
   Ribbonwing is therefore much larger than the coach that Val asked to be
   30% smaller; seating two side by side fixes the size.
2. **Top view wins on proportions.** The front view draws a narrower canopy
   relative to span than the top view; the top view is the larger, less
   foreshortened panel.
3. **Wing planform.** Traced from the top view outboard of z = 1.5 m (forward
   leading edge, fuller trailing edge, crescent hook). Inboard the reference
   leading edge would overhang the boarding ladder; the root is held aft of the
   ladder band (≥ 0.13 m clearance).
4. **Fans.** One shrouded fan per wing (two total), 0.56 m shroud at x −0.10,
   0.20 m of wing structure all round. The drawn fans sit about 0.1 m further
   forward; moving them there would thin the leading edge below the margin.
5. **Steps.** The reference shows a ladder that reaches the ground but no
   stowage. A folding ladder that long cannot stow flush, so the steps are a
   telescoping ladder in a flank housing on both sides.
6. **Canopy.** One rear-hinged clamshell (hinge at x −0.42) opening 1.1 rad;
   ≥ 1.0 m headroom over every point of both seats.
7. **Petals.** The split tail is two cupped leaves at about 45°, which reads
   broad in both front and side views as the references show.
8. **Gear.** Three feet. The nose foot folds forward and the mains fold outward
   under the wings. The gear stays down below 2.2 m and retracts above 3.0 m;
   the reference hover panel shows the gear up lower than that (deviation).
9. **Thrusters.** Twin rear nacelles with the gimbal at mid-length; an offset
   gimbal swung the nozzle into the body at hover pitch.
10. **Controls.** Side stick on the pilot's right, throttle on the left sill,
    pilot in the left seat.
11. **Tuck.** The wings sweep 0.8 rad about the root pivot with 0.12 rad droop.
    The half-span drops from 2.92 m to 1.93 m.

12. **Wing surface and the D2 floor.** The wing and its paint skins are
    tessellated (0.2 m edges near, 0.4 m medium) before bending onto the chord
    surface. The extruded caps had been a few long flat triangles. They showed
    the wing as nearly straight plates, not the authored gull curve with
    upturned tips, and they buried the upper paint. With the true surface:
    - pink coverage rises in every matched view (`d2-paint.json`);
    - the rear IoU falls from 0.459 to 0.401, below its D1 floor of 0.429;
    - the front IoU falls from 0.648 to 0.622, still above its floor.

    In those two views the D1 artifact had thickened the wing. The references
    draw a thicker wing section that rises steadily from the root, which is
    detail-art geometry. The D2 values are the floor from here (D2 − 0.03). The
    near level grows from 71k to 92k triangles, within the 130k budget.

## D1: camera calibration and tolerances

`camera-manifest.json` freezes the renderer, lights, background and every
camera. The matched cameras' elevations were fitted once by silhouette IoU,
with the geometry fixed: front 13.9°, left 19.2°, right profile 18.6°, hover
17.4° and stunt 23.6°. The rear mirrors the front. Optima that ran to the edge
of the sweep (rear 45.9°, ¾ 58.6°, boarding 49.9°) were rejected because the
references plainly do not show those views; those cameras stay as authored.

`d1-baseline.json` records the D1 silhouette IoU, aspect and coarse material
zones per matched view. They were measured before any detail work and are the
tolerance floor for later increments: a view may not fall more than 0.03 IoU
below its D1 value without a recorded decision. A higher IoU is not acceptance.

## Occupants

Jevica (resident 4, player look) pilots on the left; Prince Jev (resident 1)
rides on the right. Both are seated at their own proportions, with no
avatar scaling. The fitted skinned bounds are in `d1-baseline.json`.

| Fit | Result |
| --- | --- |
| Canopy headroom | 0.20 m (pilot) and 0.23 m (passenger) over the head |
| Hull floor | Jevica's gown hangs 0.08 m below the cockpit floor but stays 0.06 m inside the hull |
| Shared space | Seven shared 5 cm voxels, where the shoulders and elbows touch |

## Open for Val's review

- Pink coverage after the D2 paint pass (`d2-paint.json`):

  | View | Pink | Reference |
  | --- | --- | --- |
  | top | 0.23 | 0.38 |
  | hover | 0.23 | 0.31 |
  | stunt | 0.22 | 0.32 |
  | right profile | 0.21 | 0.29 |
  | left | 0.36 | 0.26 |
  | rear | 0.38 | 0.26 |
  | underside | 0.30 | 0.24 |

  The body is still ivory where the references lacquer it, and the lacquer
  reads lighter than the references.
- Wing section (decision 12): the references' wing is thicker and rises from
  the root. That costs rear and front IoU.
- Size (decision 1), gear-up altitude (8), and the inboard wing root (3).
- The low-IoU views: boarding (0.38), ¾ (0.45) and rear (0.46).
