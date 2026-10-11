# Optional bridge proxy availability

Objective: handle the absent optional Python bridge without repeated Vite stack
traces or pretending provider settings are configured. Preserve forwarding and
recover automatically when the bridge starts.

Owned files: preview/vite-bridge.js, preview/vite.config.js,
preview/tests/vite-bridge.test.js, this ledger. Delivery worktree river-oaks-bridge-proxy-20261009, branch fix/optional-bridge-proxy.
Existing unrelated edits and staged files are preserved.

Evidence: /v1 and /health unconditionally proxy to 127.0.0.1:8765; nothing is
listening there. README documents the bridge as a separate optional process.
Settings already show a bridge-unavailable message on non-2xx responses.

Checks: real loopback HTTP tests for offline responses, warning deduplication,
recovery, forwarding, and timeouts; production build; core verification.
Status: patch and local verification complete; user authorized commit, push, and merge.

Implemented: a development-only streaming HTTP bridge middleware replaces the
unconditional Vite proxy for /v1 and /health. Network failures return no-store
503 JSON with bridge_unavailable, emit one actionable warning per outage, and
retry naturally on later requests. A 30-second upstream idle timeout bounds hangs.
No key write is reported as successful, and response status/body are preserved.

Verification:
- `node --test preview/tests/vite-bridge.test.js`: 4 passed. Real loopback tests
  cover absent/restarted bridge, failed key writes, request/body/query and binary
  response forwarding, unrelated routes, timeouts, and actual Vite error logging.
- `npm run verify`: passed all 11 tasks, including production build and secret scan.
  Core allows existing skipped Redis tests; it is not full/native/live acceptance.
- `git diff --check`: passed.
- Running Vite on port 5173 returned HTTP 503 for /v1/settings/jev after reload.
No paid services or real credentials were used. The Python bridge remains stopped;
start `uv run river-oaks serve` separately to enable its capabilities.

Isolated delivery verification: `npm ci --ignore-scripts`, `uv sync --locked`,
`npm run agent:doctor`, and `npm run verify` passed. Preview: 2508 passed/1 skipped;
server: 276 passed/102 skipped; desktop: 9 passed; Python: 141 passed/2 warnings.
All 11 core tasks passed, including the build and secret scan. Expected offline
demo verification exit 2 retained. Unrelated edits remain in the original worktree.

Next: commit the four owned files, push the branch, and merge after hosted checks.
