# Scheduled world events

Goal: progress toward the comprehensive Second Life experience with persistent
public gatherings, discovery, RSVP, and venue travel across published worlds.

## Contract

- Approved accounts can schedule an outdoor gathering at a named destination in
  their current world. Authenticated server identity supplies the host and world;
  the client supplies only title, description, destination ID, UTC times, and capacity.
- Start within 30 days; duration 15 minutes to 8 hours; capacity 2–32, including
  the host. Host is initially going. Global calendar limit 128; host limit five
  unexpired events. Ended events are reclaimed on the next calendar operation.
- Approved visitors see upcoming and active events across worlds, local times,
  venue, host name, and aggregate RSVPs. Attendee account IDs remain private.
- RSVP is idempotent, bounded and atomic; withdrawing frees a place. Host cannot
  withdraw. Hosts cancel their events; Jevica can cancel any event.
- Travel uses existing world/place links and server arrival checks. RSVP reserves
  a calendar place, not a world connection or private-home access. Building,
  furnishing, publishing, and wish permissions retain their existing admin gates.
- No push reminders or recurring events in this milestone.

## Delivery ledger

- [x] Memory and Redis calendar storage with identical limits and atomic writes.
- [x] Shared authenticated HTTP action handling, local/distributed wiring, edge routes.
- [x] Explore event directory, scheduling form, RSVP, cancellation and venue links.
- [x] Unit/API tests, Redis multi-instance gateway persistence and concurrency tests.
- [x] Two-browser acceptance, rendering inspection, production build and secret checks.
Delivery requires a verified commit, PR, merge, production smoke, and isolated
worktree cleanup. The pull request records terminal hosted status and any gap.

Hosted multi-region and full-capacity GPU performance remain required proof gaps
in the multiplayer audit; calendar operations do not run in room ticks.

## Verification checkpoint

Preview unit suite: 656 passed. Redis-backed server suite: 244 passed with no
skips. Calendar/API/gateway/edge regressions after paragraph validation: nine
passed. The full shared-browser suite passed all 11 journeys; the event journey
passed again after final input and active-time display changes. Desktop: six
passed. WebGL reflection smoke passed. Python lint, format, and 124 tests passed.
Production build passed; synthetic pipeline verifier returned its expected
blocked status (exit 2). Staged secret protection is required before commit.

These checks use local identities and fixtures, not hosted WorkOS acceptance.
The calendar benchmark and its hosted proof gaps are in the multiplayer audit.
