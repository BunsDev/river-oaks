# #599 escape by concealment: lane service yard

Objective: make escape by concealment possible inside an authored danger zone, per the content
decision of 2026-10-30 (Val: a sight-blocking prop inside the south service lane; the zone stays
unchanged), and show it in a browser.

Owner: `claude:river-oaks-3d (c317fd0a)`; branch `feat/lane-cover-concealment-599-20261030`
from `main` `f52fac72`; worktree `river-oaks-lane-cover-599`.

Files owned: `preview/src/lane-cover.js` (new), `preview/src/lane-cover-mesh.js` (new),
`preview/src/walking.js` (cover blocks bodies and sight), `preview/src/main.js` (mesh and the
`__riverLaneCover` hook), `server/tests/lane-cover.test.js` (new), `preview/e2e/crime-conceal.js`
(new), `preview/e2e/shared-runner.js` (development list), `docs/crime.md`.

## Results

- Server probe (`.runtime/lane-cover/scenario.mjs`, logs beside it): the same scripted chase
  with the yard ends in `search` then `return`, star kept; with the walking change stashed it ends
  in `grab`, `arrest` and a cleared star.
- `node --test server/tests/lane-cover.test.js` 4/4 on `07c72bce`; 2/4 against main's walking
  model. Focused walking, navigation, resident-location routes, police, crime, cycling, racks and
  world tests 286/286; `draw-census` 2/2; 0 skips.
- `pnpm run verify` (core) passed on `07c72bce` plus the uncommitted journey: agent 289/0/0,
  preview 4665 / 0 / 1 skip, server 1085 / 0 / 285 Redis skips (core excludes Redis), desktop
  127 / 0 / 5 platform skips, Python 170 passed.
- Browser, `RIVER_OAKS_SHARED_JOURNEY=crime-conceal node preview/e2e/shared-runner.js development`,
  2026-10-30 05:18–05:19Z, load 14, Chromium ANGLE Metal on Apple M5 Max: **passed, 23 checks,
  39.6 s**. Officer followed every hop in `pursue`; the key walk toward the bay stopped at
  -2769.08 (partition face -2769.4 minus the body); in the bay the officer searched at 4.6 m for
  7.9 s and stood down; one star kept; no page errors. Receipt, screenshots and log with
  SHA256SUMS in `.runtime/lane-cover/evidence/`.

## Review (2026-10-30, independent reviewer)

- **High, confirmed and addressed:** the chase regression moved the player at 5 m/s, faster than
  any player (brisk 3.2 m/s). At 3.2 m/s the officer (3.4 m/s, notices within 3 m) follows
  through the gap and arrests; at 1.65 m/s it never loses contact. The test now uses real speeds,
  reaches the bay by the journey's travel step, and also records the on-foot arrest. Docs say
  plainly that on-foot escape needs a police tuning decision.
- **Medium, accepted:** the journey's last step into the bay is a travel step, so it shows the
  failed search, collision and drawing, not an on-foot escape. Travel is unrestricted while
  wanted, a pre-existing fairness gap routed separately.
- **Low:** the yard also blocks melee, interaction, greeting and seat sight lines; documented.

## Gaps and next step

- The crates and container are plain blockout boxes; no art pass is claimed.
- Not run: `verify full`, hosted CI. Next: push, open the draft PR, watch hosted (the journey
  joins the hosted `preview shared (development)` list), then the #599 matrix row.
