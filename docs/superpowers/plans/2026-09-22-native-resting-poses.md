# Native resting poses and gait transitions

> **For agentic workers:** Use `subagent-driven-development` for the independent gait-blend helper and native pose integration, with source review before delivery.

**Goal:** Replace the native reference A-pose with a relaxed stance and make gait strength settle smoothly when residents start, stop, or enter a conversation.

**Architecture:** Keep `URiverLocomotionAnimInstance` as the authoritative state/distance input. The procedural proxy owns presentation-only blend state; it never changes component position, simulation state, or accepted travel distance. Resting arm corrections use the neutral +Y-facing rig basis established by importer v3.

**Stack:** UE 5.8.2 C++, native automation, rendered district acceptance.

- [x] Add a failing six-profile resting-pose regression: wrists at pelvis height or below, elbows above wrists with slight forward flexion, hands outside the thighs, existing facing/root-authority assertions retained. Joint probes showed that the shorter rigs' combined arm length cannot reach a fixed 5 cm below the pelvis; preserve their proportions and allow 1 cm joint-position tolerance.
- [x] Add a small independently testable critically damped gait-strength blend. Verify time-step consistency at 30/60/144 Hz, continuous interruption, finite input handling, independent residents, and settling after a stop. Observe red tests before implementation.
- [x] Apply relaxed shoulder/forearm rotations in the procedural proxy. Convert component-space corrections to bone-local rotations using the updated parent chain, so the lowered shoulders do not distort subsequent elbow/gait axes.
- [x] Integrate the blend into the proxy; preserve gait phase through stops and prevent state changes from instantly snapping limbs back to rest. Verify the actual evaluated mesh retains then settles its leg pose after stopping.
- [x] Build Editor and Game, run all native assets/contracts, inspect rendered rest/start/stop behavior, and record the visual coverage limits.
- [x] Update native-resident documentation and evidence, obtain independent review, and run applicable checks.
- [ ] Commit/push/merge through a PR. Keep the browser dev server and local generated assets.

This pass does not replace authored animation, foot IK, contact solving, native worker routines, or complete motion acceptance. The full interaction and realism goal remains active.
