# street-level, ui-improvements and nearby-encounters in the shared town

## Objective

Three experience journeys failed identically on main (`5bd8c27` and later) and ran in
no automated suite: street-level (no `.nearby-person` to focus), ui-improvements
("Next stop actually moves the visitor") and nearby-encounters ("Expected 194
encounter locations, got 74"). Fix them without weakening server rules. Branch
`fix/stale-experience-journeys` in `.worktrees/river-oaks/stale-journeys`, on `014ea13`.

## Cause

All three were written for the single-player town that #170 removed. In the shared
town:

- The population is the shared presentation (`shared-population.test.js`): 74 building
  residents, no outdoor residents and no carriage-driver encounter. Nobody is near
  the outdoor spawn or a shop's pavement.
- The server confirms every travel and focus, refuses a second travel within one
  second (`TRAVEL_COOLDOWN_MS`) and allows about two commands a second (a 12-token
  bucket refilled every 500 ms). A closed conversation fades out before it hides.

## Changes

- nearby-encounters: assert that the directory lists exactly the people the town
  shows (`__riverPeople()`), once each, all building residents, instead of 194 and a
  carriage driver; pace travels 1.6 s apart (six commands per visit stays inside the
  bucket); wait for a closed dialogue to hide; widen conversation waits to 15 s;
  name the person and step in any failure.
- street-level: wait for the player, meet a local before the nearby-card checks,
  wait for conversations instead of instant `isVisible`, space travels, wait for
  closes to hide, pace and confirm the Cartier arrival (an unpaced visit was refused
  and left the player at Toulouse), confirm the reload returns to the Cartier
  pavement, and step inside before the mobile meet check.
- ui-improvements: wait for the player; detect arrival by the HUD position changing
  (bounded) rather than a 200 ms sleep; space travels. The open-request shortcut
  only finds a request with no volunteer yet, which the shared town's own dispatch
  may leave empty: the journey opens it when enabled and records it as unavailable
  otherwise.
- `multiplayer-client.js`: the town notice showed bare refusal codes such as
  `travel_cooldown`; travel refusals now go through `travelRefusal()`.

## Checks

- [x] `npm test` 668 pass after the client change.
- [x] Each journey passes locally once load fell below 100 (it had reached 400-650 from
      other sessions): nearby-encounters 74 visits (328 s), street-level 21 checks,
      ui-improvements 26 checks (no unassigned open request, so the shortcut branch
      recorded it as unavailable).
- [x] All three join the default experience suite (`npm run test:experience`). They are
      not added to hosted CI: nearby-encounters alone takes about five minutes.
- [x] `npm run verify -- web`: agent 17, preview 668, server 267 (101 Redis skips),
      desktop 9, build.
- [x] Rebased onto `62123f0` (#184, boutique doorway clearance) and rerun: ui-improvements
      26 checks, nearby-encounters 74 visits (280 s), street-level 21 checks twice. One
      street-level run had failed its first eye-height read before the HUD's first
      paint; that check now waits (bounded, 5 s) for the painted value.

## Limits and follow-ups

- A refused meet tells the player "There isn't a clear place to meet …" even when
  the cause is the travel cooldown: `onFocus` returns only a boolean. Not changed here.
- These journeys use real timing against a live town server; heavy machine load
  still makes them slow.
