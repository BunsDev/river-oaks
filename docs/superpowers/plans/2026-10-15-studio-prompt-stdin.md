# Studio prompts on stdin (#370 finding), 2026-10-15

Objective: the Studio agent (Claude or Codex CLI) and the World Designer (Codex) pass their whole prompt as one command-line argument. Windows caps a command line at 32,767 characters and Linux caps a single argument at 128 KiB (`MAX_ARG_STRLEN`). A long prompt fails at spawn, and the page shows a generic error ("Claude CLI failed…" or "The designer host hit a local error"). Recorded on #370 by the desktop-identity session, unfixed. Fix: send the prompt on stdin.

Branch and worktree: `fix/studio-prompt-stdin-20261015` in `../river-oaks-studio-prompt-stdin-20261015`, from `origin/main` at `d2ea93c3`. Register task: `studio-prompt-stdin` (primary checkout's live `tasks.json`). Owner: river-oaks-27 (session 16ffadb4).

Files owned: `desktop/studio-command.js`, `desktop/studio-codex.js`, `desktop/studio-agent-host.js`, `desktop/studio-designer-host.js`, `desktop/tests/studio-command.test.js`, `desktop/tests/studio-codex.test.js`, `desktop/tests/studio-agent-host.test.js`, `desktop/tests/studio-designer-host.test.js`, `desktop/tests/fixtures/studio-agent-cli.mjs`, `desktop/agent-e2e.js` (reads the fixture log), `docs/world-studio-agent.md`, this ledger.

## How the CLIs take a prompt on stdin (checked on this host)

- `codex exec --help` (codex-cli 0.162.1): "If not provided as an argument (or if `-` is used), instructions are read from stdin."
- `claude --help` (Claude Code 2.1.300): `-p/--print` without a prompt argument reads the prompt from stdin (`--input-format` defaults to `text`).
- Fixed argv without a prompt: Claude 6,359 characters (mostly `--system-prompt`, the 6,111-character agent guide), Codex 1,725 characters with a long Windows workspace path. Both stay far below either limit, so only the prompt moves.

## Change

- `runStudioCommand(…, { input })` writes `input` to the child's stdin and closes it. Without `input`, stdin stays `ignore` as before (Coven's commands carry no prompt). A child that exits before reading everything closes the pipe (EPIPE). That error is ignored, so the child's exit status decides the result instead of crashing the host.
- `codexArgs()` takes no prompt and ends with `--`, `-`. Agent providers build argv without the prompt (Claude ends at `--tools ''` with no `--`), plus an `input(prompt)` (Codex: guide, blank line, prompt). The designer passes its Codex prompt as `input`.
- The fixture CLI reads its prompt the way the real CLIs do and logs `{ args, prompt }`, so tests can see that the prompt is not on the command line.

## Checks

| Check | Result |
| --- | --- |
| New tests before the fix | 6 failed as expected: the 600-object agent call put 95,557 characters on the command line; stdin delivered nothing (`0:`) |
| `pnpm run test:desktop` after the fix | 69 pass, 0 fail, 0 skipped (macOS arm64) |
| Designer sizes after the fix | argv 1,774 characters; stdin 24,453 (typical brief) and 44,338 (every skill routed) |
| Live CLIs, production argv, prompt on stdin padded past 32,767 | Claude (`claude-haiku-5-5`): argv 6,351, stdin 35,074, exact nonce reply in 5.7 s. Codex (default model): argv 1,758, stdin 41,187, exact nonce reply in 4.7 s. One call each, about a cent apiece |
| `node desktop/agent-e2e.js` (Electron, synthetic CLI) | Passed after its log reader moved to `{ args, prompt }`; it also asserts that no call's argv carries the message |
| `node desktop/designer-e2e.js` (Electron, synthetic Coven and Codex) | Passed |
| `pnpm run verify` (core) | Passed: scripts 95, preview 3,044 with 1 skip, server 500 with 141 Redis skips (no `REDIS_URL`), desktop 69, pytest 141, build, Ruff, demo, secrets |

## Gaps and next step

- Windows proof is the Desktop workflow's `windows-latest` unit tests on the PR (the new over-limit tests run there through `node.exe`).
- Not changed: `--system-prompt` still carries the 6,111-character guide on Claude's argv (fixed size, well within both limits).
- Next: push, open the PR, read the Desktop run (Windows unit tests are the Windows proof). Merging needs Val's authorization; it was not part of the #371 phase-2 grant.
