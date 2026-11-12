# Retire Classic, increment 1: a saved Classic choice no longer selects Classic (#913)

## Objective and authority

The repository owner decided on 2026-11-11 that Classic is retired and Pink Jet-Age is the only
look (#738, decisions list). #913 slice 1 owns removing the finish switch. This increment takes
the one part of that slice that can be verified without a browser or GPU: the visitor-facing
half of the switch. It does not remove the `?finish=` address parameter, the `classic` finish
tables or any Classic test arm.

Not authorized here: merge, deployment, re-pinning any measured baseline, or deleting saved data.

## Source and ownership

- Repository: BunsDev/river-oaks. Base: `main` `a65a86a3a6357b4fa659ce72ae55cc0867e1be20`.
- Branch: `chore/retire-classic-saved-preference-913-20261111`.
- Written in a cloud checkout with no access to the primary checkout's live task register, so no
  register claim was made. The next executor must reconcile the live register and current `main`
  before continuing. `docs/project-management/tasks.json` is not edited.
- `docs/superpowers/plans/README.md` is generated from the register and is left alone; it was
  already out of date on the base (`node scripts/plans-index.mjs --check`).

## Changed behavior and files

- `preview/src/render-quality.js`: `readFinishPreference` no longer reads
  `localStorage['river-oaks-finish']`. With no `?finish=` in the address it returns
  `pink-jet-age`. The saved key is left in the browser, neither read, rewritten nor erased.
  `?finish=<name>` still selects a finish for one page load.
- `preview/tests/finish-default-foundation.test.js`: the stored-preference cases now assert that
  a saved value of any shape is ignored and that storage is never touched, including through the
  real `globalThis.localStorage` path and when the address is unreadable.
- `preview/tests/kit-finish-live.test.js`: the reader-policy test asserts a saved Classic choice
  returns Pink Jet-Age. Builder, stream and byte-estimate assertions are unchanged.
- `preview/src/pink-jet-age-hud.css`, `docs/city-kit.md`: comment and doc text only.

No one could set the saved key from the interface: nothing in `preview/src` writes it. The change
closes the manual route (`localStorage['river-oaks-finish'] = 'classic'`) documented in
`docs/city-kit.md`.

## Why the address parameter stays for now

Two hosted journeys measure Classic through `?finish=classic`, against baselines that only a
browser run on a GPU host can re-pin:

- `preview/e2e/depth-layers.js` loads `?finish=classic` unless `RIVER_OAKS_FINISH` names another
  finish, so its known same-depth list is a Classic list.
- `preview/e2e/five-rooms.js` opens `/?finish=classic`, asserts the Classic Ribbon, shells and
  aprons, and judges the Pink spawn frame against `five-rooms-budget.json`, whose baseline records
  `classicCalls` 1629 beside `pinkCalls` 1661.

Removing the parameter before those are re-pinned would turn both journeys red, and editing the
baselines without running them would replace evidence with numbers nobody measured.

## Checks

| Command | Result |
| --- | --- |
| `node --test preview/tests/finish-default-foundation.test.js` on the updated tests and the base source | 18 tests, 14 pass, 4 fail: the four saved-preference cases, as intended |
| `node --test preview/tests/finish-default-foundation.test.js preview/tests/render-quality.test.js preview/tests/pink-jet-age-routes.test.js` after the change | 47 pass, 0 fail, 0 skipped |
| `node --test preview/tests/hud-token-contrast.test.js` | 511 pass, 0 fail |
| `node --check preview/src/render-quality.js` | passed |

Runtime: Node v22.23.4 in a cloud checkout without installed dependencies.

## Not run

- `preview/tests/kit-finish-live.test.js` could not load here (`three` is not installed), so its
  edited reader-policy test has not been executed.
- `pnpm run verify` (core), `pnpm run verify full`, the build, every browser journey and the hosted
  matrix. Hosted CI on the draft pull request is the first complete check of this change.
- No rendered, device, visual or human accessibility evidence.

## Remaining work in #913 slice 1

1. On a host with a browser and GPU: run `depth` under Pink Jet-Age, re-pin its known list, and
   make Pink Jet-Age the journey's default.
2. Rework `five-rooms.js` so it no longer needs a Classic tab, and re-pin
   `five-rooms-budget.json` without `classicCalls`.
3. Remove `?finish=` from `readFinishPreference`, then `data-finish` and the harness options that
   pass a finish (`pink-jet-age-routes`, `city-kit-review`, `studio-template-stations`, the
   workplace and penthouse fixtures).
4. Collapse the eight finish tables so Pink Jet-Age values are each module's own materials, rename
   slots by role without changing plan hashes or locks, and update the 39 test files that name
   Classic.

## Rollback

Revert this increment. No world IDs, saved data, network protocol or baseline changes, so no
migration is involved. A browser that still holds a saved Classic value selects Classic again
after a revert.

## Next action

Read the hosted results on the draft pull request, fix anything this change caused, then start
step 1 above from a host that can run the browser journeys.
