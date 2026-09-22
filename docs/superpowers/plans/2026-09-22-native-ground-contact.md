# Native ground contact implementation plan

> **For agentic workers:** Use `executing-plans` for the sequential diagnosis, regression, correction, and acceptance steps. Request independent source review before delivery.

**Goal:** Remove the native standing gap by deriving resident root height from the supporting surface, while preserving district geometry and simulation authority.

**Architecture:** `ARiverOaksWorld` samples static support near the expected sole height before spawning or accepting movement. Roads participate in queries at their existing rendered height. Missing support, excessive steps, and steep surfaces reject movement. The skeletal backend continues to map the accepted root to the imported mesh without moving the simulation.

**Stack:** UE 5.8.2 C++, engine collision queries, generated importer-v3 resident meshes, native automation, and rendered district acceptance.

- [x] Add a failing engine regression in `RiverNativeGroundTests.cpp` for the current district's root-to-ground gap and road collision height. Add fixtures for a raised floor, upward/downward curb transitions, unsupported edges, excessive steps, and steep support. Give existing encounter fixtures actual floor collision.
- [x] Verify the failure before changing runtime code. Log measured root-minus-support height rather than inferring contact from shadows.
- [x] Add a private support query in `RiverOaksWorld.h/.cpp`. Accept upward-facing static hits within 30 cm of the previous sole height, preserve XY, and set root Z to support plus `HumanRootHeightCm`. Apply before spawn and movement acceptance. Enable road query collision without changing transforms. Held residents retain their accepted position.
- [x] Add six-profile resting shoe-geometry coverage in `RiverResidentAssetTests.cpp`, using the imported shoe vertices at the unchanged leg reference pose to verify the adapter's sole height. This is standing geometry evidence, not moving skinned-foot contact proof.
- [x] Build Editor, run the full native suite, build Game, and inspect rendered standing/conversation contact. Keep clear limits for foot IK, step animation, slopes, and broader motion realism.
- [x] Update `docs/native-residents.md`, the progress record, and a report containing measurements, source hashes, tests, and rendered evidence. Independent review and applicable local checks passed. Delivery proceeds through the PR checks before merging.

The broader interaction, worker-role, and hyper-realistic movement goal remains active. This pass establishes supported root placement; it does not claim planted moving feet, authored gait, or native worker parity.
