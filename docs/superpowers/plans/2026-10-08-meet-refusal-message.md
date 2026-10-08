# Say why a meeting was refused

## Objective

When the town refused the travel behind "Meet a local", "Meet someone nearby" or
"Find volunteer", the player was told "There isn't a clear place to meet …" whatever
the reason: `main.js`'s `onFocus` returned only `result.ok`. The most common cause in
the shared town is the one-second travel cooldown, which that message misdescribes.
Found while fixing the shared-town journeys (#185). Branch `fix/meet-refusal-message`
in `.worktrees/river-oaks/meet-message`, on `90c4c49`.

## Changes

- `main.js`: `onFocus` resolves to the town's travel result instead of a boolean.
- `community-ui.js`: `focusRefusal()` chooses the message with `travelRefusal()`
  (#181): a cooldown says "Wait a moment, then try again."; a written server reason
  (for example a private home) is shown as written; a blocked destination, any other
  code, or a bare `false` keeps the no-clear-place text. Used by meet and Find volunteer.
- `meetNearby` stops at a cooldown: it applies to every neighbor, so trying the rest
  only sends refused travels. Other refusals still try the next neighbor.

## Checks

- [x] `shared-community-ui.test.js`: three new tests (cooldown wording, blocked/bare and
      written reasons, nearby stops at a cooldown) fail on the old code and pass; the
      existing "tries the next candidate after asynchronous refusal" test still passes.
- [x] `npm run verify -- web`: agent 17, preview 2501, server 267 (101 Redis skips),
      desktop 9, build.
- [x] street-level (21 checks) and nearby-encounters (74 visits) pass; they drive Meet a
      local and Meet someone nearby for real.

## Limits

Browser journeys space travels to avoid the cooldown, so they exercise the success
path; the refusal wording is covered by the unit tests.
