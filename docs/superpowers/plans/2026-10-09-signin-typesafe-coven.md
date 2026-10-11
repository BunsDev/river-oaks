# Sign-in: TypeSafe and OpenCoven review

Objective: refine the latest local sign-in draft using ui.jev.works and OpenCoven UI, preserving admission behavior.

Workspace: external sibling river-oaks-signin-review-20261009; branch codex/signin-typesafe-coven-20261009; base 22d0043. Snapshot of the three-file draft and licensed IBM Plex assets from river-oaks-realism-20261008; source worktree and canonical dirty work preserved.

Owned files: preview/index.html, preview/src/access-gate.css, preview/public/fonts/ibm-plex/, preview/e2e/email-access.test.js, this ledger.

References: live ui.jev.works CSS (graphite #0c1015, panel #151a21, blush #f386a1, muted #a2a9b5, IBM Plex); OpenCoven/ui apps/specimens/src/coven-theme.css (lavender #9386d0, quiet neutral surfaces); OpenCoven/brand/ui/color-tokens.css (restrained glow).

Design: preserve the split district illustration/sign-in layout and IBM Plex display/body with mono captions. Introduce lavender orbital details, inset invite panel, subtle dimensional borders and one blush primary action. Keep the illustration as the signature rather than adding decorative panels. Maintain compact mobile, keyboard focus, reduced motion and long-page scrolling.

Checks planned: build; existing real-browser email/invite/CSP flow with responsive, focus and control contrast regressions; core npm run verify; desktop/mobile screenshot review; diff check.

Status: implementation, visual review, focused browser and core verification complete. Delivery remains pending. No commit, publication or deployment authorized. Live auth, human accessibility, Redis and native acceptance remain outside this UI verification.

## Review and focused evidence
- The inherited dark draft used input borders below 3:1 against their field fill. Added a computed browser contrast assertion; observed its expected failure before changing borders to #707583.
- Added keyboard Tab/focus-ring assertions. Preserved existing narrow-screen invitation reachability, email verification, waitlist admission, CSRF, revocation and CSP coverage.
- `npm ci --ignore-scripts` and `uv sync --locked`: passed. `npm run agent:doctor`: passed after installing the isolated Python environment. `npm run agent:list`: reviewed.
- `npm run build`: passed. `node --test preview/e2e/email-access.test.js`: 1 passed, 0 failed, 0 skipped.
- Inspected output/playwright/login-1440.png, login-390.png and login-320.png. Mobile uses a vertically scrolling gate; the full invitation action is exercised by the browser test, although the screenshot captures the initial viewport.
- `git diff --check`: passed. No auth/server logic changed. Local IBM Plex font includes its inherited source and OFL license receipts.

## Core result and handoff
- `npm run verify`: passed all 11 tasks; receipt `.runtime/agent/core.json` at base 22d0043 with this uncommitted patch. Agent 17 passed; preview 2504 passed / 1 skipped; server 276 passed / 102 skipped; desktop 9 passed; Python 141 passed / 2 warnings. Build, lint, format and secret scan passed. Synthetic demo verification returned its required exit 2.
- Core excludes mandatory Redis coverage (the server skips), broader browser profile, dependency audit, native and live auth. One preview skip also remains; no claim of full acceptance. Build retains existing large-chunk warning.
- Ready for review: desktop/mobile screenshots in output/playwright/. No commit, push, PR, merge or deployment performed. Preserve this worktree and the original draft worktree until the chosen patch is delivered; not safe to archive/remove them with uncommitted changes.
- Next delivery step: review the design, then commit this verified patch and open a PR when requested.
