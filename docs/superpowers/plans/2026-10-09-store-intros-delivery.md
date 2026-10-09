# Sign-in, Harry Winston and first-visit intro delivery

User authorized commit, push and merge to main on October 9. Integration branch:
`codex/store-intros-signin-delivery-20261009`, external worktree
`river-oaks-delivery-20261009`, based on origin/main 1018d0c.

Copied only the reviewed source, licensed fonts, task ledgers and test receipts
from the two task worktrees. No credentials/private runtime files copied. Canonical
main's unrelated dirty edits and other active PR branches remain untouched.
This authorization supersedes the earlier delivery-pending notes in those ledgers.

Owned scope: TypeSafe/OpenCoven sign-in polish; Harry Winston facade and planting
reference interpretation; first-visit store camera sequence with private Redis-backed
account markers; focused regressions and receipts. Pixel-perfect photo/topographic
acceptance remains open as documented in the reference comparison.

Plan: verify combined source on current main; review diff; commit and push;
create PR; inspect hosted checks/reviews; merge only after applicable gates pass;
verify remote main includes the merged change. No deployment claim.

Checks/results: pending integrated verification.

## pnpm-only scope added by user

Pinned pnpm 10.34.5; imported the npm lock without intentional dependency upgrades,
then removed package-lock.json. Added strict package-manager settings, lifecycle
and public-script guards, approved Electron/esbuild build scripts, frozen CI/Vercel
installs, pnpm CI cache, Docker inputs, asset CLI invocations, verifier catalog and
installed-dependency detection. Updated current docs/scoped agent instructions;
historical reports retain the commands actually run. Dependabot's ecosystem remains
`npm`, its required identifier for pnpm. Audit hashes now use pnpm-lock.yaml and
read installed versions. Also added the missing Vercel intro endpoint rewrite.

Official pnpm 10 settings: https://github.com/pnpm/pnpm.io/blob/main/versioned_docs/version-10.x/settings.md
Script argument contract: https://github.com/pnpm/pnpm.io/blob/main/docs/cli/run.md

## Integrated local verification

- `pnpm install --frozen-lockfile`: passed, pnpm 10.34.5.
- `pnpm run agent:doctor`: passed.
- `pnpm run verify`: core passed after migration; includes the package-manager
  behavioral regressions. Standard core skips remain outside its scope.
- `pnpm run test:security:e2e`: 2 passed, zero skipped (sign-in, invite, CSP/debug).
- `RIVER_OAKS_E2E_REPORT=store-intro-delivery-20261009.json pnpm run test:experience store-intro`:
  11 browser assertions passed, zero page errors on the integrated source.
- `pnpm audit --audit-level=moderate`: no known vulnerabilities.
- Real `npm run build` subprocess: rejected before Vite execution, expected exit 1.
- `git diff --check`: passed.

Earlier task ledgers retain focused Redis and two-client route receipts. Hosted
required checks remain the merge gate. Container build, live auth, production,
native runtime, human accessibility and pixel-perfect scenery remain unclaimed.

## Rebase and container follow-up

Rebased cleanly onto 9c31050 after the landing mockup and glass panels merged.
`pnpm run verify` and the 11-assertion intro journey passed again on that base.
`docker build -t river-oaks-pnpm-check:20261009 .` exposed the omitted chauffeur
policy JSON; included that exact build/runtime input. The image now builds, and
`docker run --rm --network none --entrypoint node ...` successfully imports
`server/chauffeur.js` and `server/town.js` with production dependencies.

The first hosted preview run passed install/audit/unit/Redis/build checks but its
security journey attempted the sidebar while the connection modal blocked input.
The harness now requires the real roster's connected state and a non-inert app
before clicking, and reports safe gate state on failure. Local security browser
rerun: 2 passed, zero skipped. Hosted rerun remains pending; no auth gate bypass.
