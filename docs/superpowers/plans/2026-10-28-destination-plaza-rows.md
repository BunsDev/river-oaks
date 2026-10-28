# City-kit plaza rows: benches and lamps derived by the row

Goal (Val, 2026-10-28, `/goal`): extend the world-authoring pipeline to generate coherent neighborhoods efficiently with artistic control. This is the plaza-furniture gap left by the layout, reference, Studio-export and parcel increments ([ledger](2026-10-28-destination-layout.md)); it stands on `main` alone.

Task `destination-plaza-rows-20261028`, owner `claude:river-oaks-layout (1a8107da)`, branch `feat/destination-plaza-rows-20261028`, worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-destination-plaza`, base `origin/main` `36e906b2`.

Objective: a plaza derives benches and lamps by the row (`benchRows`, `lampRows`: a line, a spacing, a yaw), as it already derives trees, instead of a `furniture` entry each; tree rows may run north as well as east. Derived ids are stable (`<plaza>/bench-row-<row>-<n>`), so overrides address them; rows are validated (one axis, finite, `from <= to`, spacing > 0, at most 64 items); a row off the plaza ground fails the build through the existing solids check.

Files owned: `shared/city-kit/assemble.js` (plaza row validation and derivation), `preview/tests/city-kit-plaza-rows.test.js` (new), `docs/city-kit.md`, this ledger.

Results (2026-10-28):

- `node --test preview/tests/city-kit-plaza-rows.test.js preview/tests/city-kit.test.js`: 18 passed, 0 failed: positions and ids of six benches, five lamps and a north-running tree row; solids; determinism; an override turning one bench and suppressing another by row id; six validation refusals; a bench off the ground refused; the shipped Nineteenth & Yale, Commons and greenway hashes unchanged.
- `pnpm run destination check`: 19 locks reproduce (main now carries 19 recipes). `python3 -I scripts/check_secrets.py --all`: no leaks.
- `pnpm run verify` (core), receipt `.runtime/agent/core.json` (revision `36e906b2`, dirty with the files above), log `.runtime/destination-plaza/verify-core-001.log`: passed. agent-tests 289/289; preview-tests 4342 passed, 1 skipped; server-tests 1077 passed, 283 skipped (no Redis); desktop-tests 127 passed, 5 skipped; build, python lint/format/tests (170 passed), demo, secrets passed. Not run: `verify full`, Redis, browser, native.
