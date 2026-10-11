# Studio desktop bridge hardening — 2026-10-11

**Objective:** close the page-to-local-agent exposure that river-oaks-c2's
read-only audit of main (`ee7d8d6`) rated HIGH for the World Designer bridge. The
same class applies to the agent-chat bridge merged in #240 (`a9cfe01`).

**Branch / worktree:** `fix/studio-bridge-hardening` in
`../river-oaks-bridge-hardening-20261011`, from `a9cfe01`. c2 handed the
`desktop/` bridge files to this task and stays in `server/`, `middleware.js` and
`vercel.json`.

## Findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Designer: the whole renderer request went into the Codex prompt, the dialog showed only the task, and the agent's JSON returned unfiltered. | **Fixed.** The prompt is rebuilt from allowlisted fields and a sanitized scene. The dialog shows the task, project brief, scope and object count. The page gets back only allowlisted, length-capped proposal fields, with echo fields checked against the request. |
| 1b | Designer: Coven's read-only Codex can still read any file. | **Open, disclosed.** `coven run` cannot pass Codex feature flags. The dialog and docs say so. Closing it needs a tool-less Coven mode (upstream). |
| 1c | Agent chat (#240): Codex `--sandbox read-only` read `/etc/shells` and returned it (probe 2026-10-11). | **Fixed.** `--ignore-user-config --ignore-rules` plus disabled shell, exec, sub-agent, app, plugin, browser and computer-use features. A live adversarial probe through the host answered CANNOT. Verified on codex-cli 0.162.1. |
| 1d | Agent chat: arbitrary renderer context, uncapped replies, unlimited sends. | **Fixed.** Allowlisted scene context with hidden characters stripped, 64 KiB reply cap (streamed deltas too), and 20 sends per 10 minutes. |
| 1e | Claude CLI injects the account email even with `--setting-sources ''`. | **Open, disclosed.** `--bare` removes it but breaks subscription sign-in. CLAUDE.md is not loaded (probe). Slash commands are now disabled. |
| 1f | Page script could start agent work with no user present. | **Mitigated.** The preload requires `navigator.userActivation.isActive` for designer connect and request and for agent send. The E2E confirms a call 5.5 s after load is refused. |
| 2 | Sender check read `senderFrame.url`, which pushState can change, and the preload was exposed on `/play`. | **Fixed.** The preload exposes both bridges only at a Studio path. Main records the committed main-frame URL (`did-navigate`, reset on non-in-page navigation) and requires both it and the sender URL to be Studio. |
| 3 | `coven help --all` ran before consent. | **Fixed.** Consent comes first, and declined consent runs nothing (test). |
| 4 | Found while hardening: `desktop/package.js` copied an explicit file list that #240 did not extend. A packaged build from `a9cfe01` would fail at startup, because `main.js` imports `studio-agent-host.js`. Dev mode and every test use the source tree, so nothing caught it. | **Fixed.** The list moved to `desktop/package-files.js` and gained the agent host, guide and scene-context modules. `desktop/tests/package-files.test.js` walks `main.js`'s relative imports, and fails on #240's list (checked). |

## Verification

- `node --test desktop/tests/studio-designer-host.test.js`: 10/10. New tests:
  allowlisted prompt and response, nothing executed before consent, and a
  pushState or missing committed URL refused.
- `node --test desktop/tests/studio-agent-host.test.js`: 8/8. New tests: hardened
  Codex and Claude argv, scene allowlist, rate limit, and the 64 KiB reply and
  delta cap.
- `node --test desktop/tests/*.test.js`: 46/46, including the new packaging test.
- `node desktop/agent-e2e.js`: passed, 7 checks. It now covers bridges absent on
  `/play` (including after pushState to `/studio.html`) and a send without a
  gesture being refused.
- `node desktop/designer-e2e.js`: passed, 7 checks. The real button clicks
  satisfy the gesture gate.
- `node desktop/studio-e2e.js`: passed.
- Live, one call each through `createStudioAgentHost`: Claude Haiku 5.5 and Codex
  (default model) were each asked to read `/etc/shells`. Both answered CANNOT,
  with no file content in the reply.
- Core `pnpm run verify` and the `world-studio` browser journey: results are in
  the PR.

## Gaps

- 1b and 1e above.
- A gesture can still be borrowed: script running while the user clicks anywhere
  in Studio could send within the 5 s activation window. That send is
  rate-limited and has no tools.
- Packaged and signed app not exercised.

## Next step

Push, open the PR, and ask river-oaks-c2 to review it. Merge only with user
authorization, through the guard, in queue order.
