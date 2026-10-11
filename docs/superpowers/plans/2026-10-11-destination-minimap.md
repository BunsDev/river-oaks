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

## Hosted compatibility correction
Final-head hosted run38124374196 exposed two older shared journeys that still
assumed the former UI: rail-shared required Events, and resident-names attempted
the hidden compact map player list without expanding the atlas. The actual Events
absence and shared map journeys passed. Updated those two tests to use the real
map command/expand control, retaining permission, focus and naming-security checks.
Both focused shared journeys passed locally with full Metal rendering. The resident
journey now requires a visible safe-name row instead of optionally skipping it.
Independent review found no weakened assertions. Original hosted failure artifact
is preserved in .runtime/ci/pr223-565facd; passing receipts remain unchanged under
output/playwright/pr223-*-fixed.json. Required hosted verification will restart on
the corrected head before any merge.

Corrected verification completed: shared rail17 and resident-name24 assertions
passed; fresh `pnpm run verify` passed all11 core tasks. Only the two legacy
journeys and task/ledger records changed; application runtime remains identical
to the independently reviewed minimap implementation.

## Final delivery and retirement — 2026-10-11

PR223 merged at 2026-10-11T09:07:37Z: reviewed head `064e1dc4e7012a7c6948ac7661c76e912f56812a`,
main merge `eb62862615f8a2ef5798e4eff213f811431a9e79`. Actual merge tree equals the reviewed
head tree. All ten hosted checks passed, including preview and both Python
matrices; Vercel status also passed. Source PR200 and PR215 are merged.

The final hosted correction waits for the compact map to become visible after
Escape before asserting restored focus; native dialog close dispatch is
asynchronous. Both original focus assertions remain. The focused minimap
journey passed before commit064e1dc; the final hosted preview passed minimap,
rail-shared and resident-names journeys. Runtime code was unchanged by these
three test compatibility corrections. Failed and passing receipts remain intact.

Eleven worktrees were retired in this deeper round. The live snapshot now has
9 worktrees and 9 local branches (started at17/17); three concurrent new
worktrees belong to dependency delivery and Workplace work. Six final task
records now say retired with exact archive refs, bundle hashes and path/ref
absence. See [the final manifest](../../project-management/retirement-20261011-final.json).

Both sign-in drafts, their source-reconciliation checkout, Storybook checkout,
cleanup branch and this thread's minimap checkout are retired. All276 local
files from the minimap checkout remain hash-verified in its restore-tested
archive, including native and browser receipts. Source archives and original
failed checks remain intact; no forced removal was used.

Primary staged patch and unique stash are unchanged. Cartier, Dior, Jevica,
SDK and World Studio source work remains protected, as do new concurrent tasks.
Core11, focused browser checks and exact-head hosted verification support this
delivery; native, live-auth, production and human accessibility acceptance are
not claimed for the minimap. This source task is complete and retired. Final
receipt publication uses a separate temporary index and no new local worktree.
