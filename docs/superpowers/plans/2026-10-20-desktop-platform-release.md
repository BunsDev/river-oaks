# Desktop platform release process and acceptance matrix (#373)

Task `desktop-platform-release-373`, branch `docs/desktop-platform-release`, owner `claude:river-oaks-d8 (015e1f43)`. Started 2026-10-20 at Val's request ("go #373"), from #373's start prompt: documentation and test design only. No platform is marked verified here, and no release is cut.

## Upstream state (read 2026-10-20 from GitHub and `main` at `4e54ea1e`)

| Package | Delivered by | Merge |
| --- | --- | --- |
| #370 identity: icon, Windows metadata, Linux name, Studio hosts | #379 | `18be0f56` (2026-10-14) |
| #371 CI matrix: package, fuse and asar check, e2e on three runners | #377, then #392 | `9a2a4a03`, `0cb10518` (2026-10-15) |
| #372 installers: Squirrel `Setup.exe`, AppImage, `.deb`; signing wired | #399 | `27b11eb5` (2026-10-19) |

#370, #371 and #372 are still open on GitHub; closing them is Val's call. The Desktop workflow on `main` already triggers on `v*` tags (added by #399 for this issue).

## Files

| File | Change |
| --- | --- |
| `docs/desktop.md` | New section "Releases on Windows, Linux and macOS": asset table, where each build comes from, seven release steps, and the acceptance matrix with the steps per row and platform. Three stale lines fixed: the cookie is encrypted since 0.2.1 (intro and diagram prompt), and macOS ships a signed, notarized zip. |
| `docs/security-review.md` | Release acceptance item 7: the matrix gate and the per-platform signature checks (tag, macOS, Windows, Linux). |
| `docs/superpowers/plans/_template-desktop-release.md` | Release ledger template: candidate, digests, machines, matrix rows by platform, publication, unverified scope, close-out. |
| This ledger | |

## Decisions in the docs (open to Val's change)

- **Build origin.** Windows and Linux come from the `Desktop` run on the signed `v*` tag. macOS stays local (detached worktree, `desktop:sign` with notarization) until Developer ID signing moves to CI, because the workflow holds no Apple credentials. This is #373's recommendation.
- **The accepted bytes are the published bytes.** People run the matrix on the tag run's files, and those exact files are released. A failure means no release for that tag: fix, bump the patch version, tag again. Rebuilding after acceptance would publish bytes nobody tested, because Squirrel packages and signature timestamps differ per build.
- **Draft first.** `gh release create --draft`, compare the uploaded digests with `SHA256SUMS`, then publish. 0.2.1 published directly.
- **Unsigned Windows does not ship** unless Val records otherwise in the release ledger.
- **`.nupkg` and `RELEASES` are release assets**, so a later Squirrel updater can read them from the release. Nothing reads them yet.

## Candidate, unsigned (for test design and early platform runs only)

The latest installers on `main` come from `Desktop` dispatch [39343184471](https://github.com/BunsDev/river-oaks/actions/runs/39343184471) at `27b11eb5`, the #399 merge. No desktop path has changed on `main` since: `git diff 27b11eb5 4e54ea1e -- desktop shared package.json pnpm-lock.yaml .github/workflows/desktop.yml scripts/studio-skill-pack.js` is empty. Windows signing skipped, because the Azure variables are unset. The files are labelled 0.2.1, but 0.2.1 is already the macOS release, so these are **not release bytes**. The first three-platform release needs a version bump and a tag run.

Downloaded 2026-10-20 (`TypeSafe-Place-0.2.1-installers-unsigned`, expires 30 days after the run); `shasum -a 256 -c SHA256SUMS` passed for all five:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `TypeSafe-Place-0.2.1-windows-x64-Setup.exe` | 156,022,272 | `d6df95b504e92a5cdd5d369f38b499d64a262fb9010f00e0d86c056bba330836` |
| `TypeSafePlace-0.2.1-full.nupkg` | 155,282,971 | `4ffc1697bf11a3341db691c563a959a59603f34009445d004ce62eeca5510f1f` |
| `RELEASES` | 84 | `6074502802a60d5e634804afdf403ab33de6bdf22eaaf97b4bffd1cbddefb247` |
| `TypeSafe-Place-0.2.1-linux-x64.AppImage` | 115,706,360 | `d556913d655699eb10f90dfce2802404c9a81ed328b76b098b139de8d2747f0d` |
| `TypeSafe-Place-0.2.1-linux-x64.deb` | 91,642,532 | `8387ac35e2418ca01310b8f96baa879877435cd07732945c1afac05aa8f0b1d4` |

**To try the matrix on these before a release** (a rehearsal that finds platform bugs early; it fills no release row):

```sh
gh run download 39343184471 -R BunsDev/river-oaks -n TypeSafe-Place-0.2.1-installers-unsigned -D typesafe-place-candidate
cd typesafe-place-candidate && shasum -a 256 -c SHA256SUMS   # Windows: certutil -hashfile <file> SHA256
```

Then follow the rows in `docs/desktop.md`, "Acceptance on real machines". With these unsigned files, expect SmartScreen's unknown-publisher prompt on Windows. The Upgrade row has no earlier Windows or Linux install to start from.

## Checks

Run in this worktree before committing:

- `pnpm run verify tooling`: passed, 137/137.
- `pnpm run verify security`: passed, no leaks found.
- `pnpm run verify desktop`: passed, 115 of 118, 3 skipped (other-platform cases on this Mac), 0 failed.

The change is docs only; no packaging, install or e2e step was run for it.

## What needs a person (Val)

1. **Windows signing.** Do the Azure Artifact Signing setup in `docs/desktop.md`, "Windows signing" (identity validation takes 1 to 20 business days), then dispatch Desktop once to confirm `sign (windows-latest)` runs.
2. **`.deb` Maintainer.** `desktop/installers.js` uses the GitHub noreply identity that signs the commits. Keep it or name an address.
3. **Desktop shortcut.** Squirrel's install creates a desktop shortcut as well as the Start menu one. Keep it or drop it.
4. **Machines.** A Windows 11 x64 machine, an Ubuntu LTS x64 machine with X11 and Wayland sessions, and an Apple Silicon Mac, plus an approved account for sign-in and a second device or browser for the microphone row.
5. **Version.** The first three-platform release would be 0.2.2, unless Val picks another number.

## Next step

Open the docs PR referencing #373 and comment on #373. After Val's decisions 1 to 3 and the version: the bump PR, macOS build, tag, tag run, the matrix on the tag run's files, then publication, per `docs/desktop.md`.
