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
