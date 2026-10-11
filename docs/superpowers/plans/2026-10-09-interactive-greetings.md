# Interactive greetings

Objective: make nearby player greetings discoverable in the world; offer a
consensual handshake and synchronized dance using the shipped rigs.

Branch: `feat/interactive-greetings-20261009`, based on `e059ee0`.
Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-greetings-20261009`.
The original checkout and its staged/unmerged work were not changed.

## Behavior and owned files

- `preview/src/greetings-ui.js`, `multiplayer-client.js`, `multiplayer.css`,
  `main.js`: nearby named-player card over the world, Wave / Shake hands / Dance
  together, recipient Accept / Decline, sender Cancel and either-person Stop.
  Keyboard focus follows the next action; controls fit a 390px phone viewport.
  Live text updates only when its content changes.
- `shared-interactions.js`, `server/interactions.js`, `server/world.js`: consent,
  one invitation/activity per participant, 2.6m reach, same room and sight lines,
  grounded upright participants, clear-ground handshake alignment, 15s invitation,
  4.2s handshake, 14s dance, rate limits, expiry and cancellation. Movement, travel,
  departure, sitting, watering, appearance/movement changes and solo gestures end
  paired activity. Stale pre-alignment poses need the current interaction ID.
- `resident-gestures.js`, `handshake-contact.js`, `avatars.js`, `player-avatar.js`,
  `remote-players.js`: synchronized gesture phase, partner facing, right-palm
  contact via the existing arm solver; reduced motion skips gesture animation.
- `server/redis-room.js`, `avatar-preferences.js`, `creator-rollout-audit.js`:
  checkpoint version 5 and writer generation v5; versions 1-4 remain readable.
  Old writers cannot accept v5 checkpoints or replace an active v5 writer lease.
  Older checkpoint versions cannot carry interaction records.
- Tests: server interaction/Redis/recovery regressions, standard-rig palm contact,
  gesture poses, and `preview/e2e/greetings.js` registered in the shared runner.
- `docs/multiplayer.md`: player flow, timing and checkpoint rollout contract.

## Verification

- `npm ci --ignore-scripts`, `uv sync --locked`, `npm run agent:doctor`,
  `npm run agent:list`: prerequisites ready. No credentials or private runtime
  state copied to this worktree.
- Baseline `npm test`: 2508 passed, 0 failed, 1 pre-existing conditional skip.
- Red/green regressions observed for missing interactions, gestures, palm contact,
  delayed alignment packets and checkpoint versioning.
- Final `npm run verify`: **passed**. Tooling 17/17; preview 2515 passed with one
  conditional storefront negative-test skip; server 283 passed with 103 Redis
  cases skipped in core; desktop 9/9; production build and Python lint passed;
  Python 141 passed with two dependency deprecation warnings; synthetic demo
  checks and secret guard passed. Receipt: `.runtime/agent/core.json`.
  The demo acceptance command's expected blocked exit 2 is the existing tested
  synthetic-fixture result, not real-world acceptance.
- `REDIS_URL=<owned loopback Redis> npm run test:server`: **397 passed, zero
  failures/skips**. A temporary wrapper `/tmp/river-greetings-redis-check.mjs`
  started a disposable server on a random loopback port, disabled persistence,
  ran the complete suite, and shut it down/removed its temp directory. Tests used
  their own random namespaces. Log: `/tmp/river-greetings-redis.log`.
- `RIVER_OAKS_SHARED_JOURNEY=greetings RIVER_OAKS_SHARED_REPORT=greetings-20261009.json
  npm run test:shared -- required`: **passed** on the final tree, 11
  checks on full Apple M3 Max WebGL rendering: nearby discovery, recipient
  consent, keyboard focus/acceptance, visible handshake and partner facing,
  shared dance phase, phone fit/stop, decline and real-transport walk-away cancel.
- Read-only fresh-context review identified delayed-pose, old-writer and keyboard
  focus problems. All three fixed and re-reviewed with no remaining blockers.
- `git diff --check`: passed. Actual tracked diff and new files reviewed.

## Limits and delivery

Shop NPC conversations and Unreal behavior are outside this player-pair feature.
Full all-journey browser/full profile, hosted CI/WorkOS, production rollout,
packaged desktop/native and human accessibility/art acceptance were not run.
The local browser report and screenshots are fixture evidence, not those gates.

Implementation and the final browser repeat are locally verified.
Val authorized commit, push and merge on 2026-10-09. Delivery is in progress
through a PR; refresh main and require the hosted verification matrix before
merging. No production account/database operations are part of delivery.
Keep the worktree until the PR merge and clean-state evidence are confirmed.

PR #203 rebased cleanly onto main `941550e`; core and the 11-check greetings
journey passed again on `1774cc2`. The first hosted run passed the new greetings
journey, but exposed an ambiguous unscoped Wave locator in `multiplayer-dev`:
the People panel and new nearby card both offer Wave. Scoped that regression to
the intended Avatar gestures region; both user-facing controls remain.
`RIVER_OAKS_SHARED_JOURNEY=multiplayer-dev npm run test:shared -- development`
passed locally after the correction; receipt `.runtime/greetings-delivery-development.json`.
