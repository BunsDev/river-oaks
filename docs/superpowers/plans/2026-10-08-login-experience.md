# TypeSafe Place login and connection

## Objective
Modernize sign-in and town connection screens using the documented retrofuturistic garden district direction; reproduce and patch the hosted connection failure without changing authorization or durable production state.

## Ownership
Isolated worktree `river-oaks-login-20261008`, branch `fix/login-experience-20261008`, based on `90c4c49`. Intended ownership: access entry markup/styles, multiplayer connection lifecycle, focused regressions and acceptance evidence. Other worktrees and canonical dirty state are preserved.

## Design
Ivory ceramic #f7f7ee, deep teal #153f42, glass teal #507f80, champagne #b59a65, rose #ecd4dc, mint #d9e8df. Restrained existing sans typography for brand/display, system body and small utility captions. Desktop: garden-district illustration beside a compact sign-in panel; mobile: compact identity and form. A small orbital district drawing gives this entrance its character. Email, GitHub and invite redemption keep their current security boundaries. Connection screen uses the same surfaces with clear loading, recovery and terminal states.

## Checks
- Reproduce connection failure and retain safe diagnostics (no credential values).
- Focused behavioral regressions: connection admission/readiness/reconnect and access flow.
- Browser fixture sign-in, keyboard/mobile layout, successful town admission and recovery.
- `npm run verify`; exact hosted CI before delivery.
- Hosted signed-in connection and physical doorway traversal after delivery.

## Evidence and gaps
Prior live Chrome reached an authenticated connection gate and repeated reconnect. Deployment logs had session/ticket HTTP 200 and WebSocket 101. This does not localize failure after upgrade. Root cause remains to be established. Human accessibility, native runtime and target GPU performance are separate acceptance.

## Investigation and implementation
- Native Chrome probe counts only open/message/close events and known close reasons. Captured: one open, zero messages, close 1013, `Town temporarily unavailable.` This points to the server admission exception path before the first snapshot.
- Added fixed reason classifications and recovery diagnostics. No request, identity, ticket, raw exception or saved world is logged. No change to checkpoint acceptance or authorization.
- Redesigned anonymous and connection screens, preserving email, GitHub, invitation and keyboard recovery journeys. Short-screen overlap regression failed before fixed grid tracks and passed afterward.
- Focused transport/world tests: 58 passed. Email browser flow and 1440/390/320 layouts passed. The first core run passed behavioral checks but the secret gate caught a fragment-unbuilt fake Redis URL; corrected the fixture without relaxing the scanner. Final `npm run verify`: all 11 tasks passed (tooling 17; preview 2498 pass / 1 pre-existing skip; server 272 pass / 101 Redis skips covered separately; desktop 9; Python 141 with two existing warnings; build/lint/format/secret checks passed). `REDIS_URL=redis://127.0.0.1:16493 npm run test:server`: 384 passed, zero skips; the owned Redis service was stopped afterward. `RIVER_OAKS_SHARED_REPORT=login-shared-20261008.json npm run test:shared required`: all nine journeys passed. `node --test preview/e2e/email-access.test.js`: one complete flow passed including layout regression. Screenshots: `output/playwright/login-1440.png`, `login-390.png`, `login-320.png`.

## Delivery sequence
First deliver the verified entrance and safe diagnostics, then inspect the hosted admission classification and patch its reproduced cause. Do not claim the hosted connection is fixed until the town opens and walking is verified.

## Review
Independent source review found no correctness, authorization or privacy blockers. Corrected small-text contrast for kickers, placeholders and reviewer identifiers; computed ratios meet 4.5:1. Redis propagation coverage and extra diagnostic categories were optional suggestions.

## Next step
The entrance and diagnostic stage passed hosted CI at `9b4f280`. Live diagnostics
identified join/checkpoint_invalid/invalid_envelope. The narrow state-preserving repair
and final local verification are recorded in `2026-10-08-town-checkpoint-recovery.md`.
Hosted signed-in admission now passes after a recognized, state-preserving migration.
Physical hosted walking and exact-head CI remain separate delivery checks.
