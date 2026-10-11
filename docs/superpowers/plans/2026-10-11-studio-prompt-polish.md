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
verified. No merge or deployment performed. Next: deliver the signed branch for review;
preserve this worktree and evidence until its change is landed.
