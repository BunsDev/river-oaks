# Flaky CI journeys

Objective: remove the three journeys that most often failed a first CI attempt on
2026-10-11. Each needed a rerun, and the rerun passed on the same commit. Root
causes come first, then minimal fixes; no timeout was raised to hide a cause.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`ci-flaky-journeys`. Branch `fix/ci-flaky-journeys-20261012` from `main` at `a79a82d`.

## multiplayer-dev: landmark teleport (fixed here)

Failure: `a landmark teleport is a server-checked position travel the other browser
sees`. It failed 26 times after #210 (Places guide) landed on 2026-10-11, about 38%
of first attempts of the `preview shared (development)` shard.

Root cause, a test bug:
- The journey takes the bench's position from the walking HUD after a fixed
  1.1-second sleep (`multiplayer-dev.js`).
- The HUD only repaints on a rendered frame, at most every 150 ms
  (`walking-ui.js`). Under Mesa, behind the Places dialog's backdrop blur, frames
  can be more than a second apart. So it sometimes returned the pre-teleport spot,
  about 36 m from the bench.
- The town saves a landmark at its own record of the player (`server/app.js`).
- The failure screenshots from three runs show the player at the bench, so the
  product behaved correctly.

Fix: read the bench from the town snapshot (`window.__riverMultiplayer()`) after
the save, the same value the server stores. The HUD sleep is removed, the 1.5 m
tolerance is unchanged, and a failure now prints the bench and both browsers'
positions.

Checks:
- Red: main's journey with the page's `requestAnimationFrame` stalled from the
  first teleport until the bench read fails with the CI error. Green: the fixed
  journey passes under the same stall.
- Without the stall, the fixed and main journeys both pass locally (macOS, Metal):
  `RIVER_OAKS_SHARED_REPORT=<name>.json RIVER_OAKS_SHARED_JOURNEY=multiplayer-dev node preview/e2e/shared-runner.js development`.
- Rebased onto `main` at `7c3f4ea` (#259, #260; #260 changed the town connection):
  `pnpm run verify` core passed all 11 tasks (tooling 57; preview 2651 passed,
  1 skipped; server 361 passed, 116 Redis-only skipped; desktop 49). The journey
  passed again on that tree.
- Rejected variant: leaving the bench by a teleport to another place, instead of
  the W walk, made the later builder step fail. That step aims at fixed screen
  fractions with a 250 ms wait, and the round trip left the camera still turning,
  so the copy landed on the road. The W walk is kept as it was.

Follow-up, not changed: the W walk may barely move the player under Mesa, because
it needs canvas focus and frame time, so the landmark check may sometimes pass
without a real move.

## email access browser test (fixed in #260 by river-oaks-3b)

It timed out at `email-access.test.js:162` waiting for a connected roster.

Root cause, a product bug: under CPU-only rendering a busy page can't read its
WebSocket before the client's 12-second deadline. The client closed healthy open
sockets, and its backed-off retries crossed the test's 60 s wait. It predates #253
(run 38153200219), though it is much more frequent since.

#260 (`7c3f4ea`) keeps a slow but open connection. Its owner will follow up with
socket-count diagnostics. The 15 s ticket expiry is being decided with the
server-hardening owner.

## contextual-first-visit: make the failure explain itself

Failure: `locator.waitFor: Timeout 60000ms` waiting for a visible `#community-dialogue`.
It has always failed in the touch pass, right after the Talk action became primary.
In 59 passing CI runs the conversation opens 0.14–0.43 s after that point.

Root cause: not confirmed. CI kept no evidence from the failing page:
- The runner's report and its screenshot come from the first page, which was
  already at `about:blank`.
- The touch pass's own screenshot was named `contextual-touch-failure.png`,
  outside the uploaded `experience-*-failure.png` pattern.

Ruled out:
- the decisions backend: opening a conversation never calls `/v1`;
- a resident moving: indoor residents stay put;
- walking out of reach;
- the travel cooldown under normal timing.

Every remaining path is silent to the journey: a refused travel or focus, a
handler that gives up, the 8-second "did not confirm" timer firing late on a
stalled page, or an access-check reload. 12 normal and 13 CPU-throttled local
runs didn't reproduce it.

Change (task `contextual-first-visit-evidence`), with no retry and no longer
timeout:
- After the Talk press, wait for what the visitor sees: the conversation, or a
  new refusal in the encounter notice or the town status line. A refusal fails
  at once with that text and the last town replies. A silent failure still
  times out at 60 s, now with those replies attached.
- On a touch-pass failure, add the page's state to the error before its context
  closes: dialog hidden, walking-HUD data, navigation type and connection. Save
  the screenshot as `experience-contextual-touch-failure.png`, so CI uploads it.

Checks:
- The journey passes normally.
- A probe copy refuses the Talk press's travel on the touch pass
  (`routeWebSocket`, `travel_cooldown`). The journey failed right away (30 s for
  the whole run) with `Talk press: refused: Wait a moment before travelling
  again … town replies [... {"ok":false,"error":"travel_cooldown"} ...]` and the
  touch page state, and wrote `experience-contextual-touch-failure.png`.

- `pnpm run verify`: core passed, all 11 tasks (tooling 57; preview 2651 passed,
  1 skipped; server 361 passed, 116 Redis-only skipped; desktop 49). That ran on
  `7c3f4ea`. Fast-forwarding to `main` at `cb09601` added only #261's
  journey-and-ledger change, which the core gate doesn't run.

Next: the next CI failure of this journey names its cause; fix that cause then.
