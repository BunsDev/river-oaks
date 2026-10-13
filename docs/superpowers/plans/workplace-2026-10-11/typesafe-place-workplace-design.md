# TypeSafe Place: River Oaks — Integrated Workplace Design Specification

**Status:** Proposed design for review; not implemented or a replacement for approved canon.  
**Prepared:** October 11, 2026.  
**Repository baseline:** `BunsDev/river-oaks`, `main`, `20edac0bb75d7c4e7b51e987d717e9f39413d0eb`.  
**Working venue ID/name:** `workplace-studio-01` / Studio 01. Both are proposals, not final canon.  
**Companion document:** `typesafe-place-workplace-implementation-plan.md`.

## 1. Product decision

Build one physically believable, useful studio inside River Oaks before building a network of autonomous offices. The studio should feel like a place people inhabit, not a dashboard floating inside a room. A player can bring or create a companion, walk with it, delegate a bounded task, leave to socialize, and return to an inspectable result.

The reward is more room for living: friendship, creativity, good judgment, and shared accomplishments. Office attendance is never required to keep an agent functioning, preserve a relationship, or avoid losing resources. Equivalent task controls remain available without walking through the scene.

The core loop is **meet → choose a goal → delegate → enjoy the town → review → decide → celebrate**. No desk animation may claim actual work happened without a corresponding execution record.

## 2. Evidence and integration boundaries

The inspected repository is a Three.js/Vite browser world with an authoritative Node service, Redis-backed distributed state, a Python decision/speech bridge, an Electron shell, and a separate Unreal project. Existing room planning, procedural interiors, worker routines, Jev locomotion, and gathering APIs are useful foundations. These do not establish general imported-agent execution. [R1–R5]

`main` already contains the newer People/Places/chat/settings direction. Pending PR #198 changes arrivals and package-manager policy; PR #209 records concurrent task ownership. Reconcile these before modifying shared entry points. Do not create a new lockfile or second intro system. [R8–R9]

This review was read-only through connected GitHub and project files. No application tests, rendered walkthroughs, performance measurements, production calls, or deployments were performed. A local repository clone was attempted but the environment could not resolve GitHub. Exact integration call sites must be inspected in the working checkout during Task 0.

## 3. Story continuity

The newer storybook says its companion mythology sits beside **The Driver and the Enchantress**: Jevica builds the town, and Prince Jev drives her carriage while concealing why. Preserve that authored plot; do not replace it with a generic corporate-agent narrative or let a language model improvise its resolution. The storybook is in draft PR #200. Its linked pillars and Home/Work chapter scripts were not available on the reviewed main branch, so their detailed beats remain an integration gate. [R7]

**The Guest List** supplies the workplace's thematic foundation: limited preview access overruns public hours, exclusion has social consequences, and the quiet garden's boundaries matter. The workplace teaches those lessons through concrete permissions and event decisions. Do not invent a new villain or retcon the incident. [P1, R7]

**The Favor** is explicitly hypothetical in the storybook. This specification proposes it as the first workplace mission, not as already-approved chapter placement. Jevica asks the player to help prepare a gathering; a companion assembles a useful brief; Jev helps the player notice the human preference the plan missed. The player chooses; the technology recedes; the gathering becomes the payoff. Preserve the option to decline or defer without punishment.

### Cast responsibilities

- **Jevica / Psyche:** introduces collaboration, asks what the player wants, and demonstrates orchestration without surrendering authorship.
- **Jev / Cupid:** supports judgment; asks a useful question and never makes the player's consequential choice.
- **Athena:** makes goals, evidence, constraints, and review criteria legible. Preserve her fast, nerdy, dramatic intellectual confidence; efficiency is her perspective, not the game's moral command.
- **Ares:** turns mastery into bounded friendly challenges, not automated advantage over other players.
- **Artemis:** identifies overlooked options and defends observation, privacy, independence, and quiet space.
- **Dionysus:** makes completion lead back to people and enjoyment. Life is not a backlog.

The four other gods' placement as residents, traveling companions, or voices remains open in PR #200. Do not allocate permanent offices or require six new playable rigs. First-slice story beats can use approved narrative material without committing their runtime embodiment. Player-imported agents retain their own identities; they are not silently renamed after the cast. [R7]

## 4. First playable experience

1. An eligible resident arrives through the existing world/venue entrance flow.
2. Jevica offers a bounded favor; the player can decline.
3. The player creates a basic companion or connects the one supported external adapter.
4. A plain-language permission card lists exactly what this task can read and produce.
5. The companion accompanies the player into Studio 01, observing the same room and route restrictions as an ordinary admitted occupant.
6. The player provides a gathering brief: purpose, preferences, constraints, and intended timing.
7. The companion occupies a free workstation, reads approved public place/event context, and prepares an event-plan artifact. It does not invite people or publish anything.
8. The player leaves to explore or meet friends. The admitted task can continue on the service; the browser is not its runtime.
9. One private in-app notice announces a needed decision or a ready result. This is not SMS or a phone call.
10. A whiteboard/work panel shows options, sources, uncertainties, suggested logistics, and what needs a human decision.
11. After review, an eligible host may explicitly publish through the existing gathering service. Revalidate current permissions, venue, times, capacity, and the exact approved payload.
12. The player returns to the courtyard. An explicit memory prompt can remember a preference; silence or refusal does not create durable memory.

### First useful artifact

An `event_plan` includes two or three eligible venue options with source IDs, a preference-sensitive recommendation, a proposed agenda, access/quiet-space considerations, unresolved questions, and a draft compatible with existing event validation. The agent produces a real saved planning result; it does not claim an event exists until the authoritative service returns success.

Current event rules include private RSVPs, capacity 2–32 including the host, and meeting-point travel that does not admit someone to a private home. Reuse those rules, including eligibility and feature gates, rather than introducing a parallel calendar or broadening creator authority. [R5]

## 5. Physical workplace

### Location and spatial contract

Select a measured authored bay near an existing social route. Keep mapped streets, entrances, neighboring tenants, and building bounds intact. No real retailer is silently replaced. Site choice is a gate: the plan has not established that a particular unoccupied bay exists.

Proposed first blockout: **approximately 100–120 square meters**, with an illustrative 12 × 9 m layout only where the footprint supports it. The current room planner uses meter-based footprint containment and a 3.9 m room-height constant; its entrance constant corresponds to a 1.7 m opening. Preserve existing transforms and remeasure rather than scaling a photograph to fit. [R3]

| Zone | Purpose | Spatial rule |
| --- | --- | --- |
| Arrival/reception | Welcome, connection status, permission overview | Entrance remains clear when someone is reading or waiting |
| Shared workbench, four stations | Delegation and quiet agent work | Seated/standing occupants do not occupy the circulation lane |
| Meeting/review area | Compare plans and approve a result | Shared surface displays only deliberately shared artifacts |
| Quiet review nook | Private owner/agent conversation | Private data is not broadcast merely because an avatar enters the nook |
| Storage/refreshment edge | Make the suite feel inhabited and practically usable | Furniture, service doors, lighting and circulation have coherent purposes |
| Courtyard connection | Return to exploration and gatherings | Clear sightline and consistent exterior/interior orientation |

Use proposals of 1.8 m for primary clear circulation, 1.5 × 0.75 m work surfaces, approximately 0.74 m desk height, and 0.45 m seat height as blockout anchors. These are not surveyed measurements or building-code certification. Actual character clearance controls acceptance, including wings, clothing, tails, approach, sit/stand and passing behavior.

Test eight total occupants in the room prototype: four residents and four companions. This is a test envelope, not a proven capacity claim. The initial behavioral journey can use one resident and one agent.

### Visual identity

Preserve the district's authored science-fantasy/retrofuturistic shell. Within the suite, use the approved contemporary family of pale travertine, warm timber, smoked bronze, charcoal upholstery, plants, and restrained TypeSafe pink `#F486A1`. Avoid imposing OpenCoven's branding or changing existing site fonts and theme tokens. Preserve Jev/Jevica's latest approved identity and wardrobe references; older blonde-Jevica prose is not the new visual source of truth. [P1, R6]

Prioritize thickness, joinery, consistent texture scale, plausible roughness, grounded feet, contact shadows, believable glass, chair movement, and attention. Technology belongs in desks, wall displays, lamps, and useful devices. Holographic decoration is optional and restrained, never a substitute for readable controls.

### Asset and lighting workflow

Follow the repository order: references → scale/blockout → room logic → collision/routes → camera → blockout review → art. Use stable REF/ROUTE/CAM identifiers. Retain licensed source receipts and distinguish inferred dimensions from measurements. [R6]

Keep editable scene/mesh sources; export modular runtime assets with consistent metric transforms, pivots, collision proxies, material names, interaction sockets, and levels of detail. Use glTF/GLB for the browser asset contract, evaluating KTX2 textures and mesh compression with the actual loader and pinned Three.js version. Do not assume offline promotional images or generated videos are game assets. [T1]

Calibrate the renderer's color pipeline before art compensation. Color textures and data textures need different color-space treatment; use the official Three.js guidance as the baseline. Build fixed daytime and evening lighting references, then evaluate baked static lighting, environment lighting/probes, and a small number of dynamic shadow sources. Audit the existing interior emissive compensation before inheriting it; this review did not establish a rendered defect. [R3, T2]

Proposed optimization starting budgets, to be tested and revised against actual hardware: no more than 25 MiB incremental compressed room payload, 128 MiB room-texture residency excluding existing avatars, and 250 incremental visible draw calls. These are engineering targets, not measurements or a guarantee of realism.

## 6. Agent embodiment and truthful status

Keep **presence mode** separate from **task state**.

Presence: accompanying, stationed, offstage, dismissed. Task: queued, running, waiting for approval, paused, completed, failed, cancelled. Connection health is separate again. An offline provider does not make the character or the owner's artifacts disappear.

Choose high-level goals such as a station ID; the service resolves allowed room/seat positions. Locomotion, collision and station reservations remain deterministic. Reuse relevant Jev movement ideas without inheriting his administrator-only identity, carriage privileges, or Jevica-specific assumptions. Existing source explicitly keeps clearance outside model replies. [R4]

Animate approach, alignment, sit, glance, typing/writing, review, interruption and exit. A reserved station has one occupant and a releasable lease. A stopped job displays a stopped state; an old heartbeat cannot sustain a false busy indicator. Cosmetic idle life may continue without model calls, but must not imply progress. Do not stream chain-of-thought; show task steps, concise explanations and observable results.

## 7. Service architecture

Use the current JavaScript ESM stack for the first integration. No framework migration or Unreal rewrite is a prerequisite. Add a focused workplace domain behind existing authenticated HTTP/WebSocket boundaries. Keep jobs outside both frame updates and room simulation ticks. [R1]

The pipeline is **owner request → task/grant validation → persisted job → bounded worker/provider adapter → validated artifact → private result notification → optional explicit action approval → authoritative game command**.

Separate records for `AgentConnection`, `CompanionInstance`, `Workspace`, `PermissionGrant`, `Task`, `Artifact`, `MemoryEntry`, `NotificationPreference`, and `AuditEvent`. An appearance or provider name never serves as an authorization identity.

Reuse Redis coordination patterns for the closed-alpha metadata/job prototype, with atomic transitions, monotonically increasing lease fencing, idempotency keys and an outbox. Before claiming offline durability, prove the deployment's persistence, recovery and backup behavior; do not assume all Redis configurations are durable. Add a transactional persistent store only if this audit or workload requires it. Store larger artifacts through an ACL-enforcing artifact-store interface, never in world snapshots.

Clients receive filtered presence and public summaries. Private task context, owner facts, credentials, provider endpoints, and memory do not go into room broadcasts. An accessible DOM panel and spatial displays read the same authorized projection; neither is the authority source.

Use a provider-neutral adapter first: one local fixture and one supported remote path. A2A may carry remote tasks and MCP may expose tools; adopt only what the concrete adapter needs. Audience validation, scoped authorization and no token passthrough are application requirements, not properties bestowed by a protocol label. OpenCoven is a candidate adapter, not a mandatory account or a verified existing integration. [T3]

## 8. Permissions, reliability and resource limits

Proposed first-slice defaults: one linked active companion per owner, one running task per owner, three model turns, five read-only tool calls, 120 seconds maximum worker wall time, at most three artifacts of 256 KiB each, and no external messages or external writes. Paid execution stays disabled until an explicit finite spend policy and provider-specific cost checks exist. These limits are configurable and must be enforced, not merely described in the prompt.

Authenticate the player and provider connection separately. Derive owner/account/administrator identity on the server. Validate owner, agent, workspace, world, resource, action, expiry and policy revision at admission and immediately before each effect. Bind approvals to exact payload hashes and versions; edits invalidate old approval. Revocation invalidates queued and running authority, including stale callbacks. A completed irreversible action is reported honestly, not described as undone.

Use task leases, deduplicated notification delivery, checkpointed progress and bounded retries. After an ambiguous external write, reconcile provider state rather than automatically retrying. On worker loss or uncertain authority, pause/fail closed. On owner disconnect, continue only already-authorized background work; gameplay itself retains the current reconnect gate.

Store no raw conversation or audio by default. Start task artifacts private with an explicit retention policy and deletion controls; an initial proposed default is 30 days. Optional durable preferences require confirmation. Sharing creates a deliberate redacted artifact projection, not access to the owner's agent memory. Delete derived indexes and caches as well as the source record; document backup/provider deletion limitations.

Imported text, world chat, tasks, memories, and agent output are untrusted. Render artifacts as inert text or validated structured content, not arbitrary HTML. Restrict remote endpoints and egress to defeat SSRF, metadata-service access and covert data export. Do not give external agents raw game database access, broad personal tokens, shell access inside the world service, or implicit rights through collaboration.

Real code/browser work is a later, separately reviewed execution integration. Evaluate a managed sandbox such as Daytona behind a replaceable adapter, with tested egress restrictions, resource caps, fresh tenant boundaries and kill controls. Its documentation is not proof of your deployed policy. [T4]

## 9. Interface and contact channels

Extend the current People area with My agent and Places with the studio. Use a task detail panel for job status, artifacts, permissions and history. Preserve chat drafts, focus recovery, touch input and current settings organization. The scene remains prominent.

Every spatial action also has keyboard/touch/screen-reader-accessible controls. Reduced motion skips cinematic movement and preserves a static welcome. Interactions must not depend on color, a precise 3D click, proximity to read tiny screen text, or hearing spoken dialogue.

Start with private in-app messages. Then evaluate opt-in push, followed by separately consented SMS, followed by real calls. Real contact requires a verified recipient, channel-specific consent, quiet hours, caps, cancellation and delivery auditing. Never equate an in-game telephone prop with consent. Shared spatial voice remains deferred; this workplace proposal does not reopen it. [P1]

## 10. Validation gates

- **Spatial:** entrance-to-desk-to-review-to-exit routes work while stations are occupied; no wall crossing, doorway lockout or persistent seat collision. Camera views match the intended orientation.
- **Truthfulness:** every completed task has a valid inspectable artifact and execution receipt; animation-only work never claims completion.
- **Authority:** hostile text, forged owner/admin fields, expired grants, deleted workspaces, concurrent requests and stale callbacks cannot cross the tested boundaries.
- **Privacy:** a second account cannot retrieve private tasks, artifacts, memory or provider metadata through any HTTP, socket, deep-link or display path.
- **Recovery:** restart the worker and replace the gateway; reconstruct the same task, deny old lease holders, and deliver no duplicate effects.
- **Performance:** measure occupied room routes at fixed hardware/resolution/settings. Proposed p95 frame-time goals are 16.7 ms desktop and 33.3 ms lower-tier/mobile; no claim until measured. Repeated room visits must not produce unbounded memory growth.
- **Product:** a new tester can connect, delegate, inspect, pause and leave without coaching; they can identify what actually happened and what still needs approval. Measure useful output, optional return, perceived control and social participation—not time spent at desks.

## 11. Scope gates and next decision

Before production geometry, settle the site and actual avatar clearance. Before final narrative integration, reconcile the missing pillars/Home/Work documents and decide the workplace beat's position without rewriting the main romance. Before any external work, approve the first provider, retention and cost envelope. Before claiming release, pass runtime, privacy, accessibility and performance gates.

Do not add a new currency, mandatory rent, unrestricted public bot speech, multi-agent tool federation, real calls, arbitrary player code hosting, native-renderer parity, or whole-district art replacement to the first slice.

The next useful milestone is **a measured Studio 01 blockout plus a local fixture companion that walks in, prepares a validated gathering-plan artifact, and waits for the player**. It proves the spatial and interaction contract without paid inference or real-world side effects.

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
