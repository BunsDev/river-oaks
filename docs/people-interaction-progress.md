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
- Staff roles follow staff order rather than intervening guest/mannequin indices;
  three-person teams can include bartenders, concession attendants or salon hosts.
  Guest labels retain the venue context, including seated salon clients.
- Indoor stations are excluded from outdoor routes and volunteer recruitment;
  adding people preserves the eight original support recipients and the bounded
  24-agent background packet.
- Outdoor body turns use elapsed time and the shortest angular arc, including
  turns toward conversation partners.
- Pointer reach now uses the visitor's collision body, room and flight altitude,
  independently of the third-person camera. Visible mesh picking rejects opaque
  architecture/fixtures and hidden parents, and refreshes skinned bounds.
- Indoor staff have eased inspection, preparation, serving and presentation
  cycles. Conversation holds the task, blends head/torso/arm attention and resumes
  work afterward. Bodies stay at their stations instead of rotating planted feet.
- Staff support trays, folded fabric, jewelry, eyewear, samples or tablets with
  two-hand contact. Carry height follows the rig; counter docking is used only
  when both arms can reach it without stretching.
- Seated guests retain chair-facing hips and use two-bone IK to plant both feet.
  Indoor third-person camera clearance now uses the room instead of outdoor roof
  clearance, preserving the visible player body where the camera has room.

- Outdoor starts and arrivals now accelerate/brake; conversation and safety holds
  remain immediate. Feet use world-space targets, terrain-aligned orientation,
  alternating support/swing phases, hip-width stance and two-bone leg IK. Pelvis
  adjustment maintains reach through turns and slopes; stopped feet settle.

## Verification

Landing checks on September 21, 2026, in an isolated checkout:

- `npm test`: 158 passing tests, including all six source rigs supporting worker
  props through complete task cycles at two scales. Source materials and human
  face/skin/hair geometry remain unchanged by resident fashion styling.
- `npm run build`, Python lint/format checks, 87 Python tests and secret scans pass.
  The existing large Three.js chunk warning remains.
- `preview/e2e/player-forms.js`: Jevica defaults, exactly three forms, loaded
  portraits, all flight vehicles, measured ascent/landing, camera switching and
  mobile keyboard controls. No uncaught page errors.
- `preview/e2e/store-encounters.js`: all 30 stores respond to E with a same-room
  person. The directory contains 193 people (169 indoor plus 24 outdoor).
- `preview/e2e/people-picking.js`: actual seated/staff mesh clicks retain identity
  without relocating the visitor; work holds during conversation and resumes.
  All 94 seated foot targets are within 0.001 m (1 mm). The 124 palm contacts across six prop types are within 0.001 m (1 mm). These measurements establish contact, not
  physical task simulation or a complete visual acceptance of every occupation.
- `preview/e2e/grounded-motion.js`: all six shipped rigs over 301 frames on an
  inclined fixture, with acceleration, turning and stopping. 2,052 planted
  samples; maximum target error under 0.001 mm.
- `preview/e2e/resident-life.js` passes district routing, bounded
  reaction batches, conversation holds, pause/resume, sheltering, reduced motion
  and native UHD buffers. This local run measured median 133.3 ms and p95
  166.6 ms at 3840 by 2160 while other sessions were active. UHD performance
  remains a gap; this is not target-GPU or native-runtime acceptance.

Browser artifacts are in `output/playwright/`. Browser checks use the isolated
Vite server on port 5175; the production bundle is checked separately. Optional
`/v1/decisions` requests can fail while authored dialogue and local behavior
continue. These passes do not establish working live model responses.

## Still required for the full goal

- Broaden actual pointer acceptance to outdoor residents, hidden layers, crowded
  obstruction and scenario resets. Synthetic ray tests cover opaque blockers and
  hidden parents; live rendered acceptance currently covers seated/staff clicks.
- Inspect every occupation and refine manipulation of individual objects beyond
  the shared supported surface. Procedural cycles and palm contact are not
  complete physical task simulation or proof of hyper-realism.
- Body turns now anticipate route direction before full travel speed, and swing
  feet retarget while airborne. Refine upper-body/foot coordination and inspect
  more rapid reversals and crowded corners beyond the sampled district run.
- Visually review walking, stopping, turning, seated interactions, carrying,
  worker gestures, crowd passing and indoor/outdoor encounters in real rendering.
- Improve rendering cost from the measured slow UHD runs and broaden movement
  acceptance to worker tasks, carrying, seated interactions and crowded turns.
  These passing tests alone do not establish hyper-realistic movement.
- Bring native Unreal to the same interaction and motion scope, then verify it.
  Source audit: `RiverStreetPawn.cpp` provides E greetings through `GreetNearby`;
  `RiverOaksWorld.cpp` currently returns a generic greeting. The procedural native
  animation proxy applies stride rotations to the reference pose, without the
  browser's ground-contact solver, station routines or encounter directory.
  No native compile or rendered acceptance was performed for this browser pass.

This browser pass does not complete the broader native and hyper-realistic
movement goal. That work remains active.

Other work observed during an earlier status check: `district-fantasy.js`,
`service.py`, `auto-visitor.js`, `auto.py`, auto-mode docs and tests. These changes
were not authored or validated as part of this movement pass; preserve them.

## Latest resident direction

Residents remain human. The six source rigs preserve their faces, skin textures,
hair and eyes; six fashion palettes connect them to Jevica, Witch and Alien.
Only the playable Alien receives Grey anatomy. This supersedes the earlier
alien-resident direction; worker identities and routines remain intact.
