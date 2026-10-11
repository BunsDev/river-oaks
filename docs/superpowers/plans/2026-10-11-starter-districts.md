# Starter districts

Objective: five original, understandable district blockouts, portable schema-v1 JSON and an in-editor chooser with small plan previews.

Owned by Cody in cody/starter-districts-20261011. Main checkout has unrelated edits; isolated sibling worktree used.

Design: Market Street (linear), Garden Neighborhood (loop), Arts Courtyard (enclosed square), Civic Square (cross-axis), Innovation Campus (linked courts). Flat terrain, clear arrival, four or more named destinations, restrained tree rhythm, all dimensions proposed metres. Original synthetic layouts, no external assets or surveyed claims. No paid inference, publishing, or modification of the current device draft.

Checks: schema/compiler roundtrip, clearance/connectivity, picker/browser flow, and core verification passed; details below.

Next: publish the user-authorized feature PR; await review and hosted CI.

## Verified outcome

Five templates and a native modal chooser implemented. Plan thumbnails derive from the same region JSON. Existing dirty-draft confirmation is preserved; cancel leaves the region intact; opening does not overwrite local storage. Template modal fences editor shortcuts and is disabled during walkthrough.

- Red test: missing templates module, then green after implementation.
- `node --test preview/tests/studio-*.test.js`: 23 passed, 0 failures.
- `pnpm run verify`: core passed; `.runtime/agent/core.json`.
- `RIVER_OAKS_E2E_REPORT=starter-districts-browser.json pnpm run test:experience world-studio`: passed. Five rendered templates, chooser Escape/focus return, discard cancellation, narrow viewport, saved draft preservation. Screenshots in `output/playwright/world-studio-template-*.png` and `world-studio-templates*.png`. Chooser screenshot visually inspected.
- ZIP reopened and integrity checked, contains five JSONs, HTML guide and README. HTML reopened from disk.
- Portable delivery: `/Users/buns/Documents/starter-districts-20261011/`.

Limits: no human accessibility review, per-template physical traversal acceptance, production publishing, paid provider call or Unreal test. Existing global project register has unrelated reconciliation gaps (unregistered branches and missing local refs); retained unchanged. Main working draft untouched.

Local integration into the main checkout was verified separately without changing its unrelated staged edits. Val authorized commit and PR creation. Task remains active pending PR review and merge; do not retire this worktree.

Pre-commit verification refreshed and passed in the isolated branch: 23 Studio tests, all 11 core-gate tasks, and World Studio browser acceptance. Logs: `.runtime/pr-studio-tests.log`, `.runtime/pr-core.log`, `.runtime/pr-browser.log`.
