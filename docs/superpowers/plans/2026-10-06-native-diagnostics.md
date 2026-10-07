# Native Diagnostics Implementation Plan

**Goal:** Diagnose the native walking pawn getting blocked at an edge during play.

**Architecture:** Instrument the existing swept movement without changing its outcome. A development-only recorder stores at most 48 timestamped observations. The existing HUD renders a compact diagnosis and independent debug layers using Engine debug drawing; no plugin, RPC, or replicated debug state is introduced.

**Tech stack:** Unreal 5.8 C++, Canvas HUD, DrawDebugHelpers, native automation.

## Execution ledger

- [x] Add deterministic classification tests for idle, sliding, sustained blocking, initial penetration and district bounds.
- [x] Add recorder/classifier in `RiverDeveloperDiagnostics.h/.cpp`. Input and collision observations come from the actual pawn tick; optional floor traces run at 10 Hz and selection traces run on F9. Retain a bounded timeline and reset on disable.
- [x] Integrate F8 enable, F9 select, 1–4 layer toggles in `RiverStreetPawn.cpp`. Exclude recorder, input handling and debug drawing in Shipping/Test. When disabled, perform no diagnostic traces or recording.
- [x] Draw capsule, floor contact, desired/actual movement and blocking normal; camera FOV guides; selected primitive bounds and asset identity; owner, roles, replication flag and measured player ping when available. Clearly label unsupported step/slope solving and missing native player networking.
- [x] Build Editor and Game Development targets and run `RiverOaks.Contracts.DeveloperDiagnostics`. Add synthetic collision and local-player input tests, then run all Contracts (24 passed). Run Shipping compile and inspect executable strings to verify exclusion.
- [x] Document in-play edge reproduction and multiplayer follow-up acceptance. Record runtime/visual acceptance gaps honestly.

## Follow-up slices

1. Replace fixed-height pawn movement with an explicitly designed character movement system before promising walkable slope/step semantics.
2. Add native authoritative multiplayer movement; correlate actual client input IDs with server processing and replication receipt. Never infer server events from client role labels or ping.
3. Add interaction-zone providers and richer per-instance asset labels. Use engine collision/wireframe views for full-world geometry rather than iterating every object each frame.

## Acceptance scenario

Play RiverOaksDistrict; approach a building edge while holding W; enable F8. After 0.35 seconds of negligible progress, diagnosis identifies the actual sweep component or bounds clamp. Release W: current blockage clears. Move tangentially: sliding must not be diagnosed as stuck. F9 selects under the center guide. Toggle each layer independently. Disable: traces/history stop and reset. Repeat with two PIE clients once native multiplayer exists; server evidence is explicitly unavailable in this slice. Shipping/Test expose no overlay controls.

The F8/F9 controls and nominal camera guide recorded here are superseded by
[the October 7 reconciliation](2026-10-07-main-reconciliation.md); current controls
are F7/F6 and the guide uses the effective viewport projection.
