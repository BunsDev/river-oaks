# Contextual UX review fixes (PR #179 follow-up)

## Objective

Fix the eight review findings on #179 (contextual actions and photo workflow, merged
as `2020849`) that the user selected. Branch `fix/contextual-ux-review` in the
external worktree `.worktrees/river-oaks/contextual-ux-fixes`, based on `5bd8c27`.
Codex sessions held the primary checkout (map spatial review, `store-rooms.js`);
none of the files below overlap their edits.

## Findings and changes

1. Busy actions lost their slot and focus. Busy (request or animation in flight)
   now uses `aria-disabled`, so the action keeps its place and keyboard focus;
   `disabled` keeps meaning unavailable. Selection is the pure `primaryAction()`
   in `preview/src/contextual-action.js`. Owned: `walking-ui.js`, `walking.css`.
2. Mouse/touch focus pinned the clicked action. The pin, the More auto-open and the
   refocus now apply only when `data-ui-input=keyboard`. The touch run of
   `contextual-first-visit` no longer releases focus before expecting Talk.
3. Command search: `matchCommands()` (`command-search.js`) sorts rail show/hide
   toggles after commands that open something and adds `rail`/`sidebar`/`play`
   terms. `rail-navigation.js`, `docs/rail-navigation.md`.
4. Doorway refusals showed bare codes. `travelRefusal()` (`travel-message.js`)
   maps known codes and never shows a code; used by `walking-ui.js` and `world-map.js`.
5. Duplicate Stand up: the seats panel now only chooses a seat to sit on (hidden
   while seated); the HUD's primary Stand up and Z remain. Panel and HUD share one
   in-flight guard (`isBusy`/`busy()`). `shared-seating-ui.js`, `seat-and-water.js`,
   `main.js`, `shared-seating.css`, journey `shared-seating.js`.
6. Photo mode: one share sheet at a time (`sharing`), no "switch to Sharpest" hint
   in Sharpest, rendered scale/occlusion reported (acceptance and `?ao=off`), slider
   names exclude the live value (`aria-label`, `output aria-hidden`). `photo-mode.js`, `main.js`.
7. Coverage: `contextual-first-visit` joins the default experience suite; new
   `experience` task (contextual-first-visit) in the `browser` and `full` profiles;
   experience runner gains the Linux Mesa/Xvfb mode (`RIVER_OAKS_EXPERIENCE_SOFTWARE=1`);
   hosted CI preview job runs contextual-first-visit. The first CI run (Verify
   37758704097) also ran photo-mode and rail-navigation under Mesa: contextual-first-visit
   passed, but the scene stayed blank (photo-mode: one sampled colour) and rail-navigation's
   reload check failed, so both stay GPU-only (follow-up).
8. Racy More pattern: nine journey sites and `reveal()` open More only when it is
   shown and closed, never toggling it shut.

## Checks

- [x] Red then green unit tests: `contextual-action`, `command-search`, `travel-message` (12).
- [x] `npm test` 665 pass; `node --test scripts/tests/agent.test.js` 10 pass; `npm run build`.
- [x] Experience journeys (Metal ANGLE): `contextual-first-visit` (34 s), `rail-navigation`,
      `district-polish` and `photo-mode` pass. `photo-mode`'s share check was changed to
      expect Share unavailable while a sheet is open (finding 6), and then passed.
- [x] `street-level`, `ui-improvements` and `nearby-encounters` fail identically on a
      detached `5bd8c27` baseline (focus wait on `.nearby-person`, "Next stop actually
      moves the visitor", 74 of 194 encounter locations), so they stay out of the suite.
- [x] Shared journeys, one per town: `shared-seating` (18 checks), `sit-and-water` (22),
      `world-publish` (54) pass.
- [x] `npm run verify -- web`: agent 17, preview 665, server 267 pass with 101 Redis
      skips, desktop 9, build.
- [ ] Hosted CI, including the new contextual-first-visit step under Mesa (passed in the first run).

## Limits

Unit and browser automation do not prove human keyboard, VoiceOver or touch
acceptance. The Mesa CI step is new and unproven until the PR run.
