# Ribbonwing screen flicker investigation

Task `ribbonwing-flicker-20261030`, owner `codex:ribbonwing-flicker`, branch `fix/ribbonwing-camera-flicker-20261030`, based on Ribbonwing PR #779 at `dafd0bd4be636c1d2cd3478d7e2384db8625620f`. Preserve the active owner's dirty worktrees and existing lander; this task does not authorize merge or deployment.

Val reported screen flicker while the Ribbonwing is active. The existing Ribbonwing ledger separately records one full pale viewport frame during a tuck dive, with HUD intact, an unknown cause and later captures that did not reproduce it. The relationship between that symptom and the camera defect below remains unverified in the rendered client.

## Confirmed camera defect

`thirdPersonPose` treated a store's two-dimensional footprint as an indoor room at every altitude. Above its roof, it used ground walking clearance and room boundaries instead of flight clearance, pulling the 10.4 m Ribbonwing boom inside its hull. A deterministic scan of the real district at 80 m found 166 of 248 sampled over-room headings with camera gaps below 3 m despite clear flight space. One reproducible point is `[-2831.9384618692047, 80, 1358.439548752362]`: heading zero gave a 0.9955114684924777 m camera gap.

The patch classifies each camera sample using the room's actual ceiling elevation (including IPIC's varying ceiling) or its floor elevation plus room height. Above that elevation, the normal outdoor flight collision rules apply. It keeps indoor walking and ceiling constraints and outdoor roof/wall collision checks.

## Owned files and verification

- `preview/src/third-person.js`: altitude-aware camera room selection.
- `preview/tests/third-person.test.js`: real district overflight regression and retained outdoor obstruction constraint.
- This ledger.

The two new regressions failed before the implementation (real district camera gap 0.9955 m; outdoor obstacle ignored). After the patch, `node --test preview/tests/third-person.test.js preview/tests/flight.test.js preview/tests/carriage-motion.test.js preview/tests/ipic-camera.test.js` passed 69 tests, zero failures/skips. These cover flight roof/wall clearance, indoor room boundary use, IPIC ceilings/escalators and carriage exit cameras.

An executed before/after scan using the original module from `git show dafd0bd4:preview/src/third-person.js` and the patched module recorded `.runtime/ribbonwing-flicker/room-overflight.json`: 248 headings, 166 collapsed before (minimum gap 0 m), zero collapsed after (minimum gap 10.452870419171811 m). This is geometry evidence, not rendered symptom acceptance. Parent source review found no blocking findings.

`pnpm install --frozen-lockfile --ignore-scripts` passed using the existing store. Initial `pnpm run --silent agent:doctor` blocked because the isolated worktree lacked its Python environment; `uv sync --locked` passed and doctor then passed.

`pnpm run verify` passed with exit 0 on base `dafd0bd4` plus the dirty patch recorded here: tooling 289 passed; preview 4702 passed, one skipped, 35 todo; server 1099 passed, 285 skipped; desktop 127 passed, five skipped; Python 215 passed with 66 warnings. Production build, Python lint/format, the synthetic demo's expected blocked verification contract and worktree secret guard passed. Core deliberately excludes Redis/browser/native/live-auth acceptance; skips are not acceptance evidence. The shared heavy-command/browser lock was held through verification and released after completion. Artifacts: `.runtime/ribbonwing-flicker/core.log`, `core.json`, `room-overflight.json` and `source.sha256` (ignored, local).

## Rendered acceptance limitation

The isolated normal dev candidate is usable at `http://127.0.0.1:5185/?motion-debug=1&finish=pink-jet-age`, town port 8797, with Redis disabled. It uses the existing primary environment through Node's `--env-file` without copying or printing credentials; original owner port 5183 remains unchanged. A new Safari tab reached the real WorkOS login gate. Safari lacks an authenticated game session, so no in-world candidate capture or flight was possible. Dia was changing under the user's control and the tool rejected an action as concurrent user activity; it was not reused. An observed original 5183 page showed “Connecting you to your people and places. Please wait before reconnecting.” with Try again/Sign out. No fake authentication or access-gate changes were made.

Live authenticated flight over a boutique roof and the original user-reported flicker remain unverified. A source camera defect is fixed; this ledger does not claim that all screen flicker is resolved. Browser interaction remains native CUA only, so repository Playwright journeys were not substituted for the missing authenticated native session. No merge or deployment is authorized by this patch task.
