# World Studio: connected World Designer

Status: approved design; local desktop implementation underway.

Implementation adjustment: paired Cave mutations were verified absent. The first
working desktop path uses a Studio-owned local Coven instance and owner-local
ledger instead. Remote pairing/existing-instance connection remain incomplete;
this adjustment does not claim delivery of those original acceptance items.
Owner: Cody. Date: 2026-10-09.
Canonical execution ledger:
`/Users/buns/.coven/workspaces/familiars/cody/handoffs/river-oaks-world-studio-designer-20261009.json`.

## Decision

Build one World Designer experience with a versioned, portable World Design
skill pack and two runtime adapters. Recommend **Create a design familiar** to
Coven users; offer **Use a general design agent** at the same entry point.
Neither choice changes the editor's document format or available design tools.

A dedicated familiar offers a stable name, world-building lane, project
continuity and user-controlled memory. A general agent offers the same design
workflow without requiring a Coven identity or persistent personal memory.
Use a dedicated world-building role rather than silently repurposing an existing
familiar whose declared identity has another lane. Creation remains a deliberate
user action during setup, not a side effect of opening the editor.

Alternatives considered:

- Familiar only: strong identity integration but prevents use without Coven.
- General agent only: simpler initial setup but lacks the requested familiar
  lifecycle and explicit project continuity.
- Shared skills and tools, two adapters: recommended. It adds adapter work but
  avoids maintaining separate design capabilities for the two identities.

## Current source evidence

Opened worktree:
`/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-studio-20261009`.

- `preview/src/studio/main.js`, `startStudio`: local editor controls and region
  file workflow; it does not yet have a designer connection panel.
- `preview/src/studio/document.js`, `createStudioDocument`: validation,
  transactional snapshots, undo/redo and local persistence. This is the edit
  boundary to extend for accepted proposals.
- `docs/level-design-skills.md`, skill index and Shared working contract: fourteen
  existing repository workflows. The guide explicitly distinguishes workflows
  from installed editor tools and requires runtime evidence.
- `.agents/skills/world-workflow/SKILL.md`, Inputs and routing: composes reference,
  blockout, review, visual comparison and bug-fix workflows.

Opened Coven sources (inspection only):

- `/Users/buns/Documents/GitHub/OpenCoven/coven-cave/src/app/api/familiars/route.ts`,
  `POST`: Cave's own UI creates familiars, rejects duplicate IDs, binds their
  runtime and invokes identity scaffolding. Scaffolding is best-effort, so its
  creation response alone is insufficient proof of a usable identity.
- `/Users/buns/Documents/GitHub/OpenCoven/coven-cave/src/lib/familiar-identity-scaffold.ts`,
  `buildSoulMd`, `buildIdentityMd`: declared purpose, role and identity originate
  with the familiar's own contract.
- `/Users/buns/Documents/GitHub/OpenCoven/coven-cave/src/app/api/client/v1/familiars/route.ts`,
  `createClientV1FamiliarsGetHandler`: authenticated, scoped roster read. This
  inspected route supplies GET, not familiar creation. Do not treat Cave's private
  UI POST route as an already supported paired-client creation API.
- `/Users/buns/Documents/GitHub/OpenCoven/coven/docs/reference/cli-run.md`, Common
  Flags: `--familiar` injects identity for a run; it does not create a familiar or
  install its skill pack.

## Setup and connection

Add a Designer panel available from the Studio header. Show setup choices before
chat. Keep the scene, inspector and walkthrough usable while the panel is open.

### Create a design familiar (recommended with Coven)

1. Pair with the selected Coven instance through its supported credential flow.
   Show the instance and granted project scope. Do not read unrelated local
   familiar workspaces or reuse a private sidecar token.
2. User chooses a name and supported runtime/model. Preview the World Designer
   role, full skill catalog, memory behavior, tools and costs before creation.
3. Create through Coven's authoritative lifecycle, with a new instance-scoped ID.
   Generate its own IDENTITY.md, SOUL.md and role/skill configuration; do not
   overwrite an existing familiar or adopt Cody's identity.
4. Install the versioned skill pack and its referenced guides through the host's
   supported installer. Verify the contract and installed content hashes before
   recording setup complete. Partial setup reports exactly what succeeded and
   offers a bounded retry; it must not create a duplicate on retry.
5. Verify a live connection to that instance/familiar/project. Display its actual
   declared name and role. A saved ID or successful package download is not a
   connected runtime.

Also allow connecting a compatible existing design familiar. Its existing
identity and purpose remain authoritative. A role mismatch requires a deliberate
role decision in Coven; the editor must not repair it by injecting a conflicting
persona.

The Coven adapter requires scoped external operations for creation, skill
installation, contract readback, conversation dispatch and cancellation. During
implementation, reuse an existing supported operation where present; add any
missing operation in Cave's authenticated client boundary with authorization
tests. Never bypass that boundary by calling private UI routes from the renderer.

### Use a general design agent

1. Select a configured local or hosted runtime/provider through secure host
   settings. The renderer receives a connection ID, not provider credentials.
2. Attach the same World Design pack and project brief to this connection. It is
   a design-role agent; it must not claim a Coven instance, familiar identity,
   SOUL or persistent memory that it does not have.
3. Test real connectivity and supported tools. Label unavailable features and
   paid usage before sending a task. No silent model/provider fallback.
4. Use the same context controls and proposal flow as the familiar path.

Connection lifecycle: unconfigured → pairing/configuring → validating → connected;
failure/disconnection remains visible. Persist connection references and project
preferences separately from exported region JSON. Disconnect cancels outstanding
requests and stops context sharing. Secrets stay in the runtime's credential
store. Switching a connection never overwrites project content or either agent's
identity.

## Preloaded World Design pack

Bundle actual skill files, their referenced contracts/guides, a version, content
hashes and an index. Installation validates required links and files. Preloaded
means the bundle is installed and available; it does not mean every instruction
is inserted into every prompt. Load the common contract and relevant workflow
first, then the task-specific skills within the model's context budget. Show
which skills were used on each response and which capabilities are unsupported.

Reuse all fourteen current workflows:

| Skill | Design responsibility |
| --- | --- |
| reference-board | Sourced references, visual intent, provenance |
| map-scale-blockout | Human scale, dimensions, controller measurements |
| blockout-builder | Layout, spatial hierarchy, circulation and activity zones |
| room-logic | Believable adjacency, entrances, public/service routes |
| player-path-collision | Traversal, clearance, slopes and movement failures |
| blockout-review | Playability findings and readiness for detail |
| modular-kit-checker | Grid, pivots, reusable pieces, seams |
| camera-framing | Sightlines, wayfinding and reproducible viewpoints |
| developer-view | Measurements and diagnostics with evidence |
| shape-language-depth | Massing, silhouette, facade depth and alternatives |
| reference-scene-comparison | Matched references and rendered comparisons |
| lighting-pbr-diagnostics | Light, exposure, materials and diagnostic separation |
| vegetation-placement-collision | Planting composition and route intersections |
| world-workflow | Stage selection, recovery, validation and handoff |

Add a Studio-specific role guide covering art direction and world narrative,
biome/ecology consistency, landmarks and player goals, accessible navigation,
Three.js/Electron rendering budgets, asset provenance, and the current region
schema. These are new authored instructions, not claims of existing automated
validators or certified expertise. Existing Unreal-specific skill details must
be routed by runtime; they must never be applied as Three.js API instructions.

Distinguish:

- Skills installed and available.
- Skills loaded for this task.
- Tools available in this editor version.
- Actual checks performed and their results.

The current Studio can edit buildings, trees, places and arrival; it can inspect
and preserve roads/terrain. Agent knowledge does not add terrain brushes, mesh
imports, photorealistic lighting tools or interior simulation that are absent
from the editor. Unsupported requests yield a concrete design/handoff, not a
fabricated completed scene change.

## Project context and memory

Maintain a user-editable project brief: purpose, audience, style, references,
scale, constraints, location, runtime and performance targets. Separate approved
decisions from ideas and inferred measurements. Store sources with references.

Before the first task, show the context being shared: selected objects or whole
region, units/axes, region revision, relevant reference IDs and project brief.
Screenshots and external references are separately selected attachments. Do not
send account/session data, credentials, other projects or unrelated familiar
memory. Remember approved design decisions only with the user's chosen
project-memory setting, and provide view/remove controls.

## Design-to-edit loop

User brief → scoped scene snapshot → routed skills → design explanation and
structured proposal → preview/diff → Apply or Reject → validation → one Undo entry.

Proposal envelope includes protocol version, request ID, connection identity,
project ID, base document revision/hash, affected IDs, concise rationale,
assumptions, skill-pack version, required capabilities and bounded operations.
At most 64 operations and 128 KiB per proposal for the initial implementation.

Permit only declared operations on supported document properties. No arbitrary
JavaScript, shell, filesystem paths or automatic remote asset downloads. Validate
the envelope and every operation, apply to a detached candidate document, then
validate the full candidate with existing region/resource limits. A failure
rejects the entire proposal without changing the active document or history.

Before Apply, check the active connection, project, request generation and exact
base document revision again. Cancellation, disconnect, region replacement,
undo/redo, manual edits or a new task invalidate stale proposals. Applying a valid
proposal is one undoable document transaction. Review, save/export and shared
publication remain separate explicit user actions.

Offer useful task starts: Review this layout; Design from this brief; Compare two
alternatives; Check scale and routes; Improve this facade; Review lighting; Plan
planting. A chat transcript alone does not establish that a proposal was applied.

## Implementation units and acceptance

1. Portable pack and role: reproducible bundle with content hashes and resolved
   references; test missing files, broken links and mismatched runtime guidance.
2. Authenticated runtime adapters: genuine connection and cancellation; test bad
   credentials, expired/revoked grants, project mismatch and unavailable runtime.
   Stub transport tests are labeled as such; they do not prove a live provider.
3. Familiar setup: creation, duplicate-safe retry, identity readback and installed
   pack verification. Demonstrate no changes to another familiar's contracts.
4. General-agent setup: same pack/context without invented familiar identity;
   credentials absent from browser storage, requests and exported region files.
5. Editor proposal integration: real select → request → review → apply → undo →
   save → reload journey, plus malformed/oversized/stale/canceled response tests.
6. Browser and Electron acceptance: both setup choices, keyboard/focus behavior,
   disconnect/reconnect, blocked capabilities and native export/regression checks.

Run the repository's focused tests and core gate, plus adapter authorization,
browser and Electron journeys. Record actual provider/instance, runtime and scope
for any live smoke. Never call paid providers or create a real familiar merely to
produce a smoke receipt without that specific authorization.

## Completion boundaries

This document is a reviewable design. No connection UI, runtime adapter, familiar
or installed skill pack is delivered by writing it. The active integration
objective remains incomplete until the paths above are implemented and tested.
No product code, current identities or remote state is changed in this design
step. No commit, push or deployment is authorized.
