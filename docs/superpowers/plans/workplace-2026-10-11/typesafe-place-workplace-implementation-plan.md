# TypeSafe Place: River Oaks Integrated Workplace Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` or `superpowers:subagent-driven-development` when implementation is authorized. Work task-by-task with failing behavioral tests, focused changes, verification, and review. All boxes below are intentionally unchecked.

**Goal:** Deliver one believable in-world studio where a player-controlled companion performs one bounded useful task and returns an inspectable result without taking away the player's decisions.

**Architecture:** Extend the existing Three.js client and authoritative Node/Redis world through a focused workplace domain. Separate spatial presence, task execution, private data and authority. Run task work outside render/simulation ticks through replaceable provider adapters.

**Tech Stack:** Existing plain JavaScript ESM, Three.js/Vite, Node, Redis, current HTTP/WebSocket auth boundaries, existing browser/Node test harnesses; optional Python bridge reuse. No framework or renderer migration.

**Spec:** [Companion design specification](typesafe-place-workplace-design.md), proposed for review, not yet an approved production specification. Suggested eventual repository locations are `docs/superpowers/specs/2026-10-11-typesafe-place-workplace.md` and `docs/superpowers/plans/2026-10-11-typesafe-place-workplace.md`. These files have not been committed to the repository.

**Baseline:** `BunsDev/river-oaks`, main `20edac0bb75d7c4e7b51e987d717e9f39413d0eb`, reviewed October 11, 2026. Pending #198, #200 and #209 must be reconciled. [R1, R7–R9]

## Global constraints

- Preserve TypeSafe Place, the selected landing direction, existing fonts/tokens, and brand accent `#F486A1`.
- Preserve The Driver and the Enchantress; The Favor workplace adaptation is proposed and its chapter placement is not final.
- Keep avatar/character identity separate from server-verified owner authority. Do not widen Jevica-only powers.
- Keep creator controls default-off and preserve existing WorkOS/waitlist/origin/CSRF checks.
- Shared spatial voice remains deferred; real SMS/calls and external writes are excluded from the first slice.
- One active companion and one active task per owner; three model turns, five read-only tools, 120,000 ms task deadline, at most three 262,144-byte artifacts.
- Paid execution is disabled without an explicit finite budget policy. Tests use fixtures and no paid services.
- Use meters for design and preserve `(east, up, -north)` mapping in Three.js. Do not move mapped neighbors to fit a room.
- Do not store provider secrets or private task content in client assets, world snapshots, logs or telemetry.
- Approval is bound to an exact proposed effect, resource/version and grant revision. No model output directly mutates shared state.

## Review focus

1. A revoked grant or stale worker still tries to commit an artifact or effect: Tasks 3, 5 and 7 must deny it.
2. A nearby stranger, screenshot/scene display or socket subscription exposes a private task: Tasks 4 and 6 must filter before transmission.
3. A service crash occurs after an effect but before acknowledgment: Tasks 5 and 7 must reconcile/deduplicate rather than replay blindly.
4. A wide avatar, occupied chair, touch keyboard or skipped intro blocks the journey: Tasks 2, 4 and 8 must test it physically.
5. Pending story/tooling changes drift underneath the branch: Task 0 pins sources; Task 8 rechecks integration before the final gate.

## Proposed ownership map

All new filenames are design proposals, not claims that they already exist. Known existing files below were located in repository reads/searches; Task 0 inspects the full call chain before modifying them. Test files remain at the existing glob-discovered directory level.

| Area | Proposed new files | Existing integration boundaries |
| --- | --- | --- |
| Shared validated messages | `preview/src/workplace-contract.js` | `preview/src/world-contract.js`; server/client consumers |
| Room and physical affordances | `preview/src/workplace-room.js`, `preview/src/workplace-fixtures.js` | `store-rooms.js`, `store-interiors.js`, `walking.js`, `navigation.js` |
| Companion presentation | `preview/src/workplace-companion.js` | `prince-companion.js`, `companion-navigation.js`, `avatars.js`; do not inherit admin roles |
| Tasks and authority | `server/workplace/policy.js`, `registry.js`, `tasks.js`, `worker.js`, `adapters.js`, `artifacts.js`, `notifications.js`, `api.js` | `server/world.js`, `server/app.js`, `server/redis-room.js`, `server/events.js`; inspect hosted routing too |
| Accessible workplace UI | `preview/src/workplace-panel.js`, `preview/src/workplace-story.js` | current People/Places, main.js composition, existing events UI and settings |
| Validation and evidence | `server/tests/workplace-*.test.js`, `preview/tests/workplace-*.test.js`, `preview/e2e/workplace.js` | `preview/e2e/shared-runner.js`, `config/agent-workflow.json`, existing verification scripts |

Do not place every feature in main.js or world.js. Register small adapters at their composition roots. Do not impose this proposed structure over a newly merged equivalent implementation.

## Task 0 — Reconcile canon, code and work ownership

**Outcome:** A reviewed scope record and an executable baseline, without changing public product behavior.

**Dependencies:** None. **Owner:** Integrator with narrative/environment leads.

- [ ] Inspect `git status --short`, worktrees and task register; preserve all unrelated work. Create an isolated sibling worktree only when implementation is authorized.
- [ ] Re-read root and scoped AGENTS files, current branch SHA, lockfile and scripts. Read PRs #198, #200 and #209 and their current heads, not just these snapshots.
- [ ] Recover the October 8 pillars and Home/Work chapter documents through their recorded owners/branches. Record confirmed story facts separately from the hypothetical Favor adaptation and unresolved god placement. Do not block room/domain prototyping on optional cast embodiment.
- [ ] Record the exact venue/site candidate, footprint, entrance, runtime, avatar test set and visibility policy. Reject a site that replaces a named tenant or cannot preserve clearance; use a clearly labeled local fixture until an authored site is selected.
- [ ] Read room registration, world-command routing, public/private snapshot serialization, hosted route normalization, events UI, auth, Redis setup, and their tests. Update the ownership map to real call sites.
- [ ] Run current doctor and verification profiles and record actual results/skips. The reviewed main used npm; pending #198 adopts pnpm 10.34.5. Follow the resulting branch policy and never introduce a second lockfile.
- [ ] Save source/canon/ownership reconciliation and obtain design review before production geometry or external-provider execution.

**Exit:** No contradictory narrative placement, duplicate subsystem or unknown integration owner. Known runtime gaps are recorded rather than called passes.

## Task 1 — Define the workplace contract and fail-closed validation

**Files:** Create `preview/src/workplace-contract.js`; test in `preview/tests/workplace-contract.test.js` and `server/tests/workplace-contract.test.js`.

**Interfaces:** `validateWorkplaceRequest(input)` returns `{ok:true,value}` or `{ok:false,reason}`. Shared schemas define `TaskRequest`, `TaskView`, `EventPlanArtifact`, `CompanionPresence`, and `ApprovalRequest`. The client never supplies trusted owner, admin, grant issuer or credential fields.

- [ ] Write failing tests: reject unknown top-level fields, forged `ownerId`/`admin`, arbitrary tool names, invalid IDs, nonfinite numbers, oversized payloads, private-memory fields in public presence, and unsupported protocol versions.
- [ ] Run `node --test preview/tests/workplace-contract.test.js server/tests/workplace-contract.test.js`; confirm each fails for its intended missing behavior.
- [ ] Implement strict schema validation and the configured first-slice limits. Keep public presence fields distinct from private task fields; return plain failure codes.
- [ ] Run the focused tests and the existing world-contract regression suite. Record real counts.
- [ ] Commit only this validated boundary and its tests after implementation authorization.

**Exit:** Both client and service reject malformed messages; acceptance by the client does not substitute for server validation.

## Task 2 — Build and measure Studio 01

**Files:** Create `preview/src/workplace-room.js`, `workplace-fixtures.js`, `preview/tests/workplace-room.test.js`; integrate at inspected room/collision registries. Record evidence in `docs/level-design/workplace-studio-01/`.

**Interfaces:** `planWorkplaceRoom(world, site)` returns a room definition with metric transform, bounds, obstacles, entrances, station IDs and approach/seat/exit sockets. `buildWorkplaceFixtures(room, assets)` returns a Three.js object plus `dispose()`.

- [ ] Write failing tests for footprint containment, no neighbor overlap, unique station IDs, reachable approach/exit sockets, and preservation of existing doorway/ground transforms.
- [ ] Run `node --test preview/tests/workplace-room.test.js`; confirm intended failures.
- [ ] Produce a graybox, not final art: entrance, four workstations, review area, quiet nook and circulation. Start with the spec's proposed dimension anchors; do not force the illustrative 12 × 9 m room into an incompatible footprint.
- [ ] Register the room and collision data in both client and authoritative movement paths identified by Task 0. One geometry manifest must drive both.
- [ ] Walk ROUTE-01 entrance→desk→review→exit and ROUTE-02 courtyard→studio→courtyard with occupied seats, the largest approved avatar envelopes and camera modes. Record CAM-01 entrance, CAM-02 workbench, CAM-03 seated review and CAM-04 return view.
- [ ] Run room, walking, navigation and relevant existing store tests; review actual captures before approving art replacement. Commit the tested blockout separately.

**Exit:** The room fits and works while inhabited. No shader polish compensates for a bad plan. Physical-route acceptance remains NOT TESTED when no renderer is available.

## Task 3 — Implement identity, workspace membership and grants

**Files:** Create `server/workplace/registry.js`, `policy.js`, `api.js`; tests `server/tests/workplace-policy.test.js`, `workplace-api.test.js`.

**Interfaces:** `authorizeWorkplaceAction(actor, proposal, state, now)` returns a decision with reason and policy revision. `connectAgent(actor, connectionRequest)` returns only a safe connection view. `revokeGrant(actor, grantId, expectedRevision)` invalidates authority atomically.

- [ ] Write failing tests for owner mismatch, foreign workspace/world/resource, expired/revoked grants, ban/waitlist changes, admin-avatar impersonation, unknown provider, missing origin/CSRF, and link replay.
- [ ] Run `node --test server/tests/workplace-policy.test.js server/tests/workplace-api.test.js`; verify intended failures.
- [ ] Derive identity from existing authenticated server context. Add scoped, expiring grants and distinct credential references; no raw browser-provided provider URL is contacted by default.
- [ ] Add registry/API handling with existing guards and feature flags. Account-specific assignment is separate from creator/publishing privileges.
- [ ] Verify denied actions create no mutation, network effect, artifact or unauthorized read. Re-run relevant current auth/gateway tests and commit the boundary.

**Exit:** A companion's personality or appearance cannot widen authority. Revocation invalidates future actions even when the old model response arrives later.

## Task 4 — Add embodied companionship and station occupancy

**Files:** Create `preview/src/workplace-companion.js`; extend task-specific authoritative presence at the inspected server integration boundary; tests `preview/tests/workplace-companion.test.js`, `server/tests/workplace-presence.test.js`.

**Interfaces:** `projectCompanionPresentation(presence, taskView, connectionHealth)` returns a finite animation/presence state. `reserveStation(actor, companionId, stationId, expectedRevision)` returns a reservation/expiry or a denial. Release/renew use the same reservation identity.

- [ ] Write failing tests: two actors cannot occupy one station; blocked approaches wait; dismissal releases a station; expired leases release occupancy; lost provider heartbeat cannot imply task progress; task state is independent of avatar location.
- [ ] Run the two focused suites and confirm intended failures.
- [ ] Reuse existing bounded movement/navigation helpers where compatible, with explicit owner-neutral adapters. Preserve Prince Jev's current identity, privileges and tests.
- [ ] Implement approach, align, sit/stand, work/review, pause, failure and exit presentation. Movement follows service-approved targets, never raw model coordinates.
- [ ] Render with two owners and two companions, then the eight-occupant envelope. Verify no wall crossing, jitter, clipping at interaction sockets or door lockout. Run existing companion tests and commit.

**Exit:** The agent feels physically present, but animation does not assert execution success. A private nearby conversation is not part of a public snapshot.

## Task 5 — Execute a bounded task and save a real artifact

**Files:** Create `server/workplace/tasks.js`, `worker.js`, `adapters.js`, `artifacts.js`, `notifications.js`; tests `server/tests/workplace-tasks.test.js`, `workplace-recovery.test.js`, `workplace-artifacts.test.js`.

**Interfaces:** `submitTask(actor, request)` returns a private task view. `runTask(taskId, dependencies, signal)` performs a bounded leased attempt. `adapter.execute(context, {signal, budget})` returns validated results or a typed error. `commitArtifact(lease, artifact, expectedTaskRevision)` and notification enqueue occur through a transaction/outbox boundary.

- [ ] Write failing tests for one-active-task enforcement, deadline/turn/tool/artifact caps, idempotent submission, worker replacement, stale lease commits, cancellation/revocation, provider timeout, malformed artifacts, private reads and duplicate completion delivery.
- [ ] Run the three focused suites; use local Redis for atomic/concurrent variants and fail the required gate if those tests skip.
- [ ] Implement a deterministic fixture `event_plan` adapter and separate worker process. Do not call a model in the render loop, world simulation tick or an in-memory browser interval.
- [ ] Persist admission, execution lease/revision, checkpoints, artifact references and outbox state. Prove the chosen Redis deployment's durability/recovery properties before promising work across outages; use an artifact store with authorization checks.
- [ ] Add one supported remote adapter behind the same contract after explicit provider and spend approval. Restrict context to approved brief/public world data and expose no external write tools. Exercise cancellation and invalid outputs with a mock transport before any authorized live evaluation.
- [ ] Kill the worker before/after commit, replace the gateway, replay callbacks and reload the client. Confirm one canonical artifact/result and no stale-writer effect. Commit verified behavior with recorded limits.

**Exit:** The task survives a tested worker restart, respects its scope, and produces a verifiable artifact. A failed/cancelled job cannot present itself as completed.

## Task 6 — Make the work accessible, private and inspectable

**Files:** Create `preview/src/workplace-panel.js`; tests `preview/tests/workplace-panel.test.js`, `server/tests/workplace-privacy.test.js`; integrate current People/Places/settings rather than creating another rail.

**Interfaces:** `renderWorkplacePanel({taskView, artifactView, permissions, onAction})` renders the same filtered data as the desk/whiteboard. `getArtifactView(actor, artifactId)` is server-authorized; shared views are explicit redacted copies.

- [ ] Write failing tests for keyboard-only connect/delegate/review/pause, focus restoration, draft preservation, mobile input, reduced-motion intro, safe text rendering and an unauthorized second account's HTTP/socket/deep-link access.
- [ ] Run the focused suites and relevant current HUD/modal regressions.
- [ ] Add compact My agent and studio entry points; task detail exposes result, source/context provenance, uncertainty, actual tool activity and controls. No chain-of-thought display.
- [ ] Add private in-app completion/approval notices with deduplication and mute. Add explicit remember/share/delete actions; never share owner memory because a screen is physically visible.
- [ ] Verify all spatial actions have equivalent accessible non-spatial controls, then perform human keyboard/touch/screen-reader review. Commit with automated and human results separately recorded.

**Exit:** The player can tell what happened, what did not happen, and how to stop it, without needing a perfect 3D camera position.

## Task 7 — Connect The Favor to the existing gathering service

**Files:** Create `preview/src/workplace-story.js`; add a narrow approval/effect adapter beside `server/events.js`; tests `server/tests/workplace-approval.test.js`, `preview/tests/workplace-story.test.js`.

**Interfaces:** `advanceWorkplaceStory(current, verifiedEvent)` returns the next authored beat. `approveEventDraft(actor, {taskId, artifactRevision, payloadHash, grantRevision})` validates approval and calls the existing event service only if the current host rules also permit it.

- [ ] Write failing tests for refusal/defer paths, story advancement only after verified events, edited artifact invalidating approval, stale permission/venue, duplicate publish, changed capacity and foreign owner approval.
- [ ] Run both focused suites and existing `server/tests/events.test.js`; confirm new tests fail for intended behavior.
- [ ] Integrate the approved Favor beats without changing the main romance or settling the other gods' embodiment. Use authored narrative state, not arbitrary LLM-written canonical facts.
- [ ] Bind approval to exact data and recheck current event constraints. Add an idempotent receipt at the authoritative effect boundary; do not change event-store internals unless necessary and regression-tested.
- [ ] Run the journey: accept or decline favor, create plan, leave, return, review, publish only as an eligible host, RSVP as another account, cancel and revisit. Verify no automatic guest messages or private-home access. Commit.

**Exit:** Useful work pays off socially and the player owns the decision. Preparing an event plan never implies publishing it or broadening creator access.

## Task 8 — Art, load/recovery validation and closed-alpha gate

**Files:** Approved assets/receipts under the existing asset conventions; `preview/e2e/workplace.js`; targeted performance/privacy harnesses and `docs/level-design/workplace-studio-01/` evidence. Register required tests in existing runners/config.

- [ ] Create the regression captures before replacing blockout art: fixed cameras, time of day, resolution, quality and occupancy. Add disposal/re-entry regressions before loading final assets.
- [ ] Replace approved modules with metric PBR assets, collision proxies, interaction sockets and detail levels. Validate color textures versus data textures and test compressed loading on the pinned runtime. Avoid wholesale district material changes.
- [ ] Run four security/recovery scenarios at minimum: hostile world text; cross-owner artifact retrieval; revoke while running; crash immediately after a proposed effect. Test receipts, not model assurances.
- [ ] Run occupied daytime/evening routes and repeated room entry on the chosen desktop and mobile/browser matrix. Measure p95 frame time, incremental payload, GPU memory, draw calls, task latency, costs and disconnect recovery. Record unsupported devices honestly.
- [ ] Run focused suites, current doctor, core and full verification, shared journeys, auth/gateway checks and hosted CI. Run Electron checks when desktop integration changed. Do not count browser success as Unreal acceptance.
- [ ] Reconcile current main/PR drift and review the whole branch. Enable only for an allowlisted consenting alpha cohort, with global/per-agent kill controls and rollback that preserves artifacts while disabling new work.
- [ ] Conduct uncoached sessions and record comprehension, perceived control, useful artifacts, voluntary return and whether the studio enhances or distracts from the social world. Review before adding external execution or contact channels.

**Exit:** Evidence supports the actual first-slice claim. No unresolved critical authority/privacy defect in the maintained suite; real visual/accessibility/performance evidence exists for the declared devices. No merge/deployment without separate authorization.

## Dependency order and parallel work

Task 0 precedes all. Tasks 1 and 2 can proceed separately once the design is reviewed. Task 3 consumes Task 1. Task 4 consumes Tasks 1–3. Task 5 consumes Tasks 1 and 3; it can proceed beside embodiment behind the shared contract. Task 6 consumes the private projections from Tasks 3–5. Task 7 consumes Tasks 5–6 and the reconciled story. Task 8 gates release.

Assign one integrator to shared composition files. Environment and backend work should own disjoint files; use fixtures to connect them early rather than waiting for final art or live providers.

## Later work packages — not authorized by this plan

1. Real research/creative/code execution: separate sandbox threat model, network policy, artifact scanning, resource budgets and provider proof.
2. Shared projects: project-scoped grants, explicit redacted artifacts, meeting consent and no transitive delegation of personal tools.
3. Push, SMS, then calls: separate channel/recipient consent, local quiet hours, rate/spend caps, stop/revocation and appropriate legal/privacy review. No spatial-voice change implied.
4. Additional offices/home offices and specialization: reuse the proven kit and controls; no mandatory rent, new currency or automated competitive advantage.
5. Native/Unreal parity: separate build, movement, scene, asset and hardware acceptance. It is not established by this browser plan.

## Delivery record for this planning request

**Produced:** This implementation plan and its companion design specification.  
**Not performed:** Source edits, commits, PR changes, tests, rendered walkthroughs, paid tool/model calls, production mutations, migrations, deployment or user notifications.  
**Remaining design gates:** Exact site; full pillars/Home/Work manuscript reconciliation; cast embodiment/chronology; first remote adapter and spending policy; target hardware matrix; persistence and retention policy review.

## Source register

Reviewed October 11, 2026. Repository links are pinned to the inspected revision unless explicitly marked as pending PR work. These sources establish their stated scope, not live deployment acceptance.

- **R1 — Repository instructions and runtime boundaries:** [AGENTS.md](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/AGENTS.md), [architecture.md](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/docs/architecture.md), [package.json](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/package.json).
- **R2 — Current product documentation:** [README.md](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/README.md).
- **R3 — Room geometry and rendered interiors:** [store-rooms.js](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/preview/src/store-rooms.js), [store-interiors.js](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/preview/src/store-interiors.js). Selected source ranges were inspected, not every implementation branch.
- **R4 — Existing companion movement:** [prince-companion.js](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/preview/src/prince-companion.js), including its clearance and bounded locomotion implementation; imports/test excerpts for companion-navigation were also inspected.
- **R5 — Gatherings and authority:** [world-events.md](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/docs/world-events.md), [events.js](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/server/events.js).
- **R6 — World and level-design workflow:** [world-direction.md](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/docs/world-direction.md), [level-design-skills.md](https://github.com/BunsDev/river-oaks/blob/20edac0bb75d7c4e7b51e987d717e9f39413d0eb/docs/level-design-skills.md). Older appearance descriptions do not override Val's latest approved character references.
- **R7 — Pending companion storybook:** [PR #200](https://github.com/BunsDev/river-oaks/pull/200), draft/open at review; inspected head `f9878af44ac60c2eaef70647b1c573d1e21dc173`. The text declares companion-layer world canon, but its code integration is not merged and its placement questions remain open.
- **R8 — Pending arrivals/tooling integration:** [PR #198](https://github.com/BunsDev/river-oaks/pull/198), open at review; inspected metadata at head `bc94c21fc95c2c84abdf751d90e426561e828994`. PR description records arrival cutscenes and pnpm-only tooling; this review did not rerun its checks.
- **R9 — Pending task ownership work:** [PR #209](https://github.com/BunsDev/river-oaks/pull/209), open in the reviewed PR search. Its description records task reconciliation and worktree ownership. Re-read before implementation.
- **P1 — Project continuity:** `typesafe-place-river-oaks-agent-handoff-2026-10-06.md`, retrieved from Val's Library. Preserves branding, default-off creator controls, spatial-voice deferral, and the original Guest List facts. It is a dated handoff, not current runtime proof.
- **T1 — Three.js asset loading:** [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), official documentation; glTF, compressed texture, and mesh decoder integration points.
- **T2 — Three.js color and lighting:** [Color management](https://threejs.org/manual/pages/color-management.html), [LightProbe](https://threejs.org/docs/pages/LightProbe.html), official documentation. Validate behavior against the project's pinned version.
- **T3 — Remote-agent interoperability:** [A2A specification](https://a2a-protocol.org/latest/specification/), [official MCP security guidance](https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/docs/2026-07-28/tutorials/security/security_best_practices.mdx). Protocol support is not application authorization.
- **T4 — Optional execution provider:** [Daytona network limits](https://www.daytona.io/docs/en/network-limits/), [resource limits](https://www.daytona.io/docs/limits). These are evaluation inputs, not a selected integration or proof of this project's isolation.
