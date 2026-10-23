# Login flicker and Character Studio in development

## Objective

Signing in must settle in one direction: no theme, sign-in art, Character Studio button or selected character may flip back and forth while the district opens. Character Studio is always available in development.

Task: `login-flicker`. Owner: `claude:world-expansion-20261022-1950`. Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-login-flicker`. Branch: `fix/login-flicker-20261022`, from `main` at `52379be6`.

## Causes found

1. **Redirect sign-in.** The quiet themed splash (`first-paint.js`) keyed only on the persistent `river-oaks-entered` flag. That flag is missing in a new browser and is cleared on sign-out, so every GitHub sign-in returned to the dark sign-in art, then the light game.
2. **In-page sign-in (email code).** The dark sign-in card stayed up while the game loaded, then swapped straight to the game.
3. **Studio button.** The button was created enabled and disabled one frame later, because `canOpen()` waits about 4 s for the avatar. The first probe recorded absent → enabled (1.03 s) → disabled (1.05 s) → enabled (5.1 s).
4. **Studio button visibility.** The first probe recorded the button shown for one frame (1.03 s), hidden until 3.6 s, then shown again. Cause: `player-avatar.js` creates the character panel visible, and its per-frame update hides it (`panel.hidden = !pose`) until the walk has a pose. For one frame the Character pane and its studio button paint, then the dock hides the Character tab until the world loads. Fix: the panel is created hidden, the state the next frame forces anyway.

## Changes

- `first-paint.js` also opens on the splash when this tab carries the one-load `river-oaks-signing-in` mark (sessionStorage), and consumes it.
- `access-entry.js` sets that mark when "Continue with GitHub" is clicked, and shows the themed splash while `main.js` loads after approval. The existing gate logic still ends the splash and forgets the visit when sign-in is needed.
- `character-studio.js`: the trigger starts disabled.
- `player-avatar.js`: the character panel starts hidden.
- `characterStudioShown` (`character-studio-state.js`): development shows the studio unless `VITE_CHARACTER_STUDIO=false`; builds still need `true`. `devTownEnv` (`server/vite-town.js`): the development town takes Studio saves unless `RIVER_OAKS_CHARACTER_STUDIO` is set. `.env.example` and `docs/character-studio.md` are updated.
- Tests:
  - `access-gate` journey: a GitHub redirect returns to the themed splash, the mark is consumed, and the splash covers the game load.
  - New `login-flicker` journey: records every frame from first paint. It fails if the theme, gate, background, studio button or selected character returns to an earlier value, or if the splash shows more than once or never ends.
  - Unit tests for both development defaults.

## Checks

- Core run 1 failed. Two `adversarial-workplace` Redis tests timed out because the run shared Redis db 1 with another session's instance. Those tests passed 11/11 on a fresh disposable Redis (`127.0.0.1:16390`).
- Core run 2, on fresh Redis, passed:

  | Suite | Passed | Skipped |
  | --- | --- | --- |
  | Tooling | 201 | 0 |
  | Preview | 3,756 | 1 |
  | Server | 990 | 0 |
  | Desktop | 115 | 3 |
  | Python | 149 | 0 |

  Build, demo and secret checks also passed.
- Focused studio and vite-town tests: 13/13 passed.
- `access-gate` with the fix passed.
- The same journey on unfixed `main` (throwaway worktree `river-oaks-login-flicker-proof` at `52379be6`, with only the new test copied in) failed as intended: it timed out waiting for the splash after the GitHub redirect.
- Browser-queue enqueue crashed several times under contention (six waiters polling the metadata lock). Runs now go through a retry wrapper that retries only that crash.

## Incident

The first proof script used a bare `git stash pop`. The stash list is shared by all worktrees, so it tried to pop another session's stash (`baseline-580`). The pop aborted on a tracked conflict but had already written that stash's 20 untracked files. All 20 were confirmed byte-identical to the preserved stash, then removed. Their stash entry is untouched. This task's stash was restored by SHA, and later runs use file copies instead of `git stash`.

## Next

1. Finish the probe and the unfixed proof, and fix the studio visibility flip.
2. Rerun the focused checks and the probe.
3. Make a signed commit, open the PR, and land it with `pnpm run land` (merge authorized by the user).

## Hosted CI, first run (451d1429)

The new `preview experience (access)` shard ran both journeys. `access-gate` passed. `login-flicker` failed only on its own splash rule: splash off (0.19 s), on (0.36 s), off (2.1 s, game shown). That is the designed sequence for a fresh browser: the gate's access check, then the themed splash while the game loads, then the game. The rule was corrected to "the splash shows at most once and ends". The other fields kept the never-return rule.

The CI timeline from that run, evaluated for every field (the probe logs it before checking): theme, gate, background, studio button, studio visibility and character each show zero returns. The studio button went absent (0.19 s) → disabled (2.1 s) → enabled (9.6 s). The character panel stayed hidden until the walk had a pose (7.3 s), then showed once. The splash ran as one phase (0.36–2.1 s) and ended. This confirms both studio fixes on hosted Chromium (Mesa).

Follow-up, not in this change: while the Character tab is hidden before the walk has a pose, the open Play & rides dock selects the Rides tab (2.1–7.3 s), then moves to Character. That is one switch, not a flip back. Whether it is visible depends on the loading overlay. A fix would keep the dock hidden, or its selection unchanged, until the first pose.
