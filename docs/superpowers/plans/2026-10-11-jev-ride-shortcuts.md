# Jev ride shortcuts

Objective implemented: Q calls Jev and the selected vehicle; G gets in or steps out with the world focused. Existing button eligibility, account restrictions, typing/system-chord protection, repeat suppression and server-confirmed exits are retained. H remains Clear view, C lowers flight, R rotates builds, E talks, F enters buildings.

Owner: codex:jev-ride-shortcuts-20261011. Branch: feat/jev-ride-shortcuts. Worktree: ../river-oaks-ride-shortcuts-20261011.

Files: preview/src/player-avatar.js (shortcuts and persistent button hints), preview/src/walking-ui.js (movement and riding hints), preview/src/rail-navigation.js (Commands reference), preview/e2e/carriage.js (behavioral keyboard regression), docs/character-forms.md, task register and this ledger.

Verification:
- pnpm install --frozen-lockfile and uv sync --locked; pnpm run agent:doctor passed after Python environment setup.
- Test-first carriage journey failed at the Q summon status assertion on the unchanged implementation with the world fully loaded.
- pnpm run test:experience carriage passed twice after implementation; final run covers final HUD wording. 21 checks including call, board, drive, exit, repeat and modifier/input protection. Receipt: .runtime/jev-ride-shortcuts-browser.json. Screenshot reviewed: output/playwright/carriage-riding.png.
- pnpm run verify passed all 11 tasks; .runtime/agent/core.json. Preview: 2586 passed, 1 skipped; server: 298 passed, 106 skipped; desktop: 36 passed; Python: 141 passed. Build, lint, format and worktree secret scan passed. Synthetic demo verification expected blocked exit is the profile contract.
- git diff --check passed; source diff reviewed. Historical experience.json restored after retaining this task receipt.

Limits: skipped checks are not proof. Redis/full browser suite, native runtime, live auth, human keyboard/VoiceOver and hosted CI were not run. Existing build chunk warning and Python dependency deprecation warnings remain.

Lifecycle: initial inventory had 12 worktrees; final inventory has 14 worktrees and 14 branches, including concurrent unrelated work. This task created one sibling worktree and removed none. Start and handoff project:check --github report unrelated ownership/registration/PR-head gaps; no other tasks were changed. Primary checkout dirty work preserved; only this new coordination entry was appended there.

Next: user authorized commit, push and merge to main. Complete independent review, PR checks and exact-head merge; record delivery evidence afterward. Preserve worktree until delivery is confirmed.

Final integration: shortcuts and map polish are combined in PR #229 on top of main cd42d50e (dependency PRs #211–213 delivered). `pnpm run verify` passed all 11 tasks with an isolated PATH wrapper limiting `node --test` to two workers; 2589 preview passes / 1 skip, 298 server passes / 106 skips, 36 desktop passes, 141 Python passes. Final `pnpm run test:experience carriage destination-minimap` passed both journeys; receipt .runtime/final-map-rides.json. Independent review has no outstanding findings. Hosted exact-head checks and merge evidence remain the delivery gate.
