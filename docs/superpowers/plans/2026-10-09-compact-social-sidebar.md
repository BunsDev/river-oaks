# Compact social sidebar

Objective: refine the pictured town sidebar with compact spacing, quiet dividers,
consistent controls, and theme-aware surfaces. Preserve chat/social behavior.

Owned files: preview/src/multiplayer.css, preview/e2e/compact-social-sidebar.js,
this ledger and data/reports/compact-social-sidebar.json. Delivery worktree:
river-oaks-compact-sidebar-20261009; branch: polish/compact-social-sidebar.
Existing unrelated edits remain in the original worktree.

Checks: focused browser journey (empty/populated chat, profile, focus, narrow layout,
light/dark themes), npm run verify, git diff --check.

Implemented: 12px section spacing, quiet theme-aware borders, compact 36px controls
(44px for coarse pointers), uppercase section labels, and zero-height empty chat/status
regions. Live regions remain mounted. No multiplayer logic changed.

Verification:
- Browser regression failed before the CSS change on reserved empty transcript height.
- `RIVER_OAKS_E2E_REPORT=compact-social-sidebar.json npm run test:experience -- compact-social-sidebar`: passed after the change (7.5s). Covers sent messages, opening/closing profile and focus restoration, keyboard input focus, no rail overflow at 1440/390px, light/dark themes.
- Visually inspected empty dark card and populated light narrow card screenshots.
- `git diff --check`: passed.
- `npm run verify`: passed (all 11 tasks). Preview: 2507 passed, 1 skipped; server: 276 passed, 102 skipped; desktop: 9 passed; Python: 141 passed, 2 warnings. Production build passed. Offline demo verification returned its expected domain exit 2; this is not real-world acceptance. Receipt: .runtime/agent/core.json.

Implementation and promised local checks complete.

Evidence: data/reports/compact-social-sidebar.json and output/playwright/compact-social-*.png.
Not verified: full/Redis/browser matrix, native, live auth, human accessibility.
User authorized commit, push and merge to main.

Isolated delivery verification (2026-10-09):
- `npm ci --ignore-scripts`, `uv sync --locked`, and `npm run agent:doctor`: passed.
- `npm run verify`: passed all 11 tasks; preview 2504 passed/1 skipped (excludes
  unrelated working-copy tests), server 276 passed/102 skipped, desktop 9 passed,
  Python 141 passed/2 warnings. Expected offline demo exit 2 retained.
- Focused browser journey: passed (7.0s); receipt refreshed from this worktree.
- `git diff --check`: passed.
Next: commit, push, and merge the isolated branch after hosted checks.
