# District UI improvements — September 20, 2026

Implement six TypeSafe-aligned improvements across the existing examples:

1. Persistent section navigation for Explore, People, Scenarios, and Settings.
2. Searchable, category-filtered store directory with accessible result and empty states.
3. Selected store detail and previous/next arrivals within filtered results.
4. Collapsible walking controls; talk and location stay visible.
5. Community objective meter and next-request shortcut; contextual economy guidance and run status.
6. Daylight, pink hour, and mist lighting presets synchronized with manual controls.

Verification: browser interactions for all six, keyboard search, empty-state recovery, scenario state transitions, mobile layout, existing unit tests and production build. Keep the current district art and uncommitted changes.

Completed: all six improvements implemented. `preview/e2e/ui-improvements.js` passed 33 browser assertions across the four economy examples and three community examples, including accent-insensitive search, empty states, real camera movement, request conversations, running/paused state, lighting synchronization, and mobile layout. All 99 JavaScript tests and the production build pass; `git diff --check` passes. The existing Three.js chunk-size warning remains. Screenshots: `output/playwright/ui-desktop.png` and `output/playwright/ui-mobile.png`. Human screen-reader testing was not performed.
