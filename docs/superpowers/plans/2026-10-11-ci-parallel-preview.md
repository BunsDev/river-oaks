# Parallel preview check

Objective: shorten the wait for every merge. The `main` ruleset requires `preview`,
`verify (3.11)` and `verify (3.13)` on a branch that is up to date with `main`, so
merges are serial and each waits for a fresh `preview` run.

Owner: Claude Code session `46fc41e0-26d1-4116-956a-7cac77a13769`. Task
`ci-parallel-preview`. Branch `ci/parallel-preview-20261011` from `main` at
`4849d62`. Val asked to do whatever advances the queued merges.

## Baseline

`preview` on `main`'s push run 38163207461 took 23.5 minutes in one job. The two
`verify` jobs took about 30 seconds each.

| Step | Seconds |
| --- | --- |
| Shared town journeys | 671 |
| Contextual action, photo and command journeys | 473 |
| Unit, server and desktop tests | 133 |
| Security browser regressions | 67 |
| Setup, tooling, build, reflections | about 60 |

Per-journey times from the same log set the shard split: `required` 302 s,
`development` 185 s, `development-world` + `development-publish` + `creator` 172 s;
`spatial-streets` 216 s and `world-studio` 14 s, against 249 s for the other seven.

## Change

`.github/workflows/verify.yml` only. The same commands now run in parallel jobs:

- `preview-checks`: audit, tooling, unit, Redis-backed server, desktop, build,
  security browser and reflections. It keeps the Redis service.
- `preview-shared`: three shards, passed to `shared-runner.js` as mode arguments.
  The runner already accepts them, so no test code changes.
- `preview-experience`: two shards of named journeys.
- `preview`: needs all three. It passes only when every one succeeded, so a
  failed, cancelled or skipped job fails it. The ruleset's required context is
  unchanged.

Shards don't fail fast, so every failing journey reports. Failure evidence
artifacts carry the shard ID, because artifact names must be unique per run.
Expected wall time is about 7 to 8 minutes: the slowest shard plus about 1.5
minutes of setup. The repository is public, so the extra standard runners are not
billed.

## Checks

- `actionlint .github/workflows/verify.yml`: clean.
- The new shards cover exactly the nine experience journeys and five shared modes
  of the old job, and no other old step was dropped (compared with PyYAML).
- Under bash, `read -ra` splits each shard list into separate arguments, and both
  runners reject an unknown name. That shows the arguments reach them.
- The PR's own run uses this workflow, because `pull_request` runs read the PR's
  merge commit. That run is the acceptance test.
- Acceptance: PR run 38165724820 at `96e31bb` passed every job. Wall time was 5 min
  48 s, against 23.5 min for the single job on `main`. Shard durations: shared
  `worlds-and-creator` 4:14, `development` 4:41, `required` 4:56; experience
  `streets` 5:04, `places` 5:42; checks 5:08; then `preview` itself in 2 s. GitHub
  counts `preview` as the required context on the PR.
- `river-oaks-c2` reviewed `96e31bb`: no findings.

## Next

Open the PR and ask `river-oaks-c2` to merge it right after the PR now in its
guard. Every later PR then waits for the shorter run.
