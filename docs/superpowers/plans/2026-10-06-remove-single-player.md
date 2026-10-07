# Remove single-player execution ledger

Approved scope: web and Electron only. Shared town is the sole gameplay runtime,
including local development. Preserve independent Python/Unreal tooling, shared
simulation modules, and multiplayer Jevica vehicles, companion, chauffeur and
speech. Preserve session canGrantWishes (publishing uses it).

## Tasks
- [x] Remove mode selection, fallback startup, solo controls and exclusive assets.
- [x] Remove browser-owned community simulation and solo action alternatives.
- [x] Simplify avatar, walking, seating, places and navigation to shared behavior.
- [x] Migrate retained browser/desktop coverage to authenticated town fixtures.
- [x] Update current docs/configuration; retain historical evidence.
- [x] Verify unit/server/desktop/build/browser suites and review final diff.

## Acceptance
No legacy env flag, URL or preference activates solo play. Admission and a valid
snapshot are required for gameplay; disconnect never starts local simulation.
No removed-feature assets or modules remain in shipped bundles. Two-client
synchronization and owner/visitor capabilities remain correct. Preserve device
preferences, ignore old solo state without importing it to accounts.

## Evidence
- Browser unit suite: 642 passed, no failures or skips (`node --test --test-concurrency=2 preview/tests/*.test.js`).
- World and creator navigation tests: 55 passed.
- Desktop unit tests: 8 passed.
- Production build passed; existing large-chunk advisory remains.
- Admission/community focused checks: 16 passed. Disconnected town interactions: 2 passed.
- Source review found no runtime blockers; obsolete standalone navigation service/worker and their two tests were subsequently removed.
- Seven migrated legacy browser journeys passed ([receipt](../../../data/reports/legacy-migration-final.json)); real Kokoro voice synthesis returned HTTP 502 from the optional bridge (not accepted).
- Default experience: all 19 journeys passed across the full run and focused reruns ([receipt](../../../data/reports/multiplayer-only-experience-final.json)).
- Shared acceptance: all 18 journeys passed across the full run and two focused reruns ([receipt](../../../data/reports/multiplayer-only-shared-final.json)).
- Current harnesses retain real server transport; no solo fallback or local pose injection was introduced to make them pass.
- Full Redis-backed server suite: 329 passed, no failures or skips, against an isolated temporary loopback instance.
- Native Electron development acceptance: all 12 checks passed, including sandboxing, gameplay, fullscreen/minimize, HMR, external navigation blocking, and renderer crash recovery ([receipt](../../../data/reports/multiplayer-only-desktop.json)).
- WebGL reflection regression and landscape tree rendering checks passed.
- Final diff whitespace check and all 114 retained page-function harnesses parsed successfully.
- Implementation verification preceded the delivery commit. Historical reports are unchanged; new acceptance receipts are saved separately.

## Acceptance limits
Live Kokoro synthesis remains unverified because the optional local bridge returned HTTP 502.
Loopback fixtures do not establish live WorkOS, hosted deployment, packaged release,
human VoiceOver acceptance, or target-hardware frame-rate guarantees.
