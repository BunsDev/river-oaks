# World Studio agent chat — 2026-10-11

**Objective:** add a side chat to World Studio with an agent that is an expert in
the editor. It follows the supplied mock (a collapsed "Describe the scene you
imagine…" pill and a dark docked panel with suggested next steps, model and mode
pickers, and a lime send button) and connects to the local Claude or Codex CLI.

**Branch / worktree:** `feat/studio-agent-chat` in
`../river-oaks-studio-chat-20261011`, from `origin/main` `cd42d50`.

## Files owned

- `preview/src/studio/agent-chat.js`: pill, panel, streaming log, proposal
  cards, and pure helpers (`parseAgentReply`, `proposalEnvelope`, `describeChange`,
  `starterPrompts`).
- `preview/src/studio/main.js`, `studio.css`: mounting and styles.
- `desktop/studio-agent-host.js`, `studio-agent-guide.js`: CLI table, stream
  readers, consent, history, and the expert system prompt.
- `desktop/main.js`, `studio-preload.cjs`, `studio-command.js`: IPC, delta
  events, and the stdout streaming hook.
- Tests: `preview/tests/studio-agent-chat.test.js`,
  `desktop/tests/studio-agent-host.test.js`,
  `desktop/tests/fixtures/studio-agent-cli.mjs`, `desktop/agent-e2e.js`
  (`pnpm run test:desktop:agent`).
- Docs: `docs/world-studio-agent.md`, plus a link from `docs/world-studio.md`.

## Design decisions

- **Reuses the existing designer validation.** Agent operations are wrapped in
  the `createDesignerSession` envelope, with one session per message. Stale-base,
  bounds, capability and size checks are identical, and apply creates one undo
  entry.
- **The host owns the executable, argv and models.** The page sends IDs only,
  and IPC uses the existing `designerSenderAllowed` gate. Claude runs with no
  tools, MCP, settings sources or saved session. Codex runs read-only and
  ephemeral in an empty profile workspace.
- **Consent is asked once per provider per app run.** The per-task dialog the
  World Designer uses would make chat unusable.

## Verification (this session)

- `node --test preview/tests/studio-agent-chat.test.js desktop/tests/studio-agent-host.test.js`:
  10/10 pass. The first run caught an overlapping-send race (`active` was claimed
  after an await), which is now fixed.
- `node desktop/agent-e2e.js`: passed, 5 checks. Real Electron IPC with the
  synthetic CLI. Receipt: `.runtime/agent/studio-agent-native.json`.
- Headless Chromium (playwright-core with Metal ANGLE, Vite on port 5191, stubbed
  access gate, fake bridge): pill, open, streamed reply, Ask-mode apply/undo,
  Allow-mode auto-apply, W/E/R isolation, Escape collapse and the no-bridge
  message. Zero console errors. Screenshots were compared visually against the
  mock.
- Live CLI smoke through `createStudioAgentHost`: Claude Haiku 5.5 streamed 60
  deltas, and Codex (configured model) returned one message. Both produced valid
  `studio-edit` and `studio-next` blocks. These were single tiny calls.
- `pnpm run verify` (core): passed. JS: preview 2591 pass / 1 skip; server 298
  pass / 106 skipped (Redis/live); desktop 42 pass; agent 27 pass; pytest 141
  pass. Build, lint and secret scan also passed. Receipt: `.runtime/agent/core.json`.
- `node desktop/designer-e2e.js`: passed after the chat's attributes were moved
  to a `data-agent-*` namespace (the first run hit a `[data-send]` collision).
  `node desktop/studio-e2e.js` passed, as did
  `pnpm run test:experience world-studio`, which also passed after the final
  layout change.
- Phone width (400 px): the chat now sits between the toolbar and the view tools.
  The first narrow run showed it covering the Undo toolbar.

## Gaps

- Packaged/signed app, human accessibility and screen-reader review, and model
  design quality have not been assessed.
- Codex has no token streaming; its reply arrives whole.
- No resizing or dragging of the panel; the grip is decorative.
- Region title is fixed to "TypeSafe River Oaks" (regions have no name field).

## Next step

Open a PR. Do not merge until the user authorizes it and #227 has landed (a peer
session asked to hold merges to main).
