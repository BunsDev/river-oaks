# Fragrance paper release

The fragrance worker currently pinches the strip for the entire task. Finish
the demonstration by resting the paper in an angled holder on the sample tray, clearing the hand,
and re-grasping before the next lift. Keep the current district and work clock.

The paper's distal end rests in a small open-ended spring clip. The worker
re-grasps its short end, slides it out, then raises it for inspection. Insertion
reverses that path. Fingers clear the short end along the paper before relaxing.
The initial flat-tray design was rejected after tests exposed excessive wrist
flexion; the angled holder keeps the wrist relaxed while providing real support.
Unsupported workers keep holding it. Conversations and visibility
suspension retain the existing authoritative work-time behavior.

- [x] Add real-rig regressions for supported paper, actual release, re-grasp,
  continuity, hand/paper intersections and bone/source preservation. Confirm
  the baseline fails because the paper never lands or releases.
- [x] Update `preview/src/work-props.js` to blend the paper's supported and free
  poses and withdraw the pinch only while the paper rests in its holder.
  `preview/src/blotter-rest.js` owns the holder geometry and its disposal.
- [x] Preserve the unsupported-load regression and existing contact limits.
  Run focused tests, then `npm test` and `npm run build`.
- [x] Update rendered fragrance/contact checks for released versus held paper.
  Verify both real fragrance workers at 30, 60 and 120 Hz, conversation pauses,
  suspension, and actual hand/furniture clearance. Inspect rendered views.
- [x] Request independent review, address findings, and record evidence and
  remaining full-goal limits in `docs/people-interaction-progress.md` and
  `data/reports/browser-fragrance-release.json`.

Work remains in `people-motion-delivery`. Retain unrelated changes and the
pre-change snapshot recorded in `/tmp/river-strip-release-backup.json`.

Review found lateral wrist deviation during insertion and a support post
crossing the hand. The final regression checks the 20-degree lateral limit and
every stand solid. The denser live test also exposed a pre-existing carried-hand
intersection with the tray; unsupported paper now stays above it throughout the
demonstration. These findings must pass regression before completion.

Final close-up review exposed fingers intersecting one sample bottle. The
fragrance-only tray now moves that bottle and cap out of the approach path.
Both-hand triangles clear all six actual convex bottle/cap meshes across six
rigs; independent 60 Hz checks and rendered acceptance pass. All 283 tests, the
production build, 12 fragrance cases, 62-worker contact checks, and 23 carriage
checks pass. This plan is complete; the broader goal retains its documented
native and realism limits.
