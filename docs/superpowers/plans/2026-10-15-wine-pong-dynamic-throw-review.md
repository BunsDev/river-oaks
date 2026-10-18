# Wine pong: position-aware throws and readable table play

Objective: make the café game feel like a player standing at a real table. The
standing position must affect the ball's release and landing, while the throw,
camera and result remain easy to read on desktop and touch screens.

Task: `wine-pong-dynamic-throw-20261015`; branch
`feat/wine-pong-dynamic-throw-20261015`; owner
`codex-root-wine-pong-dynamic-throw-20261015`. Files owned are listed in the
live task register. This is a new task; the original `plaza-wine-pong` delivery
remains historical.

## Current mechanics

- The town offers **Play wine pong** when the visitor stands within 0.9 m of a
  fixed point 1.7 m beyond either table end (`plaza-salon-plan.js`). The real
  pose chooses west or east, but `wine-pong-rules.js` always releases the ball
  from the centre line 1.6 m from the table. Walking left or right changes no
  shot outcome.
- Opening the game shows a non-modal HUD sheet beside the world. A timed,
  sweeping reticle locks aim on the first press and power on the second
  (`plaza-wine-pong.js`). Keyboard focus moves to the sheet, so the visitor
  cannot keep walking to refine their stance until leaving it.
- The sheet shows a top-down table and a permanent far-rack close-up. Both are
  SVG redraws; the town camera stays behind the sheet. The 3D table mirrors the
  glass count and ball, but the avatar has no throw gesture.
- `trajectory()` generates a fixed visual arc from the centre line. A bounce
  adds a second arc, while rim-in and rim-out lack a distinct contact/rebound
  beat. The rule result is decided before the flight; its path and glass
  reaction should explain that result without changing it.
- A browser journey proves a centre-line sink, miss, opponent reply, table
  mirror, focus and fit at 1440 × 900. It does not cover different physical
  stances, a release gesture, mobile layout or camera transitions.

## What to borrow from Tabletop Simulator

The [Knowledge Base](https://github.com/Berserk-Games/Tabletop-Simulator-Knowledge-Base)
documents player-controlled orbit/pan/zoom, a reset view and first-person mode
in [basic controls](https://github.com/Berserk-Games/Tabletop-Simulator-Knowledge-Base/blob/master/docs/player-guides/basic-controls.md).
It treats close inspection as a temporary action in
[advanced controls](https://github.com/Berserk-Games/Tabletop-Simulator-Knowledge-Base/blob/master/docs/player-guides/advanced-controls.md),
and [camera states](https://github.com/Berserk-Games/Tabletop-Simulator-Knowledge-Base/blob/master/docs/player-guides/camera-states.md)
give a reliable way back to a useful table view. Its
[hand zones](https://github.com/Berserk-Games/Tabletop-Simulator-Knowledge-Base/blob/master/docs/host-guides/player-hands.md)
tie interaction to the player's place at the table. These are interaction
references, not an implementation of River Oaks wine pong. The documented
[physics controls](https://github.com/Berserk-Games/Tabletop-Simulator-Knowledge-Base/blob/master/docs/host-guides/physics.md)
also make impact and bounce legible; River Oaks should keep deterministic rules
and use trajectory, contact and sound to express the recorded result.

## Proposed experience

1. **Stand and sight.** Walk to any legal point along either end of the table.
   The play affordance shows the selected end and a subtle ground launch zone.
   Entering the game retains the actual stance. The first view looks from just
   behind the throwing shoulder toward the far rack; a small table diagram
   gives orientation. A temporary magnified rack view is available on demand.
2. **Aim and release.** Mouse, touch, keyboard and gamepad should select a
   landing target in the same table frame. The player can return to world
   movement to adjust stance without losing the game. On release, capture the
   standing origin with the aim and power in a deterministic throw record. A
   preview arc shows where the current input would first land; it must never
   promise a glass result when the seeded rim outcome is uncertain.
3. **Follow through.** The avatar winds up, releases the visible ball from the
   hand, and settles. One flight clock drives the avatar release, 3D ball, UI
   ball and camera. The cup/rim/table contact occurs at the same place and time
   in every view. Rim-out visibly deflects; bounce-in shows the table contact;
   the glass reacts only after the contact. The result camera returns to the
   throwing view without moving the avatar.
4. **See the outcome.** A brief rack close-up or camera focus makes the hit
   clear, then the next-throw prompt appears at the throwing end. During the
   regular's turn, show its stance and flight from the opposite end. Reduced
   motion keeps a fixed camera and shortened transitions; keyboard focus and
   narration survive every phase.

## Delivery slices

1. **Position-aware rule contract:** convert a legal world pose into bounded
   table-local release coordinates; include that origin in new throw notation,
   landing, `aimAt`, trajectory and replay. Continue reading old two-field
   notation as a centre-line throw. The opponent keeps a deterministic origin.
   Focused tests prove two distinct legal positions produce distinct paths and
   replay remains exact.
2. **Physical stance in the current flow:** show the release point in both views,
   capture the pose at each player throw, and provide an explicit **Reposition**
   action that returns to walking while preserving the game. Reopening at a
   legal spot updates the hand and preview. This makes movement meaningful
   without changing the town's walking controls or shared authority.
3. **World-first interaction and animation:** move the primary aiming view into
   the 3D table, add a temporary rack inspect view, release gesture and shared
   event timeline. Keep the SVG as an optional map for access and orientation.
   Evaluate camera clearance and avatar rig compatibility before selecting a
   gesture API.
4. **Acceptance:** test west/east and lateral/near/far positions, a straight
   sink, rim-out, bounce-in, miss, opponent reply, closing/reopening, desktop
   pointer and keyboard, touch, reduced motion, and world-camera restoration.
   Capture player-height and mobile screenshots plus a human play review.

The first two slices establish the physical throw contract. The latter slices
are needed before calling the overall experience complete.

## Implementation and evidence, 2026-10-15

- Slices 1 and 2 are implemented: the play stance is projected from world
  coordinates into the table frame, bounded by the existing end reach, saved
  with every new player throw and replayed. Legacy two-field throws retain
  their original centre-line path. Reposition closes the sheet without ending
  the game; reopening records the new stance. The rack close-up is temporary.
- The local avatar winds up and follows through before ball flight; the rim-out
  path now visibly deflects after contact. The sheet leaves more of the world
  visible on desktop and the table camera faces the playing end. These are a
  first animation/view pass, not a complete world-first camera system.
- `node --test preview/tests/wine-pong.test.js preview/tests/resident-gestures.test.js preview/tests/plaza-salon.test.js`: 27 passed. `pnpm run build`: passed.
  `pnpm run verify`: core passed (`.runtime/agent/core.json`).
  `pnpm run test:experience plaza-wine-pong`: passed 26 checks on the final
  eye-level framing, including a positioned sink, inspect toggle, lateral
  reposition, opponent reply and phone throw-control fit. Desktop and phone
  screenshots are in ignored `output/playwright/` files.
- `pnpm run project:check --tasks <primary>/docs/project-management/tasks.json`
  reports unrelated global inventory gaps (expired and pending retirement
  tasks), so it is not a clean project-wide check.

Gaps: A trial lower camera angle increased tree occlusion, so the final camera
retains the original eye-level target. The world table can still be obscured
by plaza trees and furniture in a third-person view. Pointer/touch target
selection, camera follow at impact,
sound, a real phone device play review, and human accessibility acceptance
remain for slices 3 and 4. The fixed deterministic rules, rather than a
general physics simulation, remain the game authority.

Draft PR: [#448](https://github.com/BunsDev/river-oaks/pull/448).

**Next action:** Review #448's exact-head checks and this bounded
position/gesture/view slice, then use a separate follow-up to clear the
world-table camera and complete human play, touch and accessibility acceptance.
Keep PR #436's iPhone landing separate.

## Authorized landing integration, 2026-10-18

Val authorized #448, #477, #468 and #484 through merge and worktree retirement.
Owner: `codex-pr-448-477-468-484`. Merged `origin/main` without committing yet.
Resolved player-avatar by retaining the throw animation, adding main's platform
pose data and preserving main's human-only appearance behavior. Regenerated the
plans index. Focused wine-pong, resident-gesture and salon checks are running;
log `/tmp/river-oaks-448-focused.log`. Core and hosted verification, signed merge
commit, landing and retirement remain pending. Preserve this unfinished merge.

Integration checks: dependencies installed with the frozen lockfile; agent doctor
passed. Focused wine-pong/gesture/salon tests passed 27/27, and
`pnpm run test:experience plaza-wine-pong` passed. Receipt preserved at
`.runtime/landing-448-experience.json`; the tracked historical report is unchanged.
Core verification is still running; hosted exact-head CI remains a merge gate.
