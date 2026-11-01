# #221 workplace slice: reconciliation and the opt-in Pink Jet-Age fixture finish

## Objective

The 2026-10-28 alignment on #221 (under #738, coordinated with #744/#746/#747) asks for two
things before any decision package: reconcile the slice's current implementation, receipts and
coverage (public/private separation, this Mac, physical devices, hosted), and retrofit only the
approved visual surface of the bounded fixture with TypeSafe pink `#F486A1`, ivory, restrained
chrome and readable workplace controls. Nothing about the fixture's scope, the default-off flags,
private memory boundaries, consent, bounded cost or runtime gates changes. No live adapter, real
delegated task or external contact is activated.

- Task: `workplace-221-pink-jet-age-20261101` (live register)
- Owner: `claude:river-oaks-41 (0b478b)`
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-workplace-221-pink`
- Branch: `feat/workplace-221-pink-jet-age-20261101`
- Base: `decb4e9a` (origin/main, 2026-11-01)
- Host: Apple M5 Max, macOS 27.2, headless Chromium through ANGLE Metal, Node 24, Redis 8.10.2
  (isolated, port 16541). Load averages 6–13 throughout.

## Files owned

- `preview/src/workplace-kit-finish.js` (new): the finish table (classic, pink-jet-age).
- `preview/src/workplace-office.js`: `buildWorkplaceOffice(THREE, room, { finish })`; the
  procedural surfaces take a palette; the classic defaults are the original constants.
- `preview/e2e/fixtures/workplace.js`: `?finish=graybox | classic | pink-jet-age`.
- `preview/e2e/workplace-room.js`: the six review shots under both finishes, same draw work.
- `preview/e2e/experience-runner.js`: the `workplace` journey owns its two fixture flags.
- `preview/tests/workplace-kit-finish.test.js` (new), `preview/tests/workplace-office.test.js`.
- `.github/workflows/verify.yml`: a `workplace` experience shard (separate commit; see below).
- `data/reports/workplace-room.json`, `data/reports/workplace.json`: fresh receipts.
- this ledger.

- `preview/src/workplace.css`: one rule, `.workplace-note` (below, demonstrated by the probe).

Not edited: `server/**`, `preview/src/workplace-ui.js`, `preview/src/workplace-contract.js`,
`preview/src/workplace-room.js`. The authority, privacy,
retention, erase and sweep tests are unchanged and were re-run (below).

## Reconciliation at decb4e9a (what is actually there)

- **Source.** No workplace source has changed since 2026-10-12 (`git log --since=2026-10-20`
  on every `*workplace*` path is empty). Flags `RIVER_OAKS_WORKPLACE` and `VITE_WORKPLACE`
  remain off by default (`server/workplace-api.js`, `preview/src/multiplayer-client.js:139`).
- **Where the room art is used.** `buildWorkplaceOffice` is the *legacy* office layout in
  `office-scene.js` and `office-world-scene.js`. Production has selected the penthouse since
  2026-10-15 and `office-legacy-1` is retired (`docs/offices.md`); legacy visits in old
  checkpoints end safely on restore. So the office art is, in practice, the fixture's. Both
  call sites pass no finish and keep rendering the classic office byte for byte.
- **Receipts were stale.** `data/reports/workplace-room.json` (2026-10-11, `a1dd1e3b`) recorded
  38 draw calls and 3,142 triangles: the graybox, captured before #253 landed the finished
  office. The journey has rendered the office by default since #253, so that receipt never
  described the room it names. `data/reports/workplace.json` was from the same day.
- **Hosted coverage was zero.** Neither `workplace` nor `workplace-room` appears in any
  `preview-experience` shard of `.github/workflows/verify.yml`, and the `workplace` journey
  could not run from `pnpm run test:experience workplace` alone: the runner's fixture
  environment had no entry for it, so the panel it looks for never mounted without shell
  variables.
- **Public/private separation (code).** The room builder takes `(THREE, room, { finish })` and
  nothing else: no companion, task, brief or draft reaches a screen, hologram or monitor
  texture, and the fixture page passes only `presence.mode`, `task.status` and `health` to
  `companionPresentation` for the pose and label. The public desk view stays exactly
  `{id, occupied, mine}` (`server/tests/workplace.test.js`). This is now also a test.

## Mapping (pink-jet-age)

Render-only. Every mesh, zone, geometry, placement, shadow flag and light is identical under
both finishes (`workplace-kit-finish.test.js`), so routes, sockets, the doorway, the measured
cameras and the plan tests are untouched.

| Material (`office-<key>`) | Classic | Pink Jet-Age |
| --- | --- | --- |
| `floor` | obsidian map, clearcoat 0.85 | ivory terrazzo map (chips of chrome grey, pink, garden green, white), roughness 0.3, clearcoat 0.5 |
| `graphite` (ceiling) | #1b2022 | ivory plaster #efe7dc |
| `lacquer` (skirting, pedestals, cabinetry) | #101516 | ivory lacquer #f3ece2 |
| `satin` (east/back walls, header) | #121718 | #efe6da |
| `graphiteFlute` (entrance wall) | #1d2325 | ivory #F7F1E8 |
| `gold` (trim, bezels, portal, mullions) | #d1b075, metal | chrome #BCC5C8 |
| `ivory` (west wall) | #e7dccb | #F7F1E8 |
| `onyxWall` (feature wall, monolith) | honey onyx map | rose quartz map (#faf5ee / #f3d6dd / #d9a3b3) |
| `pearl` (desk tops) | #f2ede5 | #F7F1E8 |
| `blackGlass` (review table top) | #07090a | mint glass #cfe0dc |
| `coolLight` (light lanes, keyboards, disc) | cyan-white | mint-white #eefcf8 / #cdeee6 |
| `sky` (east glazing) | night skyline, stars | dusk skyline, no stars, ivory towers, mint/warm windows, chrome halos |
| `smoked` (shelves) | #3b3029 @ .55 | mint glass #BFE2DE @ .45 |
| `holo` (desk screens) | cyan placeholder | mint-ivory placeholder [214,240,232] |
| `holoLine`, `holoBeam` (orbital hologram) | cyan | chrome / mint |
| `leather` (chairs) | cognac #8b5434 | TypeSafe pink #F486A1 |
| `velvet` (review rug) | teal #1f454a | soft rose #f2c4cf |
| `ceramic` (planter, vases) | #0d1112 | #f1ebe3 |
| `foliage` | #2d5a3f | garden #4A6A55 |
| `cabinetGlow` (niches) | bronze | ivory with a warm glow, metalness 0.15 |

Unchanged under every finish: `warmLight`, `glass`, `chrome`, the four point lights, the flute
normal maps, the graybox.

## Checks and results

Baselines at `decb4e9a` (clean detached snapshot, `git archive`), before any edit:

- `node --test preview/tests/{panel-workplace,workplace-office,workplace-room}.test.js`: 15/15.
- `REDIS_URL=redis://127.0.0.1:16541/3 node --test server/tests/{workplace,workplace-api,adversarial-workplace,retention-workplace,sweep-workplace,erase-workplace,cron-workplace,workplace-cap-drafts}.test.js`:
  77 passed, 0 failed, 0 skipped (33 s).
- `workplace-room` journey (classic office): passed, 5.7 s. 180 frames p50 0.3 ms, p95 0.5 ms,
  231 draw calls, 46,079 triangles; 20 re-entries 33 → 33 geometries; route 35 waypoints.
- `workplace` journey with `RIVER_OAKS_WORKPLACE=1 VITE_WORKPLACE=true` in the shell: passed,
  44 s, 12 checks (defer, no brief without permission, pause holds, focus to the opened draft,
  inert text, another account sees and fetches nothing, revoke removes the brief, deleted draft
  not presented, nothing calls the events service).

Candidate (this branch; filled in below as each check runs):

- `node --test preview/tests/{workplace-kit-finish,workplace-office,workplace-room,panel-workplace}.test.js`: 20/20.
- `workplace-room` journey, both finishes: first pass 7.2 s, classic p50 0.3 / p95 0.6 ms,
  pink-jet-age p50 0.4 / p95 0.7 ms (load 10–13). After the tune (below), 6.4 s, classic p95
  0.5 ms, pink-jet-age p95 0.4 ms (load 36–85; noise-bound, see #747 budgets). Every run: both
  finishes 231 draw calls and 46,079 triangles, both 33 → 33 geometries over 20 re-entries.
- `workplace` journey from `pnpm run test:experience workplace` with **no shell variables**
  (the runner's own fixture flags): passed, 12 checks.
- Panel control contrast and target sizes (local probe `.runtime/workplace-221/panel-contrast-probe.mjs`,
  not committed; real app with the flags on, People sheet open, companion named, grant given;
  light and dark theme × fine and coarse pointer, `?finish=classic` and `?finish=pink-jet-age`
  which is `data-finish=null` on `<html>` until #788 lands). Each text colour is composited
  through every ancestor background (tile over glass) and bounded over a white and a black
  world, as `hud-token-contrast.test.js` bounds the HUD. A first version of the probe stopped
  at the nearest translucent ancestor and reported 1.06–3.7:1 for everything; that was the
  probe, not the panel, and is recorded here so nobody re-derives it.
  - Before the CSS change: 29–30 controls per run; every control ≥ 4.5:1 except
    `.workplace-note` ("Test feature: …", `--muted` at opacity .82) at **3.35:1** in the light
    theme. Every button ≥ 24 px with a fine pointer and ≥ 44 px with a coarse pointer.
  - After `.workplace-note { color: var(--hud-muted, …) }` at full opacity: the note measures
    6.63:1 light and 8.42:1 dark; the lowest control on the panel is 4.7:1 (light) and 8.42:1
    (dark); buttons 36 px (fine) and 44 px (coarse). 8/8 runs, 0 below 4.5:1.
- Server suites on the candidate (no server file changes): 77 passed, 0 failed, 0 skipped.
- `pnpm run build`: passed (sign-in page: 7 files, all served before sign-in).
- `pnpm run verify` (core): passed, all 11 stages (agent-tests 87 s, preview-tests 237 s,
  server-tests 56 s, desktop-tests, build, python lint/format/tests, demo, demo-verify,
  secrets), finished 2026-11-01T06:44:53Z under load 37–71. Console totals across stages:
  6,639 tests, 6,313 passed, 0 failed, 291 skipped (core's usual Redis/browser/native skips;
  the workplace server suites above ran on Redis with 0 skipped). Receipt:
  `.runtime/agent/core.json` in the worktree.
- Hosted: pending (the draft PR's own run is the first hosted execution of these journeys).

## Visual inspection (fixed cameras, 1280×800, DPR 1)

Captures live in `output/playwright/` of the worktree (classic `workplace-CAM-*.png`, pink
`workplace-pink-jet-age-CAM-*.png`); not committed.

- CAM-02 Workbench, seated-working: classic obsidian floor, cognac chairs, cyan screens;
  pink-jet-age ivory flutes, terrazzo, pink chairs, mint-ivory screens, pale rose-quartz wall.
  The companion's "working" lean is the same in both.
- CAM-01 Entrance, arriving: chrome portal on an ivory fluted wall, halo and downlights, rose
  rug, storage with ivory and chrome objects. The feature wall reads near-white (restrained).
- Noted and tuned after the first pass: the terrazzo chips were large and dense for a 1.8 m
  tile, and fully metallic chrome trim read as dark lines against ivory under the fixture's
  room environment. Second pass: smaller, sparser chips; satin chrome (metalness 0.5,
  roughness 0.3).

## Gaps, with owner and disposition

- **Physical devices:** none available in this session. Desktop viewports (including the
  probe's touch emulation) are not phone proof (#747). Owner: Val / device matrix. Open.
- **Human accessibility review** (screen reader, keyboard, touch) and the uncoached player
  sessions: Val, unchanged from the 2026-10-11 decision. Open.
- **Hosted:** the new `workplace` shard runs in this PR's own CI for the first time; if Mesa
  disagrees with Metal on the fixture page the shard is dropped and the gap recorded, not the
  journey weakened.
- **The HUD skin (#788) is not merged**; the panel's own CSS follows the roster tokens and
  will inherit that skin when it lands. No panel CSS change is made here unless the probe
  demonstrates a failing ratio or target.
- **Decision package for Val** (retention, enable / merge into campus desks / retire) from
  the 2026-10-22 prompt: not written here; this increment is the reconciliation and the
  visual retrofit the 2026-10-28 amendment puts first. Next increment.

## Next step

Draft PR from `feat/workplace-221-pink-jet-age-20261101` (two commits: the finish, fixture,
journeys, runner flags, CSS rule, receipts and this ledger; then the hosted `workplace` shard
alone). Watch its first hosted run of `workplace-room` and `workplace`; if Mesa fails the
fixture page, drop the shard commit and record the gap. Then the #221 decision package.
