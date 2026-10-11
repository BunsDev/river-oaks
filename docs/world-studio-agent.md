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
page only picks IDs from that table. IPC is limited to the main Studio window.

- Claude runs as `claude -p --output-format stream-json` with no tools, no MCP
  servers, no settings sources and no saved session, so replies stream as they
  arrive.
- Codex runs as `codex exec --json --sandbox read-only --ephemeral` in an empty
  private workspace under the app profile (`studio-agent/codex`). It returns
  each reply whole. Codex's read-only sandbox may still run read-only commands
  in that workspace.
- The first message to each provider asks for native consent, because your
  messages and the scene snapshot go to that provider and usage may be billed.
  It asks again after the app restarts.
- The host keeps up to 48 KiB of chat history per conversation, in memory only.
  Navigation, a renderer crash or quitting cancels running replies.

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
