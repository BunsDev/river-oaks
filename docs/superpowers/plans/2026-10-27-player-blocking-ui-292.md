# Resident blocking UI — #292

Implement the existing Block/Unblock controls in the real multiplayer roster and
Settings → Account. Preserve HTTP/CSRF authority; no client visibility filtering.
Base: main `5541f83`. Branch: `fix/player-blocking-ui-292-20261027`.

## Ownership

The fresh clone has one primary checkout and this sibling worktree. No originating
machine live register or sessions are accessible. The committed snapshot names old
character-persistence owners; it is not a fresh release. Checked all 16 open PR file
lists through GitHub: none changes multiplayer-client.js or sidebar.js. PRs #710,
#708, #707, #695, #691, #688 and #685 touch unrelated main.js hooks. Avoid main.js.
Coordination and exact scope posted on #292 (comment 6451036484); other branches
remain untouched. The newer account-safety and on-foot ledgers identify
`outdoor-residents-admin-controls-20261024`, owner `codex:road-bricks-20261024`, on
`fix/ipic-road-bricks-20261024`. That remote branch exists without an open PR. Its
published multiplayer client contains no Block wiring; compared its client/sidebar
with main and retained main's newer protocol/resume/account-safety integrations.
Unpublished work on the originating machine must still be reconciled before merge.
Local task claim: player-blocking-ui-292-20261027. Both local checkouts remain
preserved: primary main and this active feature; neither is a retirement candidate.

## Steps

- [x] Add failing regressions: session change during mutation/refresh, malformed or
  rejected acknowledgement, refresh failure, removed row and expired confirmation.
- [x] Attach blocks after authenticated admission; refresh on connection; detach on
  sign-out, terminal loss and disposal. Add and forget roster buttons. Add Settings
  list, refresh/error/retry, with session-safe announcements.
- [x] Run a real two-resident browser journey for Block, server suppression,
  Unblock, reconnect, world transition, sign-out/account switch and request failure.
- [x] Run focused client/server regressions and multiplayer journeys; build, Python
  and source/history scans pass. Broader gates were attempted and remain held below.
- [ ] Update blocking and App Review docs; publish a draft PR and verified #292
  evidence. No merge/deploy, production state or iOS acceptance claimed.

## Review focus

Late mutation must never refresh or announce for a new session. A rejected,
malformed or unconfirmed response must not announce success. An initial list failure
must not render a known empty list. Removed rows cancel confirmation and callbacks.
Fresh authenticated connections must reload persisted blocks; sign-out clears private
list/status. Unblock must not restore ended contacts or invitations.

## Implementation and review

Production changes are limited to `player-blocks.js`, `multiplayer-client.js` and
`sidebar.js`. No local filtering, backend policy changes or auth relaxation.
Auth attachment is fenced by attempt and logout epoch; detach only affects this
client's generation. The list rejects malformed/unacknowledged results and stale
reads. Removed rows and changed accounts cannot retain a confirmation or announce
late success. Account refresh errors remain visible and retryable.

One independent reviewer, with follow-up reviews, found stale-401 invalidation,
pending-logout reattachment and a browser-test triple-click race. All were fixed;
final production and fixture reviews reported no material findings. Two deliberate
mutations went red on the exact stale-401 and pending-logout assertions, then were
restored. Initial list/session regressions also failed before their fixes.

## Evidence

Machine-readable results and exact source SHA-256 values:
`docs/acceptance/player-blocking-ui-292/verification.json`.

| Verification | Result |
| --- | --- |
| Block-list/control unit tests | 14 passed, no skips |
| Blocks + connection/account deletion/moderation/voice UI regressions | 56 passed, no skips |
| Server `blocks*.test.js`, isolated Redis | 43 passed, no skips |
| Actual rendered two-resident `player-blocking`, required | 13 checks passed, no browser errors; 234.123 s |
| Production access/roster/Settings composition, required | 16 checks passed; includes native pointer actions, sign-out and account switching |
| Same interface, standalone development-world | 14 checks passed; includes both residents changing worlds with the persisted block |
| Real multiplayer client lifecycle, renderer omitted | 7 checks passed; stale 401, replacement disposal, pending logout and recovery |
| Production build | Passed |
| Python profile | Passed, 170 pytest cases; expected synthetic demo exit 2 remains a blocked real-world-data result |
| Security profile, Gitleaks 8.30.1 | Passed worktree and available shallow history (one base commit) |

Browser commands used `RIVER_OAKS_SHARED_SOFTWARE=1`, the named
`RIVER_OAKS_SHARED_JOURNEY`, and `node --import /tmp/block-ui-browser.mjs
preview/e2e/shared-runner.js <required|development-world>`. The external launch
adapter chose preinstalled Chromium 141.0.7390.37 headless shell with SwiftShader
because the pinned Chromium 156 archive was unavailable. No application behavior,
auth or thresholds changed. The rendered case activates the two actual click
handlers in one JS task because driver round trips can exceed the existing 4 s
confirmation under CPU rendering; the interface case exercises native double-click.
Neither is human or physical-device acceptance. CI uses its normal pinned browser.

## Broad gate holds and first failures

- `pnpm run verify` stopped at tooling: **284 passed, 5 failed**. The unchanged
  `scripts/tests/project-prune-cancel.test.js` failures are:
  `12-hour cancellation fails closed for recent touches and live activity`;
  `explicit six-hour cutoff accepts work older than six hours but newer than twelve`;
  `authorized stale cancellation restores Git and local files before guarded removal`;
  `cancellation bundles only the commits the default branch lacks`;
  `verified partial archive can resume when nested ignored Git data survives clean`.
  Every failure is `ps -axo command=` → `fatal library error, lookup self` in this
  sandbox. Explicit PS personality and a newer extracted procps did not resolve it.
- Preview profile: **incomplete**, killed at the runner's 600 s limit after 1,797
  reported passing cases. The earlier bare baseline run was interrupted for load;
  neither counts as a passing complete preview suite.
- Desktop: **127 passed, 1 failed, 4 skipped**. `on Linux the real status of a live
  process parses as not dumping` cannot read `/proc/<pid>/status` (ENOENT).
- The default isolated-Redis full server run was interrupted after observed failures
  in Heights rollout, both activation rehearsal origins, Redis combat hit delivery,
  and cross-instance account replacement/ban/logout. The bounded four-worker rerun finished: **1,365 passed, 2 failed, no skips**
  (417.881 s). Failures: `Redis fences Commons rollout and rollback by epoch and
  preserves durable state` and `Heights rehearsal from east-garden-commons-market-1:
  activation, occupants, stale overlap, rollback to the Commons and chained rollback
  to Gardens`. Both failed again in a serial isolated rerun (2 failed, no skips; 50.869 s):
  Commons returned `false` where `true` was expected, and Heights timed out waiting
  for Alice’s snapshot. Their causes remain unestablished; no blanket resource-flake
  or pre-existing-defect claim is made. These
  are outside the modified backend scope; no claim they are pre-existing. Preserve
  the first failures and inspect hosted results; no thresholds were weakened.
- Initial Python/security runs used Gitleaks 8.24.3 and failed three digest-allowlist
  tests/scans. Replaced it with CI's exact **8.30.1**, verified archive SHA-256
  `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`;
  both profiles then passed. No allowlist or secret rule changed.
- Earlier rendered attempts were interrupted or timed out during confirmation/
  full-scene reload. The final passing run uses a real socket reconnect and keeps
  the four-second confirmation policy. Early interface composition failures were
  fixture setup/port/theme/layout errors, corrected without changing production UI.

## Delivery and acceptance limits

Draft only while broad gates and ownership reconciliation remain open. The REST
connector produced an unsigned commit (`b8d02766`, GitHub reason `unsigned`); the
complete feature branch must be rebuilt through `pnpm run sign-branch
fix/player-blocking-ui-292-20261027 --apply` in a trusted authenticated checkout
before it can satisfy the merge guard. No signature requirement is waived.
This ledger records prepublication verification; the PR and #292 record delivery. No merge,
deployment, closing of #292 or iOS release approval. Fixture acceptance is distinct
from live WorkOS, hosted routing, physical
iOS, VoiceOver and human visual acceptance. Content filtering, moderation ownership
and response/notification operations, configured support/pre-sign-in support and
equivalent sign-in remain independent App Review gaps. Proximity voice remains
outside this block contract.
