# Repository task map

| Task | Owning seam | Verification and context |
| --- | --- | --- |
| Rendered world, controls, residents, movement | `preview/src/`, `preview/index.html`, `preview/vite.config.js` | `preview/tests/`, `preview/e2e/`; [testing](testing.md), [world direction](world-direction.md) |
| Shared state, accounts, access, world design | `server/`, `api/server.js`, `middleware.js` | `server/tests/`; [multiplayer](multiplayer.md), [world events](world-events.md) |
| Decision, speech, GIS and world exports | `src/river_oaks/`, `scripts/*.py`, `config/river-oaks.json` | `tests/`; [data contracts](data.md), [auto mode](auto-mode.md) |
| Native world and contracts | `unreal/Source/RiverOaks/`, `unreal/Config/`, `unreal/Content/Python/` | native automation; [Unreal](unreal.md), [engine acceptance](engine-acceptance.md) |
| Desktop lifecycle, packaging, IPC | `desktop/` | `desktop/tests/`, `desktop/e2e.js`; [desktop](desktop.md) |
| Public landing page | `landing-page/`, `scripts/build_landing_page.js` | `pnpm run build`; [landing page](../landing-page/README.md) |
| Tooling, checks and agent workflow | `scripts/agent.mjs`, `config/agent-workflow.json`, `.github/workflows/verify.yml` | `pnpm run test:agent`; [workflow](agent-workflow.md) |

## Runtime boundaries

The Vite client renders and accepts input. Shared-world commands cross HTTP and
WebSocket boundaries into the Node service, which owns authorization and shared
state. Redis is the distributed backend. Vercel routing and middleware are part
of that deployment boundary; local identity fixtures do not prove hosted auth.

The Python bridge serves bounded decisions and optional speech to the local
preview/native runtime. World acquisition and export are separate CLI jobs.
External model output never overrides local collision, schedule, or weather
constraints. Missing credentials must retain labeled local fallback behavior.

Electron wraps the web experience and owns native window/IPC behavior. Unreal
is a separate C++ runtime consuming exported data and asynchronous decisions;
a passing web build cannot establish native acceptance.

## Source and evidence

- `config/`, source modules, lockfiles, and authored tests are inputs.
- `preview/public/` contains bundled derivatives/assets: preserve attribution and
  provenance receipts. Some assets are large; inspect filenames before opening.
- `data/raw/`, `data/generated/`, `data/models/`, `dist/`, `.runtime/`, and native
  build directories are local/generated state. Do not commit them.
- `data/reports/` and dated docs contain historical evidence with explicit limits.
  Compare revision and scope before citing them as current.
- `docs/superpowers/plans/` holds task ledgers. Search for a relevant active task;
  do not scan every historical plan or assume a checked box proves live delivery.
