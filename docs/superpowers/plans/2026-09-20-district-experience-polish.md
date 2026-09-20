# Browser district experience polish

Val selected browser first. Keep the existing River Oaks District shopping
footprint at Westheimer and Westcreek, start on foot, and prioritize people.

## Visual review

The baseline walking console obscures the lower street. Conversations expose
support simulation controls before the person's story. The fixed approach point
can place other residents between the camera and the selected person. Nearby
people all turn toward the visitor, and imported rest poses remain stiff.
Pavement normals are too strong at pedestrian distance.

## Implementation and verification

- Compact walking controls; preserve discoverable keyboard and touch controls.
- Story and topics first; community activities remain available in a disclosure.
- Collision-aware encounter placement with personal space and a clear sightline.
- Relax imported arms and smoothly turn only the conversation partner to face us.
- Refine material normals and afternoon illumination without expanding the scene.
- Verify unit tests, production build, browser interactions and desktop/mobile
  captures. Independently review before committing and opening the delivery PR.

Native exploration is preserved separately in the local stash named
`WIP native district polish preserved while browser leads`. It is not part of
this browser change and has not passed native compilation or visual acceptance.

## Acceptance

Implemented the browser scope above. All 97 JavaScript tests, 74 Python tests,
Ruff checks, secret checks and the production build pass. Street-level and
browser-polish harnesses cover walking, input/focus, blocked encounter handling,
portrait framing and touch targets. Conversation regression covers support,
voice/reaction failure, stale requests and ten light/dark responsive layouts.
See `data/reports/browser-polish.json` for recorded results. Captures are retained
locally under `output/playwright/district-polish-*.png`.

Independent review found a blocked-approach failure path; it was fixed and
re-reviewed. Physical mobile-device and VoiceOver acceptance are not claimed.
Architecture is still an artistic interpretation; this pass does not establish
photorealism, an FPS target, or native engine compatibility.
