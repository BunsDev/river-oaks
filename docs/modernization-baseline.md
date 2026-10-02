# Modernization baseline and first implementation

Observed October 2, 2026 against `d6b0f5e9ecb7c307d586a1e940ec5b566b23a65d`.
The primary checkout and freshly fetched `origin/main` matched and were clean.
This patch lives on `cody/modernization-foundation`, isolated from the active
movement/world review worktree. No commits, publication, deployment, or issues
were requested or created.

## Assessment

The [shared modernization plan](https://chatgpt.com/share/6ac030af-3ccc-83e9-b1fd-4012ec49623d)
has the right direction: retain the working browser client, authoritative Node
simulation, Electron shell, and Redis coordination; make River Oaks the first
world on a reusable platform. A creator publishing a second persistent world
without editing Git is a concrete product acceptance target.

Treat the 83 drafts as a program inventory, not one implementation batch. The
shared conversation was readable, but its sandbox ZIP, master prompt, and
individual issue bodies were not available in this workspace. This assessment
covers the visible first-tranche descriptions; it does not validate every draft,
dependency, estimate, or cited external-service claim.

My recommended order is to establish a repeatable shared-player journey, finish
hosted authentication/recovery acceptance, then design the smallest world-boundary
extraction. Define world identity, version compatibility, access checks, and
checkpoint routing around the existing simulation before choosing a replacement
runtime or database. Durable ownership and moderation need explicit separation
from rollbackable world snapshots. Scripting, commerce, XR, and large-scale
hosting remain separate design decisions, not prerequisites for proving the
second-world journey. Preserve the authored garden district and player identities
in `world-direction.md` throughout.

## First-tranche reconciliation

RO IDs below are planning labels from the shared conversation, not GitHub numbers.

| Proposal | Current classification | Evidence and disposition |
| --- | --- | --- |
| RO-001 baseline | Partial program baseline; this scoped receipt verified | Current source, local checks and proof gaps recorded here and in the JSON evidence below. Full draft reconciliation requires the unavailable pack. |
| RO-002 avatar readiness | Historical failure not reproduced | PR #91 reported a `woman-casual` timeout. The existing development journey passed all 25 checks, including Sable selection and remote rendering. Direct `loadResidentAvatar` also succeeded. No avatar repair is justified by this run; intermittent failure remains possible. |
| RO-003 CI coverage | Confirmed omission; changed locally | `.github/workflows/verify.yml` now runs the existing desktop unit suite and all shared journeys after Chromium installation. Local results passed; the edited workflow has not run on GitHub. |
| RO-004 mode docs | Confirmed stale statements; changed locally | README claimed the default needed WorkOS and solo was unavailable in production. `resolveMultiplayerMode` says development `auto`, production `off`, explicit `required` gates shared play. README and standalone build instructions now agree. |
| RO-005 contributor workflow | Requires scoped design | No tracked `AGENTS.md`/`CLAUDE.md` was found in the repository file lookup. Existing `docs/superpowers` records are not a reviewed contributor policy; no policy was installed from unavailable drafts. |
| RO-006 rights decisions | Maintainer decision remains | Tracked `*LICENSE*`, `*COPYING*`, `*NOTICE*` inventory returned character CC0 text only. Data README separately records ODbL and material provenance. Asset attribution does not establish a repository source or creator-content license; none was selected here. |
| RO-007 extraction decision | Proposed, not implemented | Keep `server/world.js` authoritative; review a versioned world boundary before adding a generic storage/platform subsystem. |
| RO-008/009 threat model and benchmarks | Not audited by this pass | Local correctness and two-player fixtures are not a threat model or capacity measurement. Retain these separate deliverables. |
| RO-010 protocol conformance | Design candidate | Define the first versioned world/protocol contract and old-client rejection/migration behavior before extracting it. No speculative API introduced here. |

## What current source establishes

- `preview/src/multiplayer-mode.js:resolveMultiplayerMode` resolves explicit
  `VITE_MULTIPLAYER` first, then the `VITE_SINGLE_PLAYER` compatibility flag,
  then development/production defaults. `waitForTown` already contains PR #91's
  bounded startup retry; it was preserved.
- `server/vite-town.js:sharedTownDevServer` starts the development town with
  loopback identities unless WorkOS is explicitly selected. The existing
  `multiplayer-dev.js` journey exercises two distinct identities and shared
  appearances, travel, building and mobile controls.
- `server/redis-room.js:COMMIT` checks lease ownership before atomically storing
  the checkpoint/view, trimming consumed operations, publishing replies, and
  renewing the lease. `runTick` discards tentative state on a failed fenced
  commit. This was source-inspected, not requalified against live Redis.
- `docs/multiplayer.md:Deployment readiness` explicitly retains real WorkOS,
  hosted authenticated sockets, instance replacement, logout and ban acceptance
  gaps. Historical provisioning/deployment receipts are not fresh production
  evidence. No credentials or production service state were changed or probed.
- The Dockerfile currently makes a default solo frontend. The documentation now
  identifies that limitation; changing a runtime variable alone cannot enable
  multiplayer in an already built client.

## Fresh verification

Machine-readable browser results: [modernization-foundation.json](../data/reports/modernization-foundation.json).

| Check | Observed result | Limit |
| --- | --- | --- |
| Preview unit suite | 616 passed | Existing product behavior; no rendering code changed |
| Desktop unit suite | 6 passed | Not native desktop UI acceptance |
| Server unit suite | 78 passed, 27 skipped | Redis-dependent cases skipped without a configured test database |
| Multiplayer mode tests | 5 passed | Resolver and bounded startup probe behavior |
| Authenticated shared journeys | 2 passed; 29 assertions | Test identities; not live WorkOS |
| Development shared journey | 25 assertions passed, no page errors | Existing town occupied port 8787; same journey and Vite plugin ran on isolated ports 5181/8791 |
| Production frontend build | Passed | Existing bundle-size warning remains; no deployment |
| Workflow validation | `actionlint .github/workflows/verify.yml` passed | Hosted runner execution pending |
| Worktree secret scan | `python3 scripts/check_secrets.py --all` passed | No full-history scan was requested or run |

The isolated development harness is retained locally at
`output/playwright/dev-isolated.mjs`; it changes only the fixture ports and
preserves the same journey assertions. Owned browsers and fixture servers were
closed; the pre-existing town was left running. The normal CI runner uses its
standard ports on the clean hosted runner. No timeout or assertion was weakened.

## Initial design scope and advancement criteria

This patch only repairs verified documentation and CI omissions. The avatar
observation is a successful reproduction attempt, not proof that the historic
intermittent failure is fixed.

Before starting the first platform extraction, review a small specification for
world identity and protocol versioning with: two independent world instances,
server-side admission, no cross-world commands/state, explicit incompatible
checkpoint handling, and an unchanged River Oaks player journey. Keep storage
migration and durable ownership semantics explicit in that review. This is a
recommendation, not implementation of that subsystem or approval of the full pack.
