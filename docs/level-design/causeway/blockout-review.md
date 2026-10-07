# Causeway blockout review

Status: **Review incomplete — pictured level not located.**

## Scope and evidence

- Date: 2026-10-06. Available checkout: River Oaks, revision `35355a3`.
- REF-01: `/Users/buns/Desktop/Screenshot 2026-10-06 at 20.35.41.png`.
  This local-only reference is not included in the repository.
- The screenshot's lower-right level label appears to read `LV_RoomAssetZoo`.
  The available project is `unreal/RiverOaks.uproject`; its startup map and only
  discovered map asset are `/Game/Maps/RiverOaksDistrict`.
- No Unreal editor process was running during inspection. A search of Desktop
  and Documents, including ignored files, found no matching pictured map/project.
- Existing diagnostics, README, and level-design skill changes were preserved.
  This review changes no level, asset, or gameplay source.

## What the marks indicate

These are image observations and interpretations, not surveyed geometry.

| Mark | Visible relationship | Working interpretation |
| --- | --- | --- |
| Green left and center uprights | Cross the foreground edge and rise through the scene | Bracket the height/extent of a spatial area; not confirmed proposed columns |
| Green lower outline and diagonals | Surround the near causeway/fascia and extend toward the right-hand span | Call attention to causeway depth and the long continuous edge; not evidence of a ramp or floor opening |
| Green right-hand cross-strokes | Overlay repeated rail/deck spans | Identify repeated rhythm to vary; not literal steps |
| Red sloping rectangle and short lower shape | Overlay the left/center railing, posts, and deck lip | Focus attention on a local edge/span break; precise intended change is unknown |

The visible blockout has a strong continuous dark horizontal rail/fascia, several
similarly spaced narrow supports, and broadly coplanar wall/storefront surfaces.
These support the reported impression of repetition. Perspective, lighting, and
occlusion prevent reliable dimensions or a complete route reading from REF-01.
The white figures are not calibrated scale references, and the material grid's
world size is unknown.

## Two local alternatives

Both proposals affect a short two-to-three-span test segment only. Use duplicate
test maps or isolated alternatives after locating the correct source level.
Keep baseline floor elevation, continuous edge protection, structural anchors,
and the measured through-route clearance. Do not cut an opening into an elevated
walking surface. All dimensions below are **proposed starting values**, conditional
on the actual survey; none are measurements of REF-01.

| | A — recessed arrival bay | B — staggered storefront bays |
| --- | --- | --- |
| Additive form | One plain box-shaped portal or shallow wall return, about 0.3 m deep, contained inside a recessed bay | One 0.3 m projecting storefront mass within an existing frontage/activity zone; no floor step |
| Reductive form | Set one storefront bay back approximately 0.6 m over one measured span | Recess the neighboring bay approximately 0.6 m and shorten/set back one nonstructural upper fascia segment |
| Silhouette | One clear deep break and a projecting frame interrupt the repeated frontage | Alternating near/far planes and one upper-level gap break the repeated spans |
| Sightlines | The open recess creates an arrival cue and room to see an entrance on approach; keep its frame out of the approach-to-exit view | Oblique views reveal bays in sequence; test whether the projection hides the next entrance on the return trip |
| Walking path | Preserve a straight through-route; put stopped occupants and entrance approach space in the recess | Keep the through-route straight and outside projections; the edge can vary without forcing a slalom |
| Principal risk | A deep recess can hide the actual entrance or look like an unintended passage | A projection can snag the capsule, hide destinations, or consume passing space |

**Provisional recommendation: A.** It gives the long frontage one legible spatial
break and a separate stopping area with less risk to circulation. B offers a
stronger alternating silhouette but needs more careful checks in both directions.
Do not randomize every span: retain the existing rhythm around the single local
intervention. Recommendation remains conditional on measurements and traversal.

## Survey and scale buddy

For the pictured map, all dimensions remain **not measured**: walkway free width,
rail height/thickness/post spacing, openings, storefront depth/height, overhead
clearance, and neighboring structure offsets. Record both nominal and narrowest
clear dimensions, including rail posts and any occupied activity area.

Read the pictured project's active pawn before placing a non-colliding scale
buddy. Match its actual capsule and mark its feet, capsule top, and eye height.
Place copies at the near span, narrowest opening, proposed recess, and turn.
Verify a known horizontal and vertical source length against the rendered level.

For context only, the available River Oaks native source specifies capsule radius
35 cm, half-height 80 cm (70 cm diameter, 160 cm total height), camera offset
80 cm above the pawn center, horizontal FOV 65 degrees, and a constrained center
height of 88 cm. Its nominal eye is therefore 168 cm above the Z=0 datum and its
capsule bottom is 8 cm above it. This is a fixed-height APawn without step-up or
slope solving. **Do not apply these settings to LV_RoomAssetZoo without confirming
that it uses this controller.** No buddy has been placed in the pictured level.

## Reproducible comparison and acceptance

Once the level is available, first save exact baseline transforms and camera
settings. Capture baseline, A, and B with identical FOV axis/value, aspect ratio,
resolution, lighting, occupancy, HUD, and camera transforms. Coordinates cannot
be recovered reliably from REF-01; the following stations have no assigned world
transforms yet.

| Station | View and purpose |
| --- | --- |
| CAM-01 | Approximate REF-01's oblique view to compare the causeway edge and frontage silhouette; label as detached if not a playable position |
| CAM-02 | Actual player eye at main-route arrival, looking along the railing toward the next opening |
| CAM-03 | Actual player eye beside the intervention, looking into the entrance/recess |
| CAM-04 | Actual player eye on the return route, checking that the exit remains recognizable |

Test ROUTE-01 arrival-to-exit and its reverse with normal input through the real
controller. Test ROUTE-02 entering/exiting each bay, including diagonal approaches
to projecting corners. Repeat with one stationary occupant in the intended
stopping area. Record intended/actual displacement, contacts, floor support,
camera clipping, narrowest free width, and elapsed travel time. Include a negative
test proving the unchanged rail/wall still blocks. Use capsule sweeps from actual
movement, not a navigation-path or visibility-ray substitute.

| Evidence | Status |
| --- | --- |
| Reference annotation interpretation | Completed; intent remains inferred |
| Correct level/layout verification | Blocked on project/map identification |
| Scale buddy and world measurements | Not performed |
| Alternative geometry | Proposed only; not built |
| Actual capsule traversal, baseline/A/B | Not tested |
| Matching rendered captures | Not captured |
| Player-height and moving-camera review | Not tested |
| Art replacement/full-map changes | None |

Next input: the `.uproject` path and map containing the pictured causeway, or
confirmation that REF-01 is only a design reference for River Oaks. That resolves
which layout and controller the measurements, alternatives, and captures must use.
