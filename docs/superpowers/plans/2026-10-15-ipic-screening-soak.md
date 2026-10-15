# #368 slice 1: IPIC screening catalog profile and ten-cycle soak

- **Task:** `ipic-screening-soak-368` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `test/ipic-screening-soak-20261015` in `../river-oaks-ipic-soak-368`, from `origin/main` `9d83cd31`.
- **Issues:** #368 (first executable slice), returning the repeated-entry receipt and the catalog disposition to #367.
- **Media:** the committed 30 s synthetic fixture (`preview/public/assets/ipic/screening/`), not the approved short (#365).

## Objective

Make the existing two-browser screening journey runnable from the agent catalog, and prove
repeated IPIC entry/exit releases the player's resources: one warm-up plus ten cycles with
real counters, late-play detection and per-cycle convergence; then review the panel at 390 and
320 px with the software-rendering banner and the play dock on screen.

## Decisions

1. **Catalog, not hosted CI.** New local profile `screening` (journey + soak); the journey also
   joins `browser` and `full`. Hosted CI lists its browser journeys explicitly in
   `.github/workflows/verify.yml`, so this adds no hosted minutes. A hosted job (for example
   path-filtered on screening sources) would add recurring CI time: Val's decision, recorded as
   not done.
2. **Counters without changing the app.** CDP `Memory.getDOMCounters` after two forced GCs (DOM
   nodes, JS listeners, documents); the existing dev-only `?render-audit=1` hook for renderer
   textures/geometries; an init script that counts media elements the page created or played
   (via WeakRef, so collected ones drop out), open AudioContexts, live intervals, pending timeouts
   and `play()` calls.
3. **Growth rules.** Media, AudioContexts, intervals, documents and renderer resources must not end
   above the warm-up baseline. Nodes, listeners and timeouts move with the HUD, so the rule is
   "no rise in every one of the ten steps" (a one-per-cycle leak rises every step).
4. **T3 captures are not here.** `ipic-route-evidence-364` (river-oaks-1b) owns T1–T3.

5. **Captions were never visible (fixed here).** river-oaks-1b (#364) pointed out, and the code confirms, that
   the caption track sat on a `hidden` video whose frames go only to the screen texture, so no cue was ever
   drawn; the Captions toggle changed only `aria-pressed`. The player now keeps the track in `hidden` mode
   and exposes the active cue text; the panel shows it in a caption line the toggle controls. A player unit
   test (written first, red) and a soak runtime check (the shown line equals the video's active cue) cover it.

## Files

`preview/e2e/ipic-screening-soak.js`, `preview/e2e/ipic-screening-soak-runner.mjs`,
`preview/src/ipic-screening.js` and `ipic-screening-ui.js`/`.css` (caption line only), `preview/tests/ipic-screening.test.js`,
`docs/screenings.md` (captions sentence),
`config/agent-workflow.json` (screening entries), `docs/testing.md` (screening paragraph), this ledger.

## Checks

| Check | Result |
| --- | --- |
| `node --test scripts/tests/agent.test.js` | 10/10 |
| `node preview/e2e/ipic-screening-soak-runner.mjs` | pending |

## Next

Run the soak under the browser lock; record counters; review; PR (no merge without authorization).
