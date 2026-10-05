# Rendered multiplayer capacity audit

Goal: extend the requested multiplayer readiness audit with repeatable measurements
of the actual browser scene while accounts dynamically join and reconnect.

## Contract

- Run only against an ephemeral loopback town with explicit synthetic identities,
  the shipped district, real WebSockets, and the full production rendering path.
- Keep Jevica's existing authenticated building/wish boundaries. The fixture uses
  the production admin predicate; all audit residents are guests.
- Measure 1, 8, 16, and 32 admitted players. Peers use mixed shipped appearances,
  send bounded movement updates and periodically wave. One real browser renders
  the crowd; other connections are transport actors, not additional browsers.
- Record frame interval percentiles, slow frames, snapshot receive gaps and bytes,
  gesture acknowledgements, loaded/on-screen avatar counts, renderer resources,
  effective graphics quality, asset failures, and browser/GPU identity.
- Record join/reconnect convergence and disconnect cleanup, including resource
  recovery. Fail on missing avatars, permission escalation, dropped connections,
  browser errors, asset failures, empty timing samples, or failed convergence.
- Desktop and phone-sized viewports measure this host GPU, not phone hardware.
  Fixed Sharpest quality establishes an unchanging baseline; Auto is an explicit
  alternative. No frame-rate threshold or global readiness claim without a target
  and hosted, multi-region, authenticated soak evidence.
- Development-only crowd camera and bounded frame instrumentation must disappear
  from production; no production transport or authority behavior changes.

## Delivery ledger

- [x] Ephemeral fixture and bounded measurement/report harness.
- [x] Development-only crowd view/frame measurements and failure diagnostics.
- [x] Focused metric/option regressions, complete local capacity run and cleanup.
- [x] Updated performance audit with measured scope, results and remaining gates.
Delivery requires a verified commit, terminal hosted checks, merge and production
smoke; the pull request records that evidence.

## Verification checkpoint

661 preview tests passed before adding the deadline boundary regression; the
four final audit tests passed, including that regression. Redis server: 255
passed, none skipped. Python lint/format and 138 tests passed. Desktop: six
passed. WebGL reflection smoke and the full-render multiplayer development
journey passed. Production build passed with audit hooks absent. Offline
pipeline verifier returned its expected blocked status (exit 2).

Eight Sharpest capacity samples and two 32-player Auto samples passed after
fixing the harness deadline/cooldown issue. Runtime/harness/lockfile hashes match
the final receipts. The performance audit records the client bottleneck and
remaining hosted, mobile and production profiling gates.
