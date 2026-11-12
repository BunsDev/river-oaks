# Release 0.3.0: Pink Jet-Age as the look (owner decision, 2026-11-11)

Branch `release/v0.3.0-20261111`. Written in a cloud checkout with no access to the live task
register; no register claim was made and `docs/project-management/tasks.json` is not edited.

## Authority

On 2026-11-11 the repository owner asked for the whole reskinned world to ship as the release,
and chose to have this session merge once hosted checks are green and create the version tag and
GitHub release. The owner was told beforehand that 0.3.0 qualification was still recorded as
BLOCKED, that this session cannot install packages, run a browser or see a rendered frame, that
its commits are unsigned, and that it has no access to production. Deploying and any change to
production configuration stay with the owner.

Earlier owner decisions this release relies on (#738): Classic is retired, the interface is to
be rebuilt, crime is not planned, workplace #221 is unchanged.

## Scope

- Release notes: `docs/releases/0.3.0.md`.
- Version: `package.json` 0.2.2 to 0.3.0.
- Copy: `README.md` and `docs/world-direction.md` describe Pink Jet-Age as the direction.
- Lands after #914 (a saved Classic choice is ignored) and #915 (original District materials).

## Qualification state at release

- Last pinned run: `3a20dfa1`, 2026-11-10, recorded on #359 as BLOCKED / NO-GO. One row is over
  budget: phone-viewport one-player CPU submission p95, 9.60 ms against 8.70 ms on v0.2.2,
  +10.34% against +10%. Cause unassigned. All other rows within budget.
- Not rerun here, not waived, not reattributed. The owner released with the row open.
- #914 and #915 landed after that run and are not performance-qualified. #915 changes colour
  values only; #914 removes one storage read.

## What this session could and could not check

| Check | State |
| --- | --- |
| Hosted `Verify` matrix on each pull request | Run; results are recorded on each pull request |
| Focused pure tests (finish reader, District palette, HUD contrast) | Run locally on Node v22.23.4 |
| `pnpm run verify`, `verify full`, build, browser journeys | Hosted only; never run locally |
| Rendered frames, matched captures, night views, in-game review | None |
| Physical devices, screen readers, human accessibility review | None |
| Production smoke, deployment, occupied-state rollback rehearsal on this head | None |

## Desktop

The documented desktop release steps were not followed, and no desktop build ships with 0.3.0:

- Step 1: this commit is not signed with `-S`, and it lands through the GitHub merge API after
  the required checks pass, not through `pnpm run land`.
- Step 2 (macOS build, sign, notarize): not run. No Apple credentials or macOS host here.
- Step 3: this session could not create the tag. Its GitHub access refuses tag pushes and the
  tag and release endpoints, so the owner creates `v0.3.0` (signed, per the documented step) and
  the GitHub release. Pushing the tag starts the `Desktop` workflow. An unsigned Windows
  installer from that run is not a release asset.
- Steps 4 to 6 (keep the candidate, real-machine acceptance, publish installers): not run.

The GitHub release notes were prepared for the owner to publish as a pre-release, with notes
only.

## What happened

- #915 (original District materials) merged as `060f9aa1` after 34 of 34 hosted checks passed on
  the first attempt. Vercel deployed it to production.
- #914 (a saved Classic choice is ignored) failed `preview shared (required-characters)` twice at
  the same Character Studio step, which also failed on an unrelated Dependabot branch (run
  42773510255); the record is on #914. Its commit landed inside #916.
- #916 (this release) merged as `50f6ae01` after every hosted check passed on the first attempt
  (36 passed, 5 desktop installer and signing jobs skipped as they are on every pull request).
  The merge commit's tree equals the tested head's tree.
- The owner confirmed on 2026-11-11, before the first merge, that merging deploys to production.
- The tag should point at the merge commit of the pull request that adds this section, so the
  tagged tree carries this record.

## Rollback

The compatibility note in the release notes still applies: back up the town's room keys before
deploying, because a rollback to `v0.2.2` means restoring that backup. #914 and #915 change no
saved data, world data, IDs or protocol, and each reverts on its own.

## Remaining after this release

- In-game review of the restyled District by the owner, then form and the reference-facade
  decision (#740).
- The phone-viewport CPU row (#359, #747).
- Interface rebuild (#746); Classic tables and the `?finish=` harness parameter (#913).
- Desktop build, signing and acceptance for 0.3.0 (#369).
