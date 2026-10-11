# Places & landmarks travel guide

Objective: reduce everyday rail clutter and polish destinations/saved places.
Move full collections into a dedicated travel dialog with search, destination and
saved-place tabs, and secondary row actions behind a disclosure. Keep existing
server-authoritative travel, saved-place persistence, and optional map behavior.
The multiplayer town stays live; this is not a global pause.

Worktree: river-oaks-places-guide-20261009; branch polish/places-guide.
Original checkout has unresolved unrelated conflicts and is untouched.
Status: implementation and local verification complete; uncommitted.
No commit/push or publication requested for this task.

## Files owned

- `preview/src/places-guide.js` and `.css`: compact rail entry, native travel
  dialog, destination search, saved tab, focus restoration and responsive styling.
- `preview/src/places-ui.js`: collection integration and secondary action menus.
- `preview/src/rail-navigation.js`: command routing into the dialog.
- `preview/src/world-map.css`: retain optional map styling in the new surface.
- `preview/e2e/places-guide.js`, `experience-runner.js`, and existing places,
  rail-navigation, multiplayer, shared-seating, world-map and world-publish journeys:
  behavioral regression and explicit opening/closing of the new travel surface.

## Verification

- `npm run agent:doctor`: completed after dependency installation.
- `npm run verify`: passed all 11 core tasks. Preview 2508 passed/1 skipped;
  server 276 passed/102 skipped; desktop 9 passed; Python 141 passed with two
  warnings; tooling 17 passed. Build, lint/format, offline demo and secret checks
  passed. Receipt: `.runtime/agent/core.json`; log `/tmp/places-guide-verify.log`.
- `RIVER_OAKS_E2E_REPORT=places-guide.json npm run test:experience -- places-guide places rail-navigation`:
  guide and places passed. Rail selector initially ambiguous after adding a second
  tablist; scoped to the rail and verified by the dedicated rerun below.
- `RIVER_OAKS_E2E_REPORT=places-guide-navigation.json npm run test:experience -- rail-navigation`: passed.
- `RIVER_OAKS_E2E_REPORT=places-guide-final.json npm run test:experience -- places-guide`: passed,
  including destination search, saved-place creation/removal, secondary actions,
  keyboard tabs, Escape/focus restoration, commands and narrow/light/dark layouts.
- `RIVER_OAKS_SHARED_JOURNEY=world-map npm run test:shared -- development-world`: passed.
  Log: `/tmp/places-guide-map-shared.log`. The earlier experience-harness map run
  lacked the required world fixture and failed connection; its separate failed
  report is retained. The successful shared map report was subsequently overwritten
  by another shared run; the successful console log and screenshots remain.
- `RIVER_OAKS_SHARED_JOURNEY=multiplayer-dev npm run test:shared -- development`: passed.
  Report copied to `data/reports/places-guide-shared.json`.
- `RIVER_OAKS_SHARED_REPORT=places-guide-multiplayer.json RIVER_OAKS_SHARED_JOURNEY=multiplayer npm run test:shared -- required`: passed.
- `RIVER_OAKS_SHARED_REPORT=places-guide-publish.json RIVER_OAKS_SHARED_JOURNEY=world-publish npm run test:shared -- development-publish`: passed after adapting map-entry steps.
- `RIVER_OAKS_SHARED_REPORT=places-guide-seating.json RIVER_OAKS_SHARED_JOURNEY=shared-seating npm run test:shared -- development`: passed after adapting shared helper dialog entry/exit.
- `git diff --check`: passed.

Visual review: `output/playwright/places-guide-rail.png`,
`places-guide-dark-1440.png`, `places-guide-light-390.png`,
`places-guide-saved.png`, and `world-map.png`. Desktop and narrow guide layouts
were inspected; no horizontal overflow was detected in the focused journey.

## Gaps and next step

Full verification matrix, isolated Redis, native runtime, hosted CI, live WorkOS,
production, human keyboard-only and screen-reader acceptance were not run.
Shared journeys use local fixture identities and loopback services.
Source implementation completed before the core gate; subsequent changes only
adapted browser journeys and added test screenshots.
Review is ready. Delivery remains uncommitted on the isolated branch; do not
archive/remove this worktree while these edits are undelivered.
