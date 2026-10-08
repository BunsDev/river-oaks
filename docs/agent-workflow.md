# Coding-agent workflow

Start at [AGENTS.md](../AGENTS.md), then use the [task map](architecture.md).
The executable catalog is `config/agent-workflow.json`; commands below work from
the repository root and use existing suites without external account credentials.

## Bootstrap

Use Node >=22.12 (CI: Node 24), Python >=3.11 (CI: 3.11/3.13), uv, Git and Gitleaks.

```sh
npm ci
uv sync --locked
sh scripts/install-hooks.sh
npm run agent:doctor
npm run agent:list
```

Install Gitleaks before committing; the guard fails closed without it. Bootstrap
downloads locked dependencies. Browser installation is separate and explicit:
`npx playwright install chromium` (Linux CI uses `--with-deps`). Optional voice,
GIS, native assets and provider keys are not required for the core gate.

Do not load/copy `.env` into test sessions. Use the existing fixture runners for
approved test identities. Normal `npm run dev` follows the actual access gate;
it is not an unattended test fixture.

## Choose a gate

| Command | Scope |
| --- | --- |
| `npm run verify -- tooling` | Agent runner failure/timeout/prerequisite regressions and catalog consistency |
| `npm run verify -- preview` / `server` / `desktop` / `build` | Focused existing suite or build for the owning runtime |
| `npm run verify -- web` | Agent, preview, server, desktop unit tests; production web/landing build |
| `npm run verify -- python` | Ruff, Python tests, offline synthetic pipeline |
| `npm run verify` | Web + Python + worktree secret guard; default `core` |
| `npm run verify -- security` | Worktree and full local Git-history secret scan |
| `npm run verify -- browser` | Build, security browser regressions, WebGL reflection, contextual action/photo/command journeys and all shared-town journeys |
| `npm run verify -- full` | Core + mandatory Redis server tests + npm dependency audit + history scan + browser journeys |

`npm run agent:doctor -- full` prints JSON prerequisite diagnostics, exits 2 when
something is missing, and does not start services/install packages or read env
files. It checks presence, not service health or dependency freshness. The actual
suite proves connectivity and behavior. `agent:list` prints the task catalog. For JSON-only output, use
`npm run --silent agent:list` or `npm run --silent agent:doctor`.

For full verification, start a disposable Redis service separately and set
`REDIS_URL` to that isolated test service in the invoking environment. Never point
it at production or run FLUSHDB. Without REDIS_URL, `full` blocks; `core` permits
the existing suite's Redis skips and is explicitly narrower.

On Linux, use the same CPU browser setup as CI:

```sh
RIVER_OAKS_SHARED_SOFTWARE=1 RIVER_OAKS_SECURITY_SOFTWARE=1 RIVER_OAKS_EXPERIENCE_SOFTWARE=1 \
  LIBGL_ALWAYS_SOFTWARE=1 LP_NUM_THREADS=2 \
  xvfb-run -a npm run verify -- browser
```

The shared runner uses temporary identities and owned servers; CPU rendering
proves fixture behavior, not visual quality. On macOS, run the browser profile
directly. Browser tasks have longer deadlines and require functioning WebGL2.

For a changed browser interaction, also run its named journey, for example:
`npm run test:experience -- hud-and-quality`. Desktop changes may require
`npm run test:desktop:e2e`. Native changes require the build and automation
commands in [Unreal setup](unreal.md); source-only hosts can run
`RiverOaks.Contracts` after a native build. These are not silently included in
`full`, which covers the listed local runtime checks. The hosted Python-version matrix and
Python dependency audit remain separate CI gates. Live WorkOS, hosted routing, packaged
apps, real voice, human keyboard/VoiceOver and target GPU performance require
separate acceptance evidence appropriate to the change.

## Receipts and failure handling

The runner executes tasks sequentially, stops on the first failure/block, and
writes `.runtime/agent/<profile>.json` before, during, and after the run. Exit codes:
0 passed the selected checks, 1 failed/invalid command, 2 missing executable or
required environment. Each task records its command, expected/actual exit,
duration and status. Remaining tasks are `not_run`. Console output retains
underlying test counts, skips and diagnostics; receipts do not capture output or
credential values. On macOS/Linux, timeouts and handled interruptions stop the owned process group.
Windows process-tree cleanup has not been verified. A forcibly killed runner may leave `status: running`; that is incomplete,
never passing. Do not run the same profile concurrently in one worktree because
the latest receipt replaces the previous one. Receipts include HEAD and dirty
state but do not identify the exact uncommitted diff; hand off the patch too.

The offline demo's expected exit 2 is a tested domain result (missing real-world
acceptance inputs), not a waiver for other tasks. Existing browser reports remain
in `data/reports/` and screenshots in `output/playwright/`; inspect `git status`
after acceptance runs and keep evidence changes separate from source changes.

A failed gate needs diagnosis at its owning seam. Do not weaken a threshold,
turn off auth, add sleeps, or count skipped checks as a fix. Record unrelated
baseline failures separately and keep their evidence visible.

## Delivery

Maintain a concise task ledger with files owned, required behavior, commands,
results, and remaining work. Review `git diff --check`, `git diff --stat`, and the
actual diff. Verify before any commit. Deliver a handoff with branch/worktree,
changes, tests, proof gaps and next action. Commit/push/merge/deploy require the
user's task authorization; successful local verification alone grants none.
