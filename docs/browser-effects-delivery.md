# Browser destruction, smoke and performance delivery

Requested September 26, 2026. Browser only; retain the district layout and the
ongoing people-interaction and movement work.

## Required outcomes

- Thrown objects break the window panes they actually hit. Restore each pane
  after 20 seconds. Keep frame geometry intact and use bounded debris.
- Profile the complete scene, attribute polygon counts and draw calls, and
  optimize measured bottlenecks. Report before/after results and fidelity limits.
- Add a throwable smoke grenade with dense, detailed smoke and a bounded effect
  pool. Shoppers evacuate through the real exit; workers put on masks and stay
  available to serve Jevica. The intended outcome is a quiet shop without a queue.
- Show Jevica evacuating in a skippable cutscene. Preserve input, camera, reduced
  motion, interactions and character state through completion or cancellation.
- Keep evacuees interactive at their rendered positions and restore normal
  building activity after the quiet-shopping interval. Jevica can return after
  her exit cutscene; staff retain masks while the smoke is active.

- Revise the carriage into a slightly smaller unicorn-drawn coach. Jevica rides
  inside; a separate male driver dressed entirely in pink sits up front and
  handles the unicorn team. Preserve passenger clearance and include the team
  in movement, parking, harness and collision checks.
- Add carriage autopilot with immediate manual takeover. Route the full coach
  and unicorn team on roads, preserve collision clearance and use bounded Jev
  decisions through the existing key settings.
- Add freely spinning carriage wheel centers and controllable hydraulics, including
  a real Jev decision mode using the configured bridge key. Keep tyres grounded,
  the rider attached to the moving seat, and geometry/draw calls bounded.
- Add a clear Force push-away action for people and a separate dance spell using
  licensed, premade motion-capture clips from a dance library. Select varied clips,
  retarget them to the shipped rigs, blend in/out smoothly and preserve encounters.

## Execution ledger

| Work | State | Evidence / next action |
| --- | --- | --- |
| Curb touchdown endpoint | Corrected | Planned contact X/Z now stays fixed at touchdown. 168 unit curb cases pass; synthetic whole-body peak falls from 5.60 to 1.61 m/s. Other ankle landing discontinuities remain; see `browser-curb-touchdown.json`. |
| Window impact registration | Implemented | 1,324 real panes registered without splitting facade batches; moving doors retain their transforms. |
| Glass break and restoration | Browser verified | Normal R throw breaks one pane, stops outside the display backing, emits 32 pooled triangles and restores after 20 simulation seconds. Six unit tests and ten browser assertions pass; combined browser unit suite passes 451 tests and the build. |
| Complete-scene performance | Pending | Existing profiles include roughly 18 million rendered triangles across passes. Attribute costs before selecting geometry/LOD changes; avoid treating isolated CPU timings as FPS proof. |
| Smoke grenade and evacuation | Pending | Integrate with indoor navigation, NPC visibility and interaction ownership. Add bounded smoke/shard resources and prevent overlapping cinematics. |
| Jevica evacuation cutscene | Pending | Use production avatar movement and the real doorway, with skip and reliable control/camera restoration. |
| Coach scale, cabin and spinners | Browser verified | 10% smaller coach, cabin seating and coasting wheel centers pass 17 browser checks. Tyres and both shoes retain contact. |
| Pink coachman | Core interaction verified | Jules uses the shipped tailored male rig, sits up front, keeps a stable encounter identity while travelling and accepts directory/pointer/seated conversations. Reins connect to the rendered hands; Force and wish visual integration remain open. |
| Unicorn team and harness | Browser verified | Two detailed CC0 horses adapted into unicorns with coat and normal maps, weighted mane/tail/eyes, gold horns, harness shafts and hand-to-bit reins. Four-beat walk blends into a faster gait, with planted hoof IK, support-aware reversing, turning body alignment and eased stopping. Full-team parking/collision envelope; nine unit tests cover 30/60/120 Hz contacts, tight turns, reversal and recall, with nine browser assertions. Each unicorn has 40,672 triangles; geometry and textures are shared. See `browser-unicorn-carriage.json`. Scanned hair and full muscle simulation are not implemented. |
| Carriage autopilot and Jev hydraulics | Pending | Build full-vehicle routing, immediate manual takeover and bounded Jev decisions. Do not treat the existing on-foot auto visit as carriage autopilot. |
| Push-away and dance spells | Inspecting | Stronger human push plus licensed premade dance clips; inspect source/licensing and rig retargeting before integration. |
| End-to-end verification | Pending | Verify real throws into windows, timed restoration, dense smoke, NPC/player exit paths, interactions during/after evacuation and frame/resource budgets. |

Current glass and coach evidence is in `data/reports/browser-glass-and-coach.json`.
Smoke, evacuation, hydraulics, autopilot and dance remain unimplemented. Broader clothing and movement realism gaps remain
open in `people-interaction-progress.md`.

## Main integration — September 26

Reconciled the browser delivery with main's graphics quality, loading progress,
clear-view controls, tree LOD/shadows and shared-town features. Main contained
committed conflict markers; those are resolved in the integration. Native files
match the incoming main revision.

AO now visits visible branches once per pass and prunes hidden rooms and excluded
groups. This preserves immediate exclusion of newly loaded props and leaves
hidden descendants untouched, replacing the older timed exclusion cache. Shared
skeleton uploads still run once per composed frame.

Carriage driving, its coachman and telekinesis currently run in solo play. Shared
play retains server-owned travel, residents and wishes; these local actions stay
disabled until their state has a server protocol. The development preview for
this delivery runs with `VITE_MULTIPLAYER=off RIVER_OAKS_DEV_TOWN=off`.

The integration passes 39 solo browser checks and 16 shared browser checks,
including asynchronous asset loading, shared wishes, reload, movement and sign-out.
See `data/reports/browser-main-integration.json`. A fully collapsed camera boom
now retains the requested view direction, so the coachman stays selectable when
a nearby tree blocks the third-person camera.
