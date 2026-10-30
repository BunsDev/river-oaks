# Office desk: hosted TypeSafe Computer origin in Place's frame policy

- **Goal:** Val, 2026-10-29: "ensure the computer is connected to the typesafe computer"
- **Task id:** `computer-origin-20261029` (live register)
- **Owner:** `claude:river-oaks-22 (b90b7d)`
- **Branch:** `feat/computer-origin-20261029`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-computer-origin`
- **Baseline head:** `39a5f30272ea620ce692b95fcc15a8c69b9aff9f` (`origin/main`, 2026-10-29)

## Objective

The office desk's Computer tab (`preview/src/office-computer-frame.js`, #486) loads
Computer only from `VITE_TYPESAFE_COMPUTER_ORIGIN`, and the browser only allows the
frame when Place's `frame-src` lists that origin. Neither was in place for the hosted
Computer, `https://typesafe-computer.vercel.app`. This slice does the Place-side part so
the connection needs only the owner's environment switch.

Observed on 2026-10-29 (HEAD requests, no credentials): the hosted origin answers
`/?embed=place` with 200 and sends no `Content-Security-Policy` or `X-Frame-Options`;
`/api/auth/login` exists. It serves Computer's main branch, which has no embed mode
(TypeSafeAI/typesafe-computer#33 is draft PR #34 at 8c0240af, unmerged), so a frame to
it never answers `init`; Place would report that Computer did not open and return to
Tasks after its load timeout.

## Files owned

- `vercel.json`, `server/security-headers.js`: `frame-src` adds the hosted origin (the
  two strings stay identical).
- `server/tests/hardening2-security-headers.test.js`: frame-src expectation.
- `preview/tests/office-computer-frame.test.js`: the hosted origin is accepted by
  `computerConfig` with the three derived URLs.
- `.env.example`: documented, commented `VITE_TYPESAFE_COMPUTER_ORIGIN`.
- `docs/office-computer-embed.md`: Status, frame policy and staged blocker 4.

## Checks

- `node --test server/tests/hardening2-security-headers.test.js preview/tests/office-computer-frame.test.js`
- `pnpm run verify` (core)

## Results

- Focused: 18 tests, 18 pass.
- Core verify (`pnpm run verify`, 2026-10-29T22:26Z on 39a5f302 + these edits, load ~19): passed, 11/11 stages (agent-tests 289/289, preview-tests 4681 run 4645 pass 36 skipped 0 fail, server-tests 1365 run 1080 pass 0 fail (skips are Redis/live-auth), desktop-tests 132 run 127 pass 0 fail, build, python-lint/format/tests 170 pass, demo, demo-verify, secrets no leaks). Receipt `.runtime/agent/core.json`.

## Gaps

- `VITE_TYPESAFE_COMPUTER_ORIGIN` is unset in Development, Preview and Production
  (names read with `vercel env ls`; values not read). Setting it is the owner's
  production configuration step and was not done here.
- Computer's embed build (#34) is not merged or deployed; with the variable set today
  the tab would time out to Tasks.
- `typesafe.place` and `typesafe-computer.vercel.app` are cross-site; Computer's
  `SameSite=Lax` session cookie question (TypeSafeAI/typesafe-computer#21) is unresolved
  and may show framed players as signed out.
- No hosted or browser run of the desk against the real origin.

## Next step

Owner: deploy Computer #34 to the hosted origin, then set
`VITE_TYPESAFE_COMPUTER_ORIGIN=https://typesafe-computer.vercel.app` (Preview first),
and run `office-computer-embed` or a manual desk visit against it.
