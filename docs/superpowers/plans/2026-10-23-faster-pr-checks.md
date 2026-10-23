# Faster pull request checks

## Objective

Development pace at least twice as fast. Cut the CI work each pull request waits on, without dropping coverage from `main`, tags or the weekly run.

Task: `faster-pr-checks`. Owner: `claude:world-expansion-20261022-1950`. Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-faster-ci`. Branch: `ci/faster-pr-checks-20261023`. PR: #607.

## Baseline (#594, head `92a91d2e`)

- 27 check runs, 25.4 minutes wall to wall.
- Most Verify jobs waited 7–9 minutes for a runner. No workflow cancelled superseded runs, so every lander update from `main` left the old run holding runners.
- `preview checks` ran its steps serially for 16.5 minutes: unit 8.3, server 3.4, security browser 1.8, screening 1.4.
- Desktop ran 3 OS legs plus installers because the PR touched `shared/`.
- CodeQL default setup analyzed 6 languages, including Swift (an 11-file `experiments/ios-probe`, about 7 minutes on a macOS runner) and C# (three Unreal `*.Build.cs` files).

## Changes

1. `concurrency` with `cancel-in-progress` for pull request runs in Verify and Desktop. `main`, tags, the schedule and manual runs are never cancelled.
2. `preview unit` job (audit, tooling, unit tests) beside `preview checks` (server, desktop, build, security, reflections, screening). The `preview` aggregate needs both.
3. Python matrix unchanged. Running 3.13 only on PRs was tried and reverted: the `main` ruleset requires `verify (3.11)`, so the merge guard refused #607 as blocked.
4. Desktop `scope` job: the full matrix and installers run only for PRs that change `desktop/` or the workflow. Other PRs run the Linux leg.
5. `docs/testing.md` updated.

Not changed: the CodeQL languages are a repository security setting, recommended to the user.

## Results

- actionlint passed on both workflows.
- #607 head `3313f010`, first run: 26 check runs, 19.6 minutes wall, even though this PR takes the full Desktop path because it edits `desktop.yml`.
  - `preview unit`: 5.2 minutes.
  - `preview checks`: 7.1 minutes, down from 16.5.
  - The long pole was runner queueing: the campus shard started at 10.6 minutes and ran 8.9.
- `preview checks` failed once in the known-intermittent email-access browser test: "Your invitations" never became visible. The test starts its own fixture server and doesn't depend on the unit job. The failed jobs were rerun.

- macOS desktop e2e flaked twice on #607 with two different failures (render loop at `desktop/e2e.js:241`, then the Graphics tab click at `preview/e2e/hud-navigation.js:8`). The job passed on rerun and on `main`. With the scope job, PRs that don't touch desktop skip macOS.

## Next

1. Confirm the rerun.
2. Land #607 through the queue.
3. After it merges, measure the next non-desktop PR and record the wall time against the 25.4-minute baseline.
