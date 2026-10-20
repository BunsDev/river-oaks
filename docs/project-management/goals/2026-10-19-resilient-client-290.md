# Goal: a resilient play client. Survive graphics loss, backgrounding and network changes without a reload (#290 web side, plus the #288 touch-hold subset)

Work on your own for up to about 10 hours, or until the finish line is met. When something needs Val, record it under Decisions for Val and keep going. Never wait for an answer.

## Why this, and why now

- **The failure is real.** On a physical phone (register task `procedural-gpu-acceptance`, 2026-10-15), the client lost its WebGL context 22.58 s into startup. At 25.80 s it showed "Preview unavailable" and the guest disconnected.
- **There is no recovery path.** Today the client always shows that fatal panel. The `webglcontextlost` handler in `preview/src/main.js` (near `initializeRenderer`, ~line 250) calls `preventDefault()` and then `showError('… Reload this page …')`. It never attempts a restore and never bounds a crash loop.
- **It unblocks iOS.** Recovering from suspension, disconnects and renderer loss is acceptance item #290 of the iOS rollout (#284). Val chose iOS and macOS as the Apple target platforms on 2026-10-18. The browser-side half needs neither a native host (#286, gated on #285's architecture decision) nor a physical device to build. It also helps every desktop and laptop player.
- **Parts already exist; reuse them, don't duplicate them.**
  - `preview/src/render-lifecycle.js` (`bindRenderVisibility`) stops rendering while the page is hidden.
  - `preview/src/multiplayer-client.js` resumes on `online` and when the page becomes visible.
  - `main.js` cancels the selection gesture on blur, `visibilitychange` and `pointercancel`.
  - `preview/src/debug-report.js` counts context losses and restores.
  - Connection continuity from #447 and #454 handles socket rotation and the voice lease. See memory `connection-continuity`.

## Finish line

1. **Graphics loss recovers in place.** On `webglcontextlost`, the game pauses and shows a non-fatal "Restoring graphics…" state. On `webglcontextrestored`, it rebuilds what three.js doesn't rebuild on its own, resumes rendering, and keeps the player's session, position and open UI. Recovery is bounded:
   - If no restore arrives within a timeout, or more than N losses happen within a window, show a visible "Reload graphics" retry.
   - Step down the quality tier, and persist the step-down so the reload doesn't crash the same way.
   - Never sign the player out.
2. **Leaving and returning is safe.** Blur, `visibilitychange` to hidden, `pagehide`, and bfcache restore (`pageshow` with `persisted`) must:
   - clear held movement keys, touch movement and look, and pointer captures;
   - turn push-to-talk transmit off and stop unneeded audio and polling.

   On return the player gets a fresh authoritative snapshot, and nothing moves on its own.
3. **Network changes have honest outcomes.** Going offline and back online leaves the connection UI truthful. An action the player started before the drop resolves as completed, refused or unknown through the existing command contracts. A stale mutation is never replayed blindly.
4. **No stuck touch input (#288 subset).** Moving and looking at the same time, adding a second finger, and an interrupted hold (`touchcancel`, `pointercancel`, a system gesture, the page hiding) never leave the player stuck moving and never select something by accident.
5. **Proof.** Each behavior has a focused unit regression and a browser journey that drives real events. `pnpm run verify` passes. The work sits in one or more PRs ready for review, each with exact commands, results, skips and limits. A ledger and a short checklist for Val to run on a physical iPhone and Mac cover what browsers can't prove.

A plan, a mock or a screenshot doesn't count as any of these.

## Authority (Val: edit before pasting)

Authorized:
- Create a sibling worktree and branch.
- Claim a register task.
- Make signed commits, push, and open PRs over REST.
- Rerun failed jobs on your own PRs.
- Post one evidence comment on #290, and on #288 if you touch it, per increment.
- Install the Playwright WebKit browser if it's missing: `pnpm exec playwright install webkit`.

NOT authorized:
- Merging or landing. Every merge to `main` deploys production in about 35 s.
- Deploys, Vercel env changes, paid services and large asset downloads.
- Editing another owner's worktree, branch or PR. This includes draft #309, Codex's iOS probe: read it for prior WebKit cases, but don't edit it.
- Native iOS project work (#286). Closing issues.

Optional replacement for the first NOT bullet:

> Landing is authorized only through `pnpm run land <pr> --owner <you>`, for this goal's PRs whose full local and hosted gates are green, with at most one landing at a time. After each merge, confirm the production deployment and smoke-test sign-in on production.

## Non-negotiables (copy into every subagent prompt)

- Never delete, move or clean `~/.coven`. Tests use a scratch `COVEN_HOME`.
- **Signing.** Before your first commit, confirm `user.signingkey` and `gpg.format` are set. Commit with `git commit -S`, then confirm `git log -1 --show-signature` prints Good. Check for unsigned commits before every push. GitHub's own merge commits show `E` locally; confirm those over REST.
- **Attribution.** Val is the only author. The single trailer line is `Coven-Harness: Claude Code / <your model id>`. No `Co-Authored-By` for Claude or any vendor, and no "Generated with" footer on commits, PRs or comments. Run the trailer grep from `~/.claude/CLAUDE.md` before pushing.
- **GitHub.** Merge only through `pnpm run land`, which calls `gh-merge-when-green.sh`. Never parse `gh` table output. Prefer REST, because the GraphQL budget is shared by every session.
- **Credentials and access.** Never read `.env` or print credentials. Never relax WorkOS, waitlist or CSRF checks. Use fixture identities only through the existing acceptance harnesses.
- **Tests.** Never add sleeps or loosen thresholds to pass a test. Preserve coordinate units, authoritative movement and collision, and late-response fences.
- **Git safety.** No `git stash`: it's shared across worktrees. No `branch -D`, no `rm -rf` on a worktree, no force-push. Use `git -C <path>` or `cd <path> || exit`.
- **zsh.** `path` clobbers PATH, unquoted lists don't word-split, grep is ugrep, sed is BSD.

## Concurrency and load

- Before claiming, run `ListAgents` and read the live register's owners and leases. Grep `~/.codex/sessions/2026/10/*` for `#290`, `#288`, `webglcontext` and your branch. Leave anything with a live owner alone.
- Before each commit, read your register owner again. If it changed, stop and leave a handoff note.
- Run `verify` and builds under `nice -n 19`. Browser journeys go through the browser lock, and never alongside your own `verify`.
- Read `uptime` before trusting any journey failure. Above about 100, assume load until a rerun on its own says otherwise.
- Install with a private pnpm `--store-dir` in your scratchpad. If a familiar disk sweep deletes `node_modules`, rerun `pnpm install --frozen-lockfile`.
- Use your own ports, never 5173, 5180, 5196 or 5198. Run watchers from a worktree you own.
- Run at most two subagents at once, each in a sibling worktree you created and registered.

## Start

1. **Fetch and read.**
   - Run `git fetch origin`.
   - Read `AGENTS.md`, `docs/agent-workflow.md` and `docs/project-management/workflow.md`, plus `preview/AGENTS.md` and any other scoped `AGENTS.md` you touch.
   - Read #290, #288 and #284, the `procedural-gpu-acceptance` register entry and its ledger, and these memory files: connection-continuity, e2e-harness, browser-journey-traps-20261015, software-render-glass-starvation, own-load-scheduling, pnpm-store-race, ci-triage, merge-queue-coordination.
2. **Check main.**
   - If `main`'s latest Verify is red and no live peer owns the failure, spend at most 45 minutes on it first: diagnose it and open a PR, or record it.
   - At 17:40Z on 2026-10-19, the scheduled run on 7c10f418 had failed `garden-campus-traversal` with "T1 lift to Floor 2: expected garden-campus/l1, the server says null", and the same SHA had passed at 06:29.
   - 4b owns the local `ipic-short-intake` failure.
3. **Claim.**
   - Claim task `resilient-client-290-<yyyymmdd>`. The owner is `claude:river-oaks-<session name> (<session id 8>)`, with a 2 h lease that you renew.
   - Use worktree `../river-oaks-resilient-client-290` on branch `feat/resilient-client-290-<yyyymmdd>`, created from `origin/main`.
   - The live register is in the common Git directory (#548, 11213112). Read it with `pnpm run --silent register show [<id>]`. Write it with `pnpm run register patch <id> --json '{...}'`; add `--create` for a new task and `--unset leaseUntil` to drop a lease. Never edit or commit `docs/project-management/tasks.json`: Verify refuses PRs that change it. Branches older than 11213112 read a stale snapshot, so create yours from current `origin/main`.
   - Ledger: `docs/superpowers/plans/<date>-resilient-client-290.md`, with sections for objective, files owned, baseline, increments, commands, results, gaps and next action.
4. **Baseline.** Write a failing journey that calls `WEBGL_lose_context.loseContext()` on the real game canvas, waits, then calls `restoreContext()`. Record what happens today: the fatal panel, frames stopping, and the multiplayer state.

## Increments (one PR each from `origin/main` where independent; otherwise one branch listing its increments)

### 1. Graphics recovery

- **State machine.** Put the recovery state machine in a small pure module (for example `preview/src/graphics-recovery.js`) with its own unit tests. States: `ok`, `lost`, `restoring`, `failed`. It covers the timeout, the loss window, and the persisted tier step-down.
- **Rebuild audit.** On restore, check everything that holds GPU state that three.js won't rebuild by itself, and rebuild what's needed:
  - render-pipeline render targets and passes (AO, bloom, MSAA);
  - the PMREM and environment maps from `loadEnvironment`;
  - shadow maps;
  - resident and player portrait caches;
  - storefront reflection probes;
  - KTX2/Basis and DRACO decoder state;
  - quality-control measurements, which reset when the loop restarts.
- **Pause cleanly.** While lost, pause the loop through the same seam `bindRenderVisibility` uses, and fence any frame callbacks that arrive late.
- **Use the debug report.** `debug-report.js` should record each cycle's timing and outcome.
- **UI.** Show a quiet, accessible status (`role=status`) and a retry button that keeps focus, using the existing glass sheet patterns. The fatal panel stays only for "WebGL unavailable at startup".
- **Tests.**
  - Journey: lose, see the status, restore, then see frames advancing again (`data-render-stats` or a non-blank pixel probe), the avatar visible, and walking working.
  - Crash loop: past the limit, the retry appears and the tier steps down.
  - No restore: the retry appears after the timeout.
  - Five cycles leave `renderer.info.memory` and listener counts bounded.

### 2. Backgrounding and held input

- **Audit and fix.** Check every held-input source (walking keys, `tablet-touch.js`, look drag, bird-cam and office key maps, push-to-talk). Each must clear on blur, on hidden and on `pagehide`.
- **bfcache.** On restore, take a fresh snapshot and reset time.
- **Tests.** Journeys in Chromium (and WebKit if feasible) dispatch real visibility, blur and `pagehide` changes in the middle of movement, then check that the position stops changing and transmit is off.

### 3. Network transitions

- Use Playwright's `context.setOffline()` to go offline in the middle of an action (travel, sit, an office or desk command), then back online. Check that the connection UI is truthful and the action's outcome is explicit.
- Reuse #447's continuity; this increment may be mostly tests plus small fixes at the seam that owns each problem.

### 4. Touch-hold safety

- Write a touch journey with `hasTouch`, based on `preview/e2e/touch-people.js` and `carriage-mobile.js`. Cover moving and looking at the same time, a second finger, cancel events, and the page hiding during a hold.
- Fix any stuck state where it originates.

### For every increment

1. Write the failing regression first.
2. Run the focused tests.
3. Run `nice -n 19 pnpm run verify`.
4. Run the new and affected journeys under the lock: at least `hud-and-quality`, `contextual-first-visit`, and the shared multiplayer journeys if you touched connection code.
5. Make a signed commit, push, and open the PR over REST.
6. Watch hosted CI over REST no more often than every 10 min, and rerun failed jobs once. Diagnose a second failure instead of rerunning again.
7. Add a new journey to a CI shard only if it fits the shard's time budget. Otherwise label it local-only in the PR and in `docs/testing.md`.
8. Update the ledger, renew the lease, and post the #290 comment.

## Stop rules

- **Stop an increment** and record it under Decisions for Val, then move on, if:
  - it needs a native host;
  - it needs a device you can't emulate;
  - an owner appears;
  - a safety check refuses;
  - CI fails a second time without explanation.
- **Don't simplify the goal away.** Don't swap in "reload the page automatically" as the fix. An automatic reload is allowed only as the bounded last step, and it keeps state.
- **When everything is done or blocked,** review the work adversarially and fix what you find. Try: a loss during a scene transition, a loss during photo mode, a loss while a sheet is open, two players, low-memory tier, a loss mid-restore, and a context that never restores.

## Handoff

Finish and push the ledger. Your final message reports:
- each PR: its number, head, CI state, what's proven and what isn't;
- what ran in WebKit versus Chromium;
- skips and limits.

Include a five-minute physical checklist for Val:
1. iPhone Safari: lock and unlock in the middle of a walk, airplane mode on and off, a long background, then return.
2. Mac Safari: switch tabs during a walk.
3. What to look at and where it shows in the debug report.

Then list numbered Decisions for Val, each with its exact PR or command. Release your lease, or extend it to cover the handoff. Save anything non-obvious you learned to memory.
