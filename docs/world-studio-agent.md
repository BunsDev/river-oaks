# World Studio agent chat

World Studio has a side chat with an agent that knows the editor: its controls,
region schema, limits and level-design practice. A pill at the bottom of the
viewport reads **Describe the scene you imagine…**. Type there, or press the
sparkle button, to open the chat panel.

The chat runs in the Electron desktop app. Studio runs the **Claude** or **Codex**
command-line tool already installed and signed in on your device. Browser-only
Studio shows the chat, explains that it needs the desktop app, and stays editable.

## Use it

- **Model**: choose Opus 5.5, Sonnet 5.5 or Haiku 5.5 (Claude CLI), or Codex
  (the model configured in your Codex CLI). Missing CLIs are listed as not found.
- **Ask mode** previews every proposed edit. **Allow mode** applies a validated
  proposal at once as one edit; **Undo** on the card or Cmd/Ctrl Z restores it.
- **+** chooses what the agent sees: the whole region (editable objects and roads),
  or only the selected object. Terrain heights and parcels are never sent.
- **Suggest next steps** offers three follow-ups. Before you send anything they
  depend on what the region contains; after that, the agent suggests them.
- The top-right button starts a new chat. **⇤** or **Escape** collapses back to
  the pill. Shortcuts typed in the chat never reach the editor tools.

## Furnished space updates

Open one of the four **Space templates**, then ask for a concrete change such as
“Give the living sofa sage upholstery” or “Change the lighting to evening.” The
agent receives the current furnishing IDs, dimensions, catalog kinds and finishes.
It can add, update or remove furnishings, move arrival, and update the Lighting
object. It cannot load arbitrary assets, execute scripts or publish a space.

The inspector exposes the same finite catalog. Updates to several items remain a
single undoable edit. **Selected object only** constrains the proposed edits as
well as the shared context; an edit to another object is rejected. Select an object
before sending in that mode. A whole-scene request can also add furnishings.
Room clearance still needs walkthrough review after a layout change: validation
protects the arrival and bounds but does not certify every route.

## How edits stay safe

The agent returns prose plus, at most, one `studio-edit` JSON block of operations.
Studio runs the batch through the same validator as the World Designer: allowed
object properties, region bounds, footprint fit, a clear arrival, at most 64
operations and 128 KiB. It previews the result on a detached copy pinned to the
draft revision when you sent the message. If you edit the draft in the meantime,
the proposal goes stale and cannot be applied. Nothing is saved or exported for
you. Roads and terrain stay read-only.

## Desktop host

`desktop/studio-agent-host.js` owns the executables, arguments and models; the
page only picks IDs from that table.

- **Claude** runs as `claude -p --output-format stream-json` with no tools, no
  slash commands, no MCP servers, no settings sources (so no `CLAUDE.md`) and no
  saved session. Replies stream as they arrive.
- **Codex** runs as `codex exec --json --sandbox read-only --ephemeral` in an
  empty private workspace under the app profile (`studio-agent/codex`). The
  read-only sandbox still lets its shell *read* any file, so Studio also passes
  `--ignore-user-config --ignore-rules` and disables the shell, exec, sub-agent,
  app, plugin, MCP, automation, browser, computer-use, web-search, voice and
  memory features, including ones that are off by default today, so an upgrade
  cannot turn one on (`desktop/studio-codex.js`). That also drops your Codex
  MCP servers, rules and configured model; Codex uses its default model. Codex
  returns each reply whole.
- The first message to each provider asks for native consent, because your
  messages and the scene snapshot go to that provider and usage may be billed.
  It asks again after the app restarts.
- The host keeps up to 48 KiB of chat history per conversation, in memory only.
  Navigation, a renderer crash or quitting cancels running replies.

### Page boundary

The chat runs inside the hosted site, so Studio treats page script as untrusted:

- The bridge exists only in a document loaded at `/studio` or `/studio.html`.
  The main process checks the URL of the last committed main-frame load, which
  `history.pushState` cannot change.
- A message needs a recent click or key press in Studio (`navigator.userActivation`),
  so script alone cannot start agent work unattended. Only one reply runs at a
  time across all chats, so one gesture cannot fan out into many runs, and at
  most 20 messages are sent in any 10 minutes.
- The scene snapshot is rebuilt from an allowlist of object and road fields.
  Unknown keys, terrain heights, parcels and ownership data are dropped, and
  hidden control and bidirectional characters are stripped from labels.
- Replies, including streamed text, are capped at 64 KiB (UTF-8).
- Errors that are not the host's own messages are replaced before they reach
  the page, so file paths and model output do not leak through them.

**Remaining exposure.** With both providers' tools off, an agent knows only what
the page sends it, plus what the CLI itself injects. On `claude` 2.1.296 that
includes your Claude account email (`--bare` would remove it, but it also
disables subscription sign-in). Codex still loads anything in your global
`~/.codex/AGENTS.md`, so keep secrets out of that file; only a separate
`CODEX_HOME` would stop that, which would mean copying credentials. Both CLIs also see the workspace path, which contains
your account name. Script on the site could therefore ask the agent to repeat
those, and could use your provider quota within the rate limit. The consent
dialog says so. The Codex flags were verified on codex-cli 0.162.1; a later
release may add features, so recheck after upgrading.

GUI launches often lack your shell `PATH`, so the host also searches
`~/.local/bin`, `/opt/homebrew/bin` and `/usr/local/bin`. Set
`RIVER_OAKS_AGENT_CLAUDE` or `RIVER_OAKS_AGENT_CODEX` to an absolute path to
override this.

## Verify

```sh
node --test preview/tests/studio-agent-chat.test.js desktop/tests/studio-agent-host.test.js
pnpm run test:desktop:agent   # real Electron IPC + subprocess, synthetic CLI
```

The Electron check uses `desktop/tests/fixtures/studio-agent-cli.mjs` in place of
both CLIs and writes `.runtime/agent/studio-agent-native.json`. It is not evidence
of live provider sign-in, model quality or packaged-app behaviour.
