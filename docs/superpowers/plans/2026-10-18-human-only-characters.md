# Human-only characters

Objective: remove playable beast variants comprehensively and focus character art on ultra-realistic humans, targeting iOS and macOS. Preserve ordinary world wildlife and clothing names such as coat tails. Preserve historical receipts as evidence of old revisions.

Owned branch: feat/human-only-characters-20261018, based on creation branch 7705cb25. Other session's uncommitted tailoring remains untouched.

Work: human-only catalog and UI; remove beast rendering/gaits/traversal/assets; migrate retired saved identities to their matching human character/style while preserving ownership and strict publication validation; update fixtures and current docs.

Checks: focused catalog/migration/render regressions; core verify; browser Studio journey; inventory residual references. Human photorealism and physical iOS/macOS acceptance remain separate visual/device gates.

Status: implementation in progress; verification running. No delivery claimed.

User added office scope: purge private/personal offices; only Jevica office remains, with permission and invitation from Jevica. Audit provisioning, invitations, APIs, visits/checkpoints and UI; preserve unrelated office rendering/collision and existing private task data. No production database operations authorized.

Modal scope: Character Studio assumed from context. Expanded desktop to viewport minus 24 px, wide controls in columns, full safe viewport on phones with one vertical scroll area. Browser regression checks desktop fit at 1440 x 900 and phone horizontal overflow.

Verified: Redis-backed character preferences/selection/private desk/lifecycle: 37 passed, zero skips. Office permission and retired-route recovery: 8 passed. Cloth rebakes completed for coat, Lyra and Silvan with no diagnostic failures. Core and Studio browser gates remain running; initial core run caught raw rig fixture naming mistakes, corrected and focused load regression passes (2 tests).

Build: `pnpm run build` passed (existing bundle-size warnings). `git diff --check` passed. Browser journey remains queued behind another session’s shared browser lock. Port 5173 still serves the earlier creation checkout.

Latest verification:
- `pnpm run test:experience character-studio-layout`: passed. At 1440 x 900 the modal and all Sable editing controls fit without scrolling; 390 x 844 has no horizontal overflow. Screenshots inspected in output/playwright/character-studio-layout-{desktop,phone}.png.
- `pnpm run test:experience character-studio office-visit`: office-visit passed, including invite and revocation during boarding. Studio reached wardrobe controls but had an ambiguous test selector, now made exact. Full Studio rerun pending (one attempted rerun failed starting Vite with transient ENOSPC).
- Final focused client suite: 74 passed, zero skips. Character world/selection: 13 passed. Memory/Redis character equip: 7 passed. Office rollback, memory/Redis access, local/multi-world routing: 8 passed, zero skips.
- Core gate did not pass: preview-tests timed out at 600 seconds; earlier raw rig fixture failure was corrected and focused load tests pass. Broad concurrent server suite also had resource/timeouts plus outdated expectations; affected expectations were corrected and targeted suites pass. No full-core success claimed.
- Dev server moved to this checkout on 5173, town 8942; root HTTP 200 and expanded CSS confirmed. Env files remain in primary checkout and were referenced in place.
- No commit, push, merge, production DB operation, physical device acceptance or photorealism acceptance. Keep worktree: edits are undelivered.

Final browser rerun: `pnpm run test:experience character-studio` passed all 43 checks, including desktop fit, keyboard save, touch editing and animation. Dedicated layout and office-visit journeys also passed. Isolated Redis 6397 stopped after tests; user dev server 5173 remains running. Broader core gate is still not green; keep this undelivered checkout.

Delivery authorized: commit, push and merge to main. Review commit is backed by build, 43-check Studio browser, layout and office browser, 74 focused client tests and focused server/Redis suites. Complete gate remains required before landing; integrate latest main and resolve dependency-stack conflicts next.

Integrated origin/main a308a95d before delivery. Resolved Studio asset validation by keeping `characterAssetFor`, retained moving-platform locomotion, kept the office-lift journey and current office activation history while removing retired workspace behavior. Integrated build passed; character contract/migration/guide 12 passed and human/office authority 4 passed. Complete core-controlled run is pending and remains a merge gate.

Main-integration bake correction: all three bake scripts reran through the shared lock; geometry output is byte-identical and diagnostics have no failures. Receipts now reference the integrated lockfile, foot-placement and foot-roll sources. `node --test --test-name-pattern=provenance preview/tests/coat-tails.test.js preview/tests/drape-seat-bake.test.js preview/tests/silvan-drape.test.js`: 3 passed, zero skips.

Delivery verification continuation: `core-rest` passed all remaining configured core steps after agent/client testing: server 662 passed / 204 Redis skips (core scope), desktop 76 passed, integrated build, Python lint/format/tests, expected-status demo verification and all-file secret scan. Hosted Redis and browser jobs remain authoritative merge gates. The complete client run is still finishing; stale bake-receipt failures have passed their focused regeneration checks. PR #496 tracks delivery.

Second main integration: #495 landed first. Retained the creator street-datum migration and its browser journey alongside persistent character migration; 20 affected contract/world tests passed. The complete client run finished with 3,519 passes, one existing skip and four stale receipt failures; all five receipt checks now pass after actual Sable/Vesper rebakes as well. Shared Studio journeys no longer select the removed form control. Standard core rerun and hosted Verify remain pending on the integrated head.

Final integrated checks: shared Studio and cross-world Studio browser journeys passed. Standard core rerun completed 3,522 client passes, one existing skip and one office texture-slice timing failure (270 ms under load); the full 15-test furnishings file passed in isolation afterward. Hosted client/server checks passed. Hosted places journey exposed an obsolete personal-office selector and shared-task expectations in office-desk; update it to enter Jevica’s office and retain account-private desk persistence, retry, focus and responsive checks. Focused desk browser verification pending before committing this fixture correction.

Fixture correction verified: `pnpm run test:experience office-desk` passed, covering private account tasks, persistence, editing, retry, download, focus and phone containment through Jevica’s office entry. All other hosted Verify jobs passed on 66cef17a. Push this test correction and rerun hosted gates before merge.
