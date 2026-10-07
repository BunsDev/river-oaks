# Native developer diagnostics

The first slice observes the native `ARiverStreetPawn` without changing movement.
In Development/Debug editor or game builds, click the play viewport and press:

| Key | Action |
| --- | --- |
| F7 | Enable/disable and reset local diagnostic history |
| 1 | Movement: capsule, desired direction, floor probe, actual blocking hit/normal |
| 2 | Camera: position, horizontal FOV/aspect, finite view cone and center guides |
| 3 | World: selected/blocking component bounds, query collision and static mesh asset path |
| 4 | Network: owner, local/remote roles, replication flag, net mode and PlayerState ping |
| F6 | Select the first visibility-blocking component within 20 m of the camera center |

F7/F6 avoid Unreal's default F8 possess/eject and F9 screenshot bindings.
All layers toggle independently. F6 misses clear the selection; the actual blocking
component is the fallback. Bounds are guides, not exact collision geometry. Full
world collision and mesh edges use Unreal's `show collision` and `viewmode wireframe`
console tools where supported. This does not change collision or assets.

## Reproduce an edge blockage

1. Play the district, enable F7 and approach a building edge while holding W.
2. After 0.35 seconds with less than 10% of requested horizontal displacement,
   the overlay reports sustained blockage only if the actual movement sweep
   blocks or district bounds clamp movement.
3. Inspect the red contact point/normal, hit actor/component, requested versus
   actual displacement, likely cause and suggested fix. Initial penetration gets
   its own diagnosis. Moving tangentially must count as progress; releasing input
   clears current stuck state.
4. Toggle camera/world layers and select the edge with F6. The timeline holds
   at most 48 timestamped local samples, shows up to five recent samples, newest
   first, and links input to bounds, actual sweep and resulting position. E greeting attempts
   also record their local outcome.
5. Disable F7. History and selection reset; diagnostic traces/drawing/recording stop.

The pawn is fixed at Z=88 cm by `ConstrainVisitor` and moves with a swept capsule.
It has no CharacterMovementComponent, step-up height, walkable-slope solver or
player mesh. Those fields are explicitly unsupported rather than assigned guessed
values. A visibility floor probe within 100 cm below the feet is supplemental
evidence; it is not an authoritative movement-floor test. Camera guides use the local player's effective projection, including its viewport
aspect and axis constraint; the HUD reports unavailable when there is no perspective
projection. They are not measurements of lens distortion or renderer clipping. Instanced meshes use the hit
instance’s transformed bounds. Object selection identifies
collision/assets; it does not diagnose arbitrary actor behavior or expose
interaction zones without dedicated instrumentation.

## Cost and build exclusion

No world enumeration, debug RPCs, replication or persistent debug lines. Floor
sampling is at most 10 Hz and only runs with the movement layer enabled. Selection
uses one trace on F6. Debug shape complexity and history capacity are bounded.
The existing HUD adapts text to the viewport and clips excess rows above the normal
interaction prompt. F7 is opt-in; Shipping and Test compile out the recorder,
controls and debug view using `!UE_BUILD_SHIPPING && !UE_BUILD_TEST`.

## Multiplayer boundary and next slice

The native pawn currently has no replicated player movement or gameplay RPC chain.
Role/owner labels describe local actor state. PlayerState ping is connection-level
latency, not an action round trip. Server processing, acknowledgement, replication
receipt and rendered-pixel confirmation are unavailable; the timeline does not
invent these events. The HUD presents the latest local position sample.

The next networking slice needs authoritative player movement and a bounded,
development-only correlation ID across input, server acceptance/rejection, replicated
state receipt and presentation. Validate with two PIE clients, a dedicated server,
packet lag/loss and authority rejection. Follow that with interaction-zone providers,
richer asset labels and a character movement migration for true step/slope
semantics.

## Verification

Build Editor/Game Development and Game Shipping using the installed UE 5.8 toolchain.
Run `Automation RunTests RiverOaks.Contracts` with the commandlet editor and NullRHI.

Historical verification before the hotkey/projection reconciliation below:

Verified locally on 2026-10-06 with UE 5.8.2 on macOS:

- Editor Development, Game Development and Game Shipping compilation passed.
- All 24 Contracts passed: classifier cases, actual capsule collision/sliding, and
  simulated local-player input through the real pawn tick. The input test enables
  F8, holds W into a low edge, checks its component in the timeline, releases W,
  then disables F8 and checks history reset.
- Report: `/tmp/river-diagnostics-contracts-verified/index.json`; log:
  `/tmp/river-diagnostics-contracts-verified.log`.
- Live Development play checked F8 enable/disable, independent layer toggles,
  F9 selection with per-instance asset identity, and readable word-wrapped HUD
  text with newest timeline samples first.
- Shipping executable string inspection found no overlay header, penetration
  diagnosis or timeline header. All diagnostic declarations and implementations
  are guarded out of Shipping/Test; Test configuration was not separately built.

Human edge-play acceptance, frame-cost profiling, multiplayer causality and a
cooked/staged package remain unverified. Repeat the in-play scenario and profile
with `stat game` before claiming performance acceptance. Game target compilation
alone does not establish packaged-build behavior.

Current reconciliation and fresh automation results are tracked in
[the delivery ledger](superpowers/plans/2026-10-07-main-reconciliation.md). The earlier
rendered checks used F8/F9; they do not establish current F7/F6 PIE acceptance.
