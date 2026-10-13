# IPIC Photo Interior Implementation Plan

> Execution: superpowers:executing-plans, inline implementation with final independent review.

**Goal:** Deliver the referenced interior and a verified shared street-to-auditorium visit in this repo.
**Architecture:** Extend only the mapped IPIC room with a pure floor/obstacle/seat plan. Reusable Three.js meshes consume that plan; client and server consume the same movement and seating data. Export the scene as GLB for Blender/native handoff.
**Tech Stack:** Existing JS ESM, Three.js, Node tests, Playwright, GLTFExporter.
**Spec:** docs/superpowers/specs/2026-10-13-ipic-photo-interior-design.md

## Global constraints
- No tenant relocation, protocol bypass, paid inference, or generated image geometry evidence.
- Heights and layout are photo-inferred estimates, with provenance and explicit limits.
- Shared server authority; deterministic geometry; dispose GPU resources.
- Web evidence is not Unreal or survey acceptance.

## Review focus
- Escalator entry/exit continuity and furniture body clearance.
- Shared sit/stand, occupied seats, checkpoint recovery and spoofed height rejection.
- Other stores and generic worlds unchanged.
- Exported material/texture loading and disposal.
- Production scene includes IPIC and browser errors remain absent.

## Tasks
1. [x] Shared plan and movement: add photo-specific plan, room specialization, floor sampler, focused traversal tests; run existing store/walking tests.
2. [x] Geometry/assets: build reusable reception, escalators, mural, lounge/bar, corridor, auditorium; add production hook, export path and provenance; inspect rendered views.
3. [x] Shared seats and e2e: wire stable cinema seat IDs into existing authority; prove enter/walk/sit/stand/checkpoint/return, client and real local transport.
4. [x] Verification and authorized draft-PR publication: focused suites, core gate, browser review, GLB validation, independent review; record limitations and prepare branch/PR.

## Session ledger
- Base 05667c60230af877d7f9687bd2d25331e408c7d1, isolated sibling worktree. Primary clean before our task claim. Other live task entries preserved.
- Baseline: 15/15 store-room and walking tests passed. pnpm locked install passed. Doctor identified missing gitleaks and Python environment; setup in progress.
- Ruling: preserve the existing single-valued XY support contract with two sequential ramps and connected zones inside the allocated bay. This avoids altering unrelated movement and neighboring ground-floor tenants. Cost: the inferred circulation topology needs revisiting after survey measurements.
- Original 44 photos retained with SHA-256 manifest. Generated previews excluded from reconstruction inputs.

- Shared-plan regression: 18/18 tests passed (IPIC traversal, ordinary store rooms and walking). Full return route clears furniture and exits the entrance throat.
- Environment: locked JS/Python setup succeeded; gitleaks 8.30.0 downloaded. Pinned Chromium download unavailable; testing a compatible standalone browser binary without changing project dependencies.

## Verified implementation, 2026-10-13
- Shared plan, scene, original photo manifest, GLB and packed Blender project are implemented. Only the named IPIC tenant receives this interior.
- Independent review found rail/body collision mismatches and missing furniture-arm/planter footprints. Added failing regressions, aligned rail dimensions, covered props and preserved clear cushion centers. Widened auditorium row spacing so the existing authoritative stand search has a clear exit. Moved the inferred mural boundary to keep both escalator lanes connected. Glass railings no longer act as tall opaque sight blockers.
- Added occupied-seat rejection and restored-session stand/walk/exit coverage. Focused final command: `node --test preview/tests/ipic-interior.test.js preview/tests/ipic-model.test.js server/tests/ipic-interior.test.js preview/tests/conversation-sight.test.js` — 10 passed, zero failures/skips.
- Final core command: `PATH=/tmp/ipic-bin:/tmp/ipic-tools:$PATH corepack pnpm run verify` — passed at 2026-10-13T21:24:04Z. Tooling 76 passed; preview 2952 passed/1 existing skip; server 478 passed/140 Redis cases skipped (no REDIS_URL); desktop 54 passed; Python 141 passed. Build, Ruff, formatting, expected offline-demo result and secret guard passed. This is core, not full verification.
- Browser: `IPIC_CHROMIUM=/root/.cache/ms-playwright/chromium_headless_shell-1161/chrome-linux/headless_shell node preview/e2e/ipic-runner.mjs` — passed all four production-control/real-local-server checks: enter and climb, UI seating confirmed by server, keyboard stand, walk downstairs and exit. Zero page errors. Saved-session behavior is covered separately by the server regression.
- Export: same browser override with `node scripts/export-ipic.mjs` — five actual material views inspected, zero page/WebGL errors. Compatible Chromium 134 used because the pinned download was unavailable; repository dependencies unchanged. Final GLB is 12,394,500 bytes, 57 meshes, 131,284 triangles; embedded images capped at 1536 px. Original photos retain full resolution.
- `/tmp/ipic-tools/blender-4.2.3-linux-x64/blender --background --threads 2 --python scripts/export-ipic-blender.py` — imported final GLB and saved 10,101,846-byte Blender project with 12 packed images. Render/build scripts retain reproducible source; arbitrary manual Blender edits do not round-trip to game code.
- Retained review views and receipts: `docs/ipic-review/`. Runtime software visit proves controls/authority; standalone material screenshots prove rendering only, not target-device performance.
- Scope limits: inferred sequential floor plan, estimated dimensions and eight-seat sample auditorium; static escalator treads and visual-only lift doors. No survey/pixel-perfect claim, Unreal import acceptance, Redis/full browser suite, live auth, accessibility audit, target GPU test, merge or deployment.
- Delivery: preparing signed feature-branch commit and draft PR. Normal git push has no local credentials; GitHub connector used for repository delivery. Other task claims and the primary checkout remain preserved.
- Lifecycle check: `project:check --tasks ../river-oaks/docs/project-management/tasks.json` found 22 existing task records whose branches live outside this fresh clone; no IPIC ownership gap. Those records were preserved. Started with one primary worktree and added one owned feature worktree; both remain. Remote main advanced during implementation; this branch requires the ordinary up-to-date CI/merge gate before landing.

## Initial publication blocker (resolved by user authorization)
- The 80-file staged patch was verified and uploaded as Git blobs. GitHub tree `357971eeaec64596cd328586031a5e4d6bf60c9a` exactly matched `git write-tree` locally. A final worktree Gitleaks scan found no leaks.
- GitHub connector created commit object `80b0ccd723eb010a309271f95ebdd2eeb0fdaea0`, but its verification response was `verified: false, reason: unsigned`. The connector exposes no signing parameter and this checkout has no signing configuration or git-push credentials. No feature branch ref or PR was published from that object.
- `docs/agent-workflow.md` requires signed commits. Publication therefore needs signing-capable access or an explicit user exception to that repository instruction; no branch protection or authentication rule was changed.
- Implementation, exports and verification are complete locally on `feat/ipic-photo-interior-20261013` in `/workspace/scratch/8304a3c9d0ca/river-oaks-ipic`. All changes remain staged for review; the task is blocked, not delivered or retired. Both worktrees are retained.
- Next step: resolve signed publication, publish the exact reviewed source/assets with this updated ledger, open the prepared draft PR, and run the ordinary hosted/up-to-date gate before any separately authorized merge.

## Publication authorized, 2026-10-13
- User explicitly approved publishing an unsigned draft PR as an exception to the repository's signed-commit instruction. This exception applies to this IPIC delivery; no repository policy file or protection setting is changed.
- Resume publication using the existing verified asset blobs. Rechecking the staged tree before the GitHub branch/PR handoff; retain this feature worktree for review.

## Published draft PR
- Draft PR: https://github.com/BunsDev/river-oaks/pull/343 on `feat/ipic-photo-interior-20261013`; initial implementation head `a9ea1b48b0767ce3374197ddb522350af2beda02`.
- User-approved unsigned publication is complete. GitHub's published tree exactly matched the local staged tree. A fresh full core run passed at 2026-10-13T21:36:42.583Z with the same counts/skips reported above. This follow-up changes handoff metadata only.
- GitHub reported the PR mergeable, with its branch behind main; up-to-date hosted checks remain a later merge gate. No merge or deployment was performed. Task remains active for review rather than delivered/retired.
- Local feature branch tracks the published branch; both primary and feature worktrees are retained. Next action: review PR #343 and its visual/layout limits, then satisfy hosted acceptance and separately authorize landing.
