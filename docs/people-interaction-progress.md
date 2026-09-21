# People interaction and movement goal

Goal: people remain interactive wherever they are, occupations fit workers and
other visitors, and character movement becomes hyper realistic end to end.

## Current implementation

- Outdoor residents and every non-mannequin boutique staff/guest figure share
  encounter identities, dialogue, memory, role context and directory access.
- Indoor identities use the same IDs as their skinned meshes. Keyboard encounters
  stay in the visitor's room; directory selection can enter the person's store.
- Theme-specific occupations cover retail, dining, gallery, cinema, salon,
  eyewear and wellness workers. These are fictional staff, not actual employees.
- Indoor stations are excluded from outdoor routes and volunteer recruitment;
  adding people preserves the eight original support recipients and the bounded
  24-agent background packet.
- Outdoor body turns use elapsed time and the shortest angular arc, including
  turns toward conversation partners.

- Outdoor starts and arrivals now accelerate/brake; conversation and safety holds
  remain immediate. Feet use world-space targets, terrain-aligned orientation,
  alternating support/swing phases, hip-width stance and two-bone leg IK. Pelvis
  adjustment maintains reach through turns and slopes; stopped feet settle.

## Verification

- `npm test`: 105 passing tests after identity, turning, acceleration and foot IK changes.
- `npm run build`: passes; existing large Three.js chunk warning remains.
- `preview/e2e/store-encounters.js`: browser sweep of all 30 stores, checking
  same-room E conversations, role/location labels and encounter population.
  Passed on 2026-09-21: all 30 stores responded to E with a same-room person;
  directory contains 193 people (169 indoor plus 24 outdoor); no page errors.
  Screenshot: `output/playwright/store-encounters.png`.

- `preview/e2e/grounded-motion.js`: passed all six actual shipped rigs over 301
  frames on an inclined fixture, including acceleration, turning and stopping.
  2,052 planted samples; maximum target error under 0.001 mm. Screenshot sequence:
  `output/playwright/grounded-motion-{0,60,110,170,230,300}.png`.
- `preview/e2e/resident-life.js`: passed current district controls, route worker,
  bounded reaction batches, conversation holds, pause/resume, weather sheltering,
  reduced motion and native UHD buffer. Sampled actual foot-target error was
  0.000000941 m. The test now uses the current Weather control and development-only
  read-only motion diagnostics.
- Local UHD frame timing: median 41.7 ms, p95 45.9 ms (about 24 fps). This is a
  performance gap, not target-GPU or native-runtime acceptance.

## Still required for the full goal

- Verify pointer picking on indoor animated meshes and outdoor residents,
  including hidden layers, obstruction, seated figures and reload/reset behavior.
- Make indoor staff visibly attend and react to the visitor with role-appropriate
  gestures; develop meaningful work routines beyond the current stationary poses.
- Body turns now anticipate route direction before full travel speed, and swing
  feet retarget while airborne. Refine upper-body/foot coordination and inspect
  more rapid reversals and crowded corners beyond the sampled district run.
- Visually review walking, stopping, turning, seated interactions, carrying,
  worker gestures, crowd passing and indoor/outdoor encounters in real rendering.
- Improve rendering cost from the measured ~24 fps UHD run and broaden movement
  acceptance to worker tasks, carrying, seated interactions and crowded turns.
  These passing tests alone do not establish hyper-realistic movement.
- Audit the native runtime scope and existing Unreal residents before claiming
  end-to-end completion across this repository.

No commits or releases made for this goal yet. Goal remains active.

Concurrent work observed during the final status check: `district-fantasy.js`,
`service.py`, `auto-visitor.js`, `auto.py`, auto-mode docs and tests. These changes
were not authored or validated as part of this movement pass; preserve them.
