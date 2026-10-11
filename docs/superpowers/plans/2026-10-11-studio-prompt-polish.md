# World Studio scene prompt polish

User request: improve the “Describe the scene you imagine…” field to match TypeSafe
Place and reduce the white appearance of the surrounding panel or ground plane.
Screenshot: `Screenshot 2026-10-11 at 11.59.35.png`.

Worktree: `river-oaks-studio-prompt-polish-20261011`, branch `fix/studio-prompt-polish`.
Owner: session `01a12992-ca4f-7953-bf53-2e8875f2cf15`.
Base: `e2fc2ff` from origin/main. Preserve the dirty primary checkout and existing worktrees.

## Scope

- User confirmed the login page as the style reference: share its charcoal/rose palette and bundled Outfit typography with the prompt. Extract existing declarations without changing login styles.
- Keep one rounded visible keyboard focus indicator; eliminate the square inner outline.
- Preserve submit, expansion, collapse, draft, keyboard and provider behavior.
- User confirmed the 3D ground plane: use muted sage by day and deep green in dark mode, including live theme changes.

## Verification

- `pnpm install --frozen-lockfile` passed. Initial doctor correctly reported the new
  worktree's missing Python environment; `uv sync --locked` fixed that prerequisite.
  The subsequent `pnpm run agent:doctor` passed.
- `pnpm run verify` passed: 43 tooling, 2,621 preview, 333 server, 42 desktop and
  141 Python tests passed; build, Python checks and secret scan passed. The existing
  core profile skipped one preview test and 109 optional server/Redis cases. The
  synthetic demo verifier returned its expected blocked-domain result. Full Redis
  acceptance is outside this UI change.
- `pnpm run test:experience world-studio` passed in 9.039 seconds with no page errors.
  Added keyboard checks cover the unified rounded prompt focus, Tab to the action,
  Enter to open chat and Escape to restore input focus in light and dark modes.
  Receipt: `data/reports/studio-prompt-polish.json`.
- An isolated browser inspection passed resting/focus/typed/hover/open/collapse
  checks and 390×844, 320×640 and 1000×600 containment checks, with 44-pixel action
  targets and no horizontal page overflow. Captures under
  `output/playwright/prompt-polish/` show the charcoal/rose prompt and sage/deep-green
  plane. Dark, light and narrow captures were visually inspected.
- Runtime source hashes remained unchanged during verification. The shared login
  theme extraction reconstructs the original login CSS byte-for-byte.
- Owned processes and dynamic fixture port 54002 were clear after the run.

Private local receipts are under `.runtime/prompt-polish/`; the initial prerequisite
receipt is preserved under `.runtime/prompt-polish-bootstrap/`.

Prompt styles, focus regression and theme-aware ground materials are implemented and
verified. Signed source `99bb582c9d2777eeb20f00dc8c5fc8a8c5c95ae3` is pushed in
[PR #246](https://github.com/BunsDev/river-oaks/pull/246). At the initial handoff, no merge or deployment was
performed. Preserve this worktree
and evidence until its change is landed. The primary checkout and all 28 pre-existing
worktrees were preserved; this task added one isolated worktree (29 total at handoff). Existing
lifecycle reconciliation gaps remain separate; this task has no register gap.


## Current-main integration

The user authorized continuing delivery. The branch was rebased first onto
`a4412e8`, then onto `8c81ba5dec70f2a19859acc3b1905d9903dba431` after PR #243
landed during verification. The only conflict was the task-register append;
every current-main task entry was retained and this task appended. All six UI
source files remain byte-identical to the original verified implementation.
Original remote head `e7196e19cd27653b6363aaecf18a985110dafb23` and the intermediate
rebase are preserved under local `refs/codex/studio-prompt-polish/` refs.

Fresh `pnpm run verify` on rebased head `1443b2c` passed: 43 tooling, 2,623
preview, 337 server, 47 desktop and 141 Python tests (3,191 total); one preview
and 110 optional server cases skipped in the core profile. Build, Python lint /
format and the secret scan passed. `pnpm run test:experience world-studio` passed
in 9.3 seconds with no page errors. All tracked hashes remained unchanged during
this run. Receipt/logs: `.runtime/prompt-polish-rebase-8c81/`. The earlier
`a4412e8` integration also passed and is retained under `.runtime/prompt-polish-rebase/`.
Both bounded runners exited successfully and their owned runtime processes were
confirmed absent. No native app or live-provider acceptance was run.

The original PR head passed all ten hosted checks. Current-main hosted checks
must pass on the new published head before protected merge. Next: wait for those
checks and merge PR #246; retain the worktree and its private local evidence.


### Login-art main update

Main advanced again to `4849d621b4af88fc0180a295184f7ddf782b9b32` while hosted
checks ran. Its only changes are the sign-in artwork JPG and its provenance JSON;
no runtime source changed. Both task commits rebase identically (`range-diff =`).
Fresh production build and the World Studio journey passed (10.967 seconds) on
rebased `1a88bf0`; all tracked hashes were stable during that check. The full core
result above still describes the unchanged runtime source. The previous published
head `2db64ea` passed all ten hosted checks, but strict current-main protection
requires those checks again on the updated head. Evidence is preserved under
`.runtime/prompt-polish-rebase-4849/`; owned runtime processes were confirmed absent.
Next: publish this update, wait for exact-head CI, and merge through protections.
