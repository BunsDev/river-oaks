# World Designer in Studio

Open World Studio in Electron and choose **World Designer**. Choose a dedicated
familiar or a general design agent. Both use the same World Design pack and the
same validated document operations. Browser-only Studio keeps editing available
and explains that connections currently require the desktop host.

## Setup

Install Coven and configure Codex sign-in on your device first. Familiar setup
requires a Coven version exposing `familiar-ledger`; setup checks this before
creating an identity. The installed `v0.4.8-10-ge6fc281f` inspected during this
implementation lacks that command, although its Codex adapter doctor passes.
The general-agent path does not require the identity-ledger command. Studio uses
`coven adapter doctor codex --json` to check local readiness. This does not prove
provider authentication; the panel says so until a requested task returns.
Provider usage may be billed, and each task requires native confirmation.

The default executable is `coven` on the desktop process PATH. Set
`RIVER_OAKS_DESIGNER_COVEN` to its absolute executable path when a GUI launch does
not inherit your shell PATH. Optional `RIVER_OAKS_DESIGNER_MODEL` selects the
provider model; credentials remain with the configured harness, never in the
renderer or region export. This initial adapter supports Codex through Coven;
it does not silently switch providers.

**Dedicated familiar:** choose a name. The host creates a private, project-scoped
Coven instance under the Electron profile's `designer/<project-id>/familiar/`.
Its own `IDENTITY.md`, `SOUL.md`, roster and skill pack are created without
changing your existing Coven instance or familiars. Registration and readback use
Coven's owner-local identity ledger. Retired/revoked identities or changed
contract bytes fail closed. Reconnecting reuses the same project/name; different
identity bytes are never overwritten. App updates install each knowledge pack in its own hash-addressed directory and reconnect the same identity. Only the exact prior generated workspace guide is migrated; custom instructions remain protected. Ward signing keys are not fabricated.

**General agent:** the host installs the same knowledge into an isolated general
workspace, without a familiar roster or personal identity. It uses the same
read-only Codex runtime and explicit scene context.

The initial integration uses a local instance because Cave's paired-client API
currently exposes reads, but no create/install/dispatch operations. Remote Cave
pairing, connecting an existing Cave familiar, browser-hosted agents and provider
selection beyond the installed adapter remain **incomplete**. No private Cave
endpoint or sidecar credential is used as a substitute.

## Skills and context

The versioned pack includes all fourteen existing workflows plus the Studio role
guide. It contains actual Markdown instructions and linked guides, with verified
hashes. See [pack details](world-design-pack.md). Installed skills, task-loaded
skills, available tools and performed checks are separate concepts.

The host loads the common contract, Studio role, world workflow and task-related
skills. The task shares your editable project brief and either selected objects
or the whole region, with units and revision. Screenshots and external reference
attachments are not implemented yet. Studio sends context explicitly and adds no cross-project
memory. The configured Codex harness retains its own user-level settings and
authentication; read-only mode is not a guarantee of filesystem read isolation. Model responses must identify loaded skills and assumptions.

Project ID, familiar name, selected mode and brief are saved separately from the
region file. A saved preference never implies a live connection after reload.
The local host retains installed identity/knowledge; this version does not offer
project-memory management. Closing/reloading/disconnecting cancels owned runs.

## Proposed edits

The model returns a bounded JSON proposal, never executable editor code. The
editor checks request/connection/project IDs, revision and exact original
serialized document, skill version, capability allowlist, affected IDs, 64-operation
limit and 128 KiB proposal limit. A detached candidate must pass the existing
region and rendering budgets before preview. Apply rechecks the base and creates
one undo entry. Manual edits, new tasks, cancellation and disconnect invalidate
pending proposals. Walking mode prevents application.

Buildings, trees, places and arrival are editable. Roads/terrain are preserved.
The preview lists before/after values; it is a change review, not an independent
rendered design-quality assessment. Save/export remain separate actions.

## Verification and limits

- `node --test preview/tests/studio-designer.test.js desktop/tests/studio-command.test.js desktop/tests/studio-designer-host.test.js desktop/tests/studio-skill-pack.test.js`
- `node desktop/designer-e2e.js` runs real Electron, narrow IPC, file installation
  and subprocess transport using a **synthetic Coven executable**. It proves both
  setup/edit paths, not actual provider authentication or model design quality.
- `node desktop/studio-e2e.js` covers existing native menus/export/recovery.
- `pnpm run verify` covers the core repository gate; its exclusions still apply.

Native fixture consent is automated. Human accessibility, real Coven registration,
paid model execution, signed packaging, deployment and remote pairing are separate
acceptance gaps. No real familiar or paid task is created during these tests.
