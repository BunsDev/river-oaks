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

Coven handles setup, the familiar identity ledger and the readiness check. Each
design task runs the Codex CLI directly, with its tools off (see **Read access**),
so designer tasks do not appear in `coven sessions`. The default executables are
`coven` and `codex` on the desktop process PATH (plus `~/.local/bin`,
`/opt/homebrew/bin` and `/usr/local/bin`). Set `RIVER_OAKS_DESIGNER_COVEN` or
`RIVER_OAKS_DESIGNER_CODEX` to an absolute path when a GUI launch does not
inherit your shell PATH. Optional `RIVER_OAKS_DESIGNER_MODEL` selects the Codex
model; otherwise Codex uses its default model, not the one in your Codex config.
Credentials remain with the Codex CLI, never in the renderer or region export.

**Dedicated familiar:** choose a name. The host creates a private, project-scoped
Coven instance under the Electron profile's `designer/<project-id>/familiar/`.
Its own `IDENTITY.md`, `SOUL.md`, roster and skill pack are created without
changing your existing Coven instance or familiars. Registration and readback use
Coven's owner-local identity ledger. Retired/revoked identities or changed
contract bytes fail closed. Reconnecting reuses the same project/name; different
identity bytes are never overwritten. App updates install each knowledge pack in its own hash-addressed directory and reconnect the same identity. Only the exact prior generated workspace guide is migrated; custom instructions remain protected. Ward signing keys are not fabricated.

**General agent:** the host installs the same knowledge into an isolated general
workspace, without a familiar roster or personal identity. It uses the same
tools-off Codex runtime and explicit scene context.

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
authentication. Model responses must identify loaded skills and assumptions.

**Read access.** Codex's read-only sandbox still lets its shell *read* any file
this account can read, and `coven run` cannot turn that shell off. So design
tasks run `codex exec` directly with the user config ignored and the shell,
exec, sub-agent, app, plugin, browser, computer-use and web-search features off
(`desktop/studio-codex.js`, verified on codex-cli 0.162.1: asked to read a file,
it cannot). Codex still receives anything in your global `~/.codex/AGENTS.md`
(keep secrets out of that file) and the workspace path, which contains your
account name.

**What you approve.** Each task's dialog shows the whole task (up to 1,000
characters), the whole project brief (up to 2,000), the scope and every place
and road name shared. These are exactly the strings sent: hidden characters are
removed, other space characters become plain spaces, and runs of spaces and blank
lines collapse before both. Selection scope sends only the selected objects.
Object IDs and building or road kinds are short slugs (for example `tree-3`,
`footway`) and are not listed. Request IDs, revisions and hashes stay with the
host and are never sent, and the project ID in the workspace path must be a
UUID.

**Page boundary.** As with the agent chat, the bridge exists only in documents
loaded at a Studio path, the main process checks the committed URL, and setup
and tasks need a recent click or key press. The host rebuilds the prompt from
allowlisted request fields and an allowlisted scene snapshot. A reply with extra
fields or unsupported operations is refused, not repaired, and only bounded
proposal fields reach the page. Errors that are not the host's own messages are
replaced before they reach the page. Nothing, including the Coven capability
check, runs before setup consent.

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
  and subprocess transport using **synthetic Coven and Codex executables**, and
  checks the task dialog's contents. It proves both
  setup/edit paths, not actual provider authentication or model design quality.
- `node desktop/studio-e2e.js` covers existing native menus/export/recovery.
- `pnpm run verify` covers the core repository gate; its exclusions still apply.

Native fixture consent is automated. Human accessibility, real Coven registration,
paid model execution, signed packaging, deployment and remote pairing are separate
acceptance gaps. No real familiar or paid task is created during these tests.
