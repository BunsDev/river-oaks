# Destination minimap

## Objective and ownership
User requested removal of the unfinished Events section and consolidation of Go
Somewhere / Places into a luxurious, modern, expandable minimap. This session
owns this follow-on UI work after the coordinated PR210 delivery boundary.
Reuse the current checkout; preserve authoritative movement and existing places,
landmarks, route planning and focus behavior. No new worktree is needed.

## Files and approach
Inspect existing world-map, places-ui/guide, sidebar, rail navigation and callers.
Remove the Events surface/entry points, retain its service implementation for a
future deliberate rollout. Use the existing map geometry and destination data.
Compact mode gives orientation and an obvious expand action; expanded mode
combines searchable destinations, map selection, saved landmarks and route action.
Match the existing Outfit/Fraunces identity with disciplined ink, stone and brass
accents. Ensure narrow-screen layout, keyboard focus recovery and reduced motion.

## Checks and status
Pending implementation. Add focused behavioral regressions, run browser journeys
for compact/expanded navigation at desktop/mobile widths and removal of Events,
then core/build and independent review. Hosted checks remain a merge gate.
Record screenshots and actual gaps; browser automation is not human acceptance.

## Next action
Read owning modules/callers/tests and create the smallest coherent map-first change.

## Implemented and focused verification
- Reused the memory checkout on feat/destination-minimap-20261011 after publishing
  cleanup PR215. No minimap implementation is mixed into that PR.
- Map is always available independently of shared-world publishing. One live map
  moves between compact overview and an expanded searchable atlas; destination
  selection retains the existing authoritative travel and saved-landmark paths.
- Events construction, fetching and command entry removed. Service code remains
  available for a future deliberate rollout. Direct storefront access is secondary.
- New browser regression failed on missing compact map before implementation.
  Final focused minimap/Events journeys passed, including 320/390/1440 widths,
  844x390 and 1024x600 landscape, search selection, focus recovery and no Events
  requests. Existing Places, Places guide, rail navigation and game HUD passed.
- Independent review corrected focus capture before DOM movement and effective
  bounded map sizing; follow-up review has no blockers. Final screenshots are
  under output/playwright/destination-minimap-*.png.
- Core still running at this checkpoint; hosted verification remains required.
  No native, production/live-auth or human accessibility acceptance is claimed.

Core verification completed: `pnpm run verify` passed all 11 tasks on the UI
working tree. Final focused minimap and Events journeys both passed. Hosted
workflow now includes the minimap journey explicitly. Broader local acceptance
passed travel/landmarks and game HUD; the initial Events keyboard attempt was
replaced by waiting for loading dismissal and the visible Commands button, then
passed. Original failed and passing receipts are retained unchanged in
output/playwright alongside screenshots.
