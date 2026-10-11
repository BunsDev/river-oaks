# World Studio dual-path Designer implementation

Owner: Cody. Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-studio-20261009`.
Branch: `cody/world-studio-20261009`. User approved: “Build the dual-path integration.”
Canonical receipt: `/Users/buns/.coven/workspaces/familiars/cody/handoffs/river-oaks-world-studio-designer-20261009.json`.

## Objective
Implement the approved `../specs/2026-10-09-world-studio-designer-design.md`:
a dedicated design familiar and general design agent share a versioned skill pack,
scoped context and validated preview/apply/undo. Preserve prior Studio work.

## Units and ownership
1. Portable skill pack: `scripts/studio-skill-pack.js`, `desktop/tests/studio-skill-pack.test.js`, `.agents/skills/studio-world-design/SKILL.md`. Bundle all fourteen workflows and referenced guides; reproducible hashes; install/readback tests for corruption and missing links. Do not install into real identities for tests.
2. Proposal core: `preview/src/studio/designer-protocol.js`, `document.js`, `preview/tests/studio-designer.test.js`. Validate bounded envelopes/allowlisted operations and full candidate; monotonic revision fences; one atomic undo entry. Test malformed, oversized, stale, canceled, disconnected and replayed proposals.
3. Runtime adapter: inspect authoritative public operations first; implement host-held connections, authenticated scoped setup/readback/dispatch/cancel. No private UI bypass, renderer secrets or identity substitution. Record exact required cross-repo surfaces after discovery. Real local fixture transport tests cover both paths and failures.
4. Designer UI: `preview/src/studio/designer-panel.js`, `main.js`, `style.css`; desktop host integration in `desktop/`. Setup choices, actual identity/pack/capability state, editable project brief/context preview, task response/diff and apply/reject. Connection metadata remains outside region export. Keyboard/focus/disconnect/reconnect acceptance.
5. Evidence/docs: extend `preview/e2e/world-studio*`, `desktop/studio-e2e.js`, `docs/world-studio.md`; run focused tests, browser and native fixture journeys sequentially; run core `npm run verify`. Reviewer checks spec first then quality. Record live provider/real Coven smoke separately as unverified unless explicitly authorized/configured.

## Verification
Run regressions before implementation to establish failing behavior, then focused passes.
Use actual document mutation/undo and real local transports; no source-matching tests.
Run `UV_CACHE_DIR="$PWD/.runtime/uv-cache" TMPDIR="$PWD/.runtime/tmp" npm run verify`.
No build concurrent with built asset tests; no shared Vite optimization across concurrent harnesses.

## Status
Local desktop implementation verified; original remote/existing-instance scope remains incomplete.

- Portable pack: 15 entries, content hashes, safe installation/readback, interrupted-install retry; independent spec and quality reviews passed after FIFO/binary-hash repairs.
- Proposal/document: detached validation, bounded capabilities, exact-base fences and one undo step; quality regression fixed explicit placement when default grid is full.
- Host/UI: dedicated Studio-owned local Coven and general Codex paths, native-confirmed requests, isolated IPC, cancellation and saved setup identity. Actual provider authentication remains unverified.
- Focused command: `node --test preview/tests/studio-designer.test.js preview/tests/studio-document.test.js desktop/tests/studio-command.test.js desktop/tests/studio-designer-host.test.js desktop/tests/studio-skill-pack.test.js` — 34 passed, no skips (`.runtime/designer-focused-final.log`).
- `npm run verify` with worktree cache/TMPDIR — passed (`.runtime/agent/core.json`, `.runtime/designer-core-final.log`): agent17, preview2574+1skip, server295+105skip, desktop30, Python141; build/lint/format/secrets pass; demo verifier expected blocked exit2.
- `node desktop/designer-e2e.js` — 7 checks passed (`.runtime/agent/studio-designer-native.json`), actual Electron IPC/subprocess with synthetic Coven fixture, no paid calls or real familiar creation.
- `node desktop/studio-e2e.js` — 9 existing native regression checks passed (`.runtime/designer-native-regression.log`).
- `npm run test:experience -- world-studio` — passed (`.runtime/designer-browser-final.log`), including browser-without-host refusal.
- Native screenshot: `output/playwright/world-studio-designer.png`.

## Remaining gaps
The installed Coven `v0.4.8-10-ge6fc281f` lacks `familiar-ledger`; native setup refuses before identity creation. Codex readiness passes, but provider authentication has not been exercised. See `.runtime/agent/studio-designer-runtime.json`.
Remote paired Cave setup, existing Cave familiar connection, browser-hosted agents, additional providers and project-memory management are incomplete. No full Redis/production auth, real provider, signed packaging, human accessibility or deployment acceptance is claimed.
Preserve the dirty worktree. No commit/push/merge/deploy authorized. Next action: use a Coven runtime that supports the identity ledger for an authorized live familiar smoke, or implement the remaining paired API boundary in a separately owned Cave worktree.

## Runtime preparation — 2026-10-11
Built unchanged Coven source `2668a67a78324051ade303d4fed21f50931cf1cf` into `.runtime/designer-dev-20261011/target/debug/coven` with explicit source version stamping. Global CLI unchanged. Fixed `connect` capability discovery to use `help --all`; the abbreviated help omits the ledger on compatible builds. Fixture regression failed before and passed after (4/4). Actual CLI setup/register/readback passed for both paths in an isolated smoke workspace; no model task sent. Fresh core gate passed. Native dev launch uses existing WorkOS configuration and currently waits for GitHub sign-in. Full current receipt: `.runtime/designer-dev-20261011/receipt.json`; restart: `.runtime/designer-dev-20261011/open-studio.command`.
