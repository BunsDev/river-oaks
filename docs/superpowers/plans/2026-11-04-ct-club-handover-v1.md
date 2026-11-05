# Handover v1 — CT Club (Underground Techno Club room)

Purpose of this file: a fresh agent instance ("the next instance") can pick up this
work with zero live memory. It is the single source of truth for where the CT Club
stands. Ledger: [`2026-11-04-ct-club.md`](2026-11-04-ct-club.md). Design doc:
[`docs/ct-club.md`](../../ct-club.md). **For the whole repository state — branches,
worktrees, every register task, pre-existing test failures, and machine-wide
commands — read [`2026-11-04-repo-handover-v1.md`](2026-11-04-repo-handover-v1.md)
first.**

## 1. The request (Val, 2026-11-04, verbatim intent)

> "Create a new thing: a special room with the design of an underground techno
> club — entry, bar, dancefloor, couches, chai, big big speaker, and lights.
> 4 strobes in the corners firing rarely; corner spots that change RGB; a disco
> ball in the center with occasional RGB lasers (not compute-intensive); bar lit
> by edge glow and back glow, the chairs also, the couches also; dancefloor is
> tiles with edge lighting on the ground. Room sized so 3 people stacked fit the
> height and 20 people-lengths is the length → about 40 m long and 6 m high. Make
> it in the style of the repo. The precise position will be decided later."

Interpretation choices already made (both readings built, so no clarification
question was needed):
- "chai" is built BOTH ways: a chai kettle (copper urn on the bar under an amber
  glow) AND the edge-lit chairs ("chairs" = the seats, lit like the couches).

## 2. Current state (all verified; nothing pending blocks handoff)

**Implemented and green (after the continuation session):**
- `preview/src/ct-club-plan.js` — pure-JS plan (shared with the server
  walker), store-room frame, `planCtClub({ east, north, yaw })`; the
  default `(0,0,0)` is the pending position. Zones: entry (0–4 d), bar (left),
  lounge (right, couches/chairs/tables), dancefloor (16–33 d, 13×17 m LED tiles),
  DJ booth + speaker wall (33–39.4 d).
- `preview/src/ct-club-interior.js` — whole-room Three.js builder,
  instanced (the whole dancefloor = 2 instanced meshes), emissive-only glows,
  `userData.tick(t)` (ball spin, RGB spots, lasers burst 2 s/9 s, strobes <1%
  duty), `reducedMotion` option, `userData.lightPositions` in the shared pool
  shape, builds under node (no canvas). Includes the **instance-matrix fix**
  (`matrix.clone()` when batching) — without it every instanced slot held the
  last composed matrix and the room collapsed to one point (see the ledger).
- `preview/tests/ct-club.test.js` — **9/9 passing** (incl. the culling
  regression added by the continuation session).
- `preview/e2e/fixtures/ct-club.html` + `.js` — browser design harness.
- Docs: `docs/ct-club.md`, ledger `2026-11-04-ct-club.md`.

**Verification already run (exact commands + results):**
- `node --test preview/tests/ct-club.test.js` → 9/9 pass.
- `node --test preview/tests/ribbonwing.test.js` → 9/9 pass (after the sync
  merge with the origin feature branch).
- Headless visual/performance pass (browser-lock, ephemeral Vite port): all six
  tour views render — entry 39 calls/28356 tris, bar 30/27712, dancefloor
  29/27200, ball 22/25000, lounge 15/17860, dj 22/17136; CPU p95 0.2–0.7 ms; no
  page/console errors; screenshots in `.runtime/ct-club/*.png` (git-ignored).
- `pnpm run build` → **PASSED** (`✓ built in 1.78s`, access-entry check
  `Sign-in page: 7 files, all served before sign-in`). Build gate is DONE.
- Before the fix, `node --test --test-concurrency=4 preview/tests/*.test.js`
  was 13 fail, all pre-existing on this checkout (see §6); a re-run on the
  merged tree is part of the delivery gate, alongside `pnpm run verify` (core).

## 3. Remaining work (in order)

1. **Visual / performance pass (human or browser):** open
   `http://127.0.0.1:5173/e2e/fixtures/ct-club.html` with `pnpm run dev`
   in another terminal. `←/→` or `J/K` tour views, `N` next view,
   `window.clubFixture.sample()` returns CPU median/p95 of a render. Tune
   emissive intensities/colors if the look is off — that is design work, not code
   correctness.
2. **Position step (explicitly deferred by Val — DO NOT pick a location):** when
   Val gives `east/north/yaw`:
   a. call `planCtClub({ east, north, yaw })`,
   b. set `room.floor` below grade and build a stair throat through the front door
      gap (`generatedVerticalRoute` in the repo is the IPIC precedent),
   c. wire the room + `buildCtClubInterior` into the venue plumbing the
      way `venue-rooms.js` joins `axe-and-darts` (add to `VENUES`,
      `store-interiors.js` dispatch for `CLUB_INTERIOR`, `venueDoorSites` for the
      destination list),
   d. confirm `updateStoreLights` in `main.js` covers the club — it already reads
      `lightPositions` off interior groups, the same shape `axe-room-interior.js`
      publishes.
3. **Register + delivery:** update the live register task `ct-club`
   (owner/nextAction/evidence), then the normal verify/PR flow. Register
   commands: `pnpm run --silent register path` / `show ct-club` /
   `patch ct-club --json '{"nextAction":"…"}'`.

## 4. Worktree / branch / files owned

- Branch: `feat/ribbonwing-viewer-upstream-20261104` (primary checkout,
  `c:\projects\for vals car\river-oaks`), HEAD `cb774468` — the CT Club files are
  committed (`9f4de8d7` feature, `24621704` newline fix, `b8a1931c` culling fix)
  and the branch is synced with `origin` via the merge commit `cb774468`
  (ribbonwing D3 files resolved to the upstream fix; CT Club files untouched).
- Live register task: `ct-club` (status `active`, lease renewed).
- Files owned: the two `src` modules, the test, the two fixture files, this
  handover, the ledger, and `docs/ct-club.md`.

## 5. Commands cheat-sheet

| Goal | Command |
| --- | --- |
| Focused tests | `node --test preview/tests/ct-club.test.js` |
| Whole preview suite | `node --test --test-concurrency=4 preview/tests/*.test.js` |
| Build gate | `pnpm run build` |
| Dev server (fixture) | `pnpm run dev` → `http://127.0.0.1:5173/e2e/fixtures/ct-club.html` |
| Syntax check | `node --check <file>` |
| Register | `pnpm run --silent register path` / `show ct-club` / `patch` |

## 6. Pre-existing suite failures to ignore (this Windows checkout)

13 failures, all receipts/provenance pins independent of this feature. A later run
showing MORE than these 13, or any failure in `ct-club.test.js`, IS a
regression and must be fixed: `approved-space` (1), `coat-tails`, Lyra/Vesper/
Silvan/seated skin-corrective provenance, `screening-media` films,
`fixture-receipt` eyes, published contract/manifest, `studio-garden-office`,
`space-scene` finish classic entries, `vegetation` canopy, `vite-env-dir`
(Windows path separators).

## 7. Next instance checklist

- [x] `pnpm run build` (passed after the culling fix and the sync merge)
- [x] Headless visual/performance pass in the fixture (all six views render, CPU
      p95 0.2–0.7 ms; screenshots in `.runtime/ct-club/`) — human visual tuning
      of emissive intensities/colours remains a design step
- [ ] Await Val's position decision → wire into venue plumbing + stair throat
- [ ] `pnpm run verify` (core) + one full preview-suite re-run on the merged
      tree before any PR; never merge without authorization
- [ ] Update register `ct-club` status/evidence after delivery
