# Studio desktop bridge hardening — 2026-10-11

**Objective:** close the page-to-local-agent exposure that river-oaks-c2's
read-only audit of main (`ee7d8d6`) rated HIGH for the World Designer bridge. The
same class applies to the agent-chat bridge merged in #240 (`a9cfe01`).

**Branch / worktree:** `fix/studio-bridge-hardening` in
`../river-oaks-bridge-hardening-20261011` (PR #243). c2 handed the `desktop/`
bridge files to this task and stays in `server/`, `middleware.js` and
`vercel.json`. Val chose (2026-10-11) to run World Designer tasks on the tool-less
Codex path instead of `coven run`.

## Audit findings and dispositions

| # | Finding | Disposition |
| --- | --- | --- |
| 1 | Designer: the whole renderer request went into the prompt, the dialog showed only the task, and the agent's JSON returned unfiltered. Coven's read-only Codex could read any file. | **Fixed.** Tasks run on tool-less `codex exec` (`desktop/studio-codex.js`), with Coven kept for setup, ledger and readiness. The prompt is rebuilt from allowlisted fields. The dialog shows the full normalized task, brief, scope and every scene name, exactly as sent. Replies with extra fields are refused, and only bounded proposal fields return. |
| 1c | Agent chat (#240): Codex `--sandbox read-only` read `/etc/shells` and returned it (probe). | **Fixed.** Same tool-less invocation, with web search also off. A live adversarial probe through the host answered CANNOT. Verified on codex-cli 0.162.1. |
| 1d | Agent chat: arbitrary renderer context, uncapped replies, unlimited sends. | **Fixed.** Allowlisted scene context, a 64 KiB UTF-8 cap (streamed too), one reply at a time across chats, and 20 sends per 10 minutes. |
| 1e | CLI-injected context: Claude adds the account email; Codex loads the global `~/.codex/AGENTS.md`, even with `--ignore-user-config` and `project_doc_max_bytes=0` (probes). Both see the workspace path, which contains the account name. | **Open, disclosed** in both consent dialogs and the docs. Removing them needs `--bare` (breaks subscription sign-in) or a separate `CODEX_HOME` (would copy credentials). |
| 1f | Page script could start agent work unattended. | **Mitigated.** The preload requires `navigator.userActivation.isActive`. The E2E shows a send 5.5 s after load is refused. |
| 2 | Sender check read `senderFrame.url`, which pushState can change, and the preload was exposed on `/play`. | **Fixed.** Bridges are exposed only at Studio paths. Main records the committed URL from `did-navigate` and requires both it and the sender URL. |
| 3 | `coven help --all` ran before consent, with the full environment. | **Fixed.** It runs after consent, with only `PATH` and `HOME`. |
| 4 | Found while hardening: #240's agent modules were missing from `desktop/package.js`, so a packaged build would fail at startup. | **Fixed.** The list lives in `desktop/package-files.js`, and `package-files.test.js` walks the import closure. It fails on #240's list, and it flagged `studio-codex.js` when that module was added. |

## Review round 1 (river-oaks-c2 at `71feadc`: request changes)

| # | Finding | Disposition |
| --- | --- | --- |
| B1 | The dialog didn't show what reached Codex: 600-character excerpt, invisible tag characters, selection scope still sending the region, unshown scene text, verbatim return channel. | **Fixed** (row 1). Task and brief are held to 1,000 and 2,000 characters after normalization (panel and protocol limits match), and longer text is refused before anything runs. Hidden characters are stripped by Unicode category. Selection scope sends only the selected objects. All scene names are listed. A longer saved brief is trimmed in view and its project ID kept. |
| S1 | Clearing `loadedUrl` on `did-start-navigation` disabled both bridges after any blocked navigation. | **Fixed:** the line is deleted. A new E2E step fails with the line restored ("limited to the main Studio window") and passes without it. |
| S2 | One click allowed 20 sends across chats. | **Fixed:** one reply runs at a time across all chats. The E2E fires 12 sends from one real click, and 1 runs. |
| S3 | Raw designer errors (model-output parse errors, paths) reached the page. | **Fixed:** main replaces non-host errors (no `code`, not a `SyntaxError`, a known host prefix and no home path) with fixed messages. |
| S4 | Codex flags not verified: web search, `~/.codex/AGENTS.md`. | **Verified.** Web search is off (`-c web_search="disabled"`, and the probe answers NO). AGENTS.md still loads (row 1e). The version is not pinned, to avoid breaking routine upgrades; the docs say to recheck. |
| N1–N7 | Newlines deleted, silent repair, rate stamp after await, characters vs bytes, packaging-test blind spots, undocumented workspace path, `help` environment. | **Fixed:** newlines become spaces, bad replies are refused, the stamp comes before the first await, the cap is code-point-safe UTF-8, the test follows bare imports and refuses computed ones, the path is documented, and `help` gets a minimal environment. |

## Verification (latest)

- `node --test desktop/tests/*.test.js`: 47/47. New: Codex argv and reply parsing
  (`studio-codex.test.js`); designer dialog equals the prompt text; tag
  characters, padding, parcels and hidden keys never reach the prompt; selection
  scope; over-length refusal; strict reply refusal; nothing executed before
  consent; scene allowlist; burst and rate limit; byte cap; package closure.
- `node --test preview/tests/studio-*.test.js`: 25/25.
- `node desktop/agent-e2e.js`: passed, 9 checks, including blocked navigation, a
  pushState rename refused by main end to end, and a one-click burst running 1.
- `node desktop/designer-e2e.js`: passed, 9 checks, now with synthetic Coven and
  Codex executables, plus the dialog-content check for both modes.
- Live probes: hardened Codex and Claude each refused to read `/etc/shells`
  through the host. Hardened Codex reports no web tool. Global AGENTS.md is
  still injected (disclosed).
- An unplanned real call: before the fixture option was added, one unit test's
  second host resolved the real `codex` from PATH and made two small Codex
  calls. Fixed; every test host now uses fixtures or stub `execute`s.

## Gaps

- Row 1e (CLI-injected context).
- A borrowed gesture: script running at the moment of a user click can send one
  message, one at a time and rate-limited, to a tool-less agent.
- Packaged and signed build not exercised; the import-closure test covers the
  file list only.
- Codex flags are pinned to 0.162.1's feature set by documentation, not by code.

## Next step

Re-request c2's review on the new head. Then rebase onto the current queue
slot, rerun CI, and merge through the guard once green, approved and in turn.
