# Desktop release ledger template

Copy this file to `docs/superpowers/plans/<date>-release-<X.Y.Z>.md` in the bump PR and replace every `<…>`. The steps are in [docs/desktop.md, "Releases on Windows, Linux and macOS"](../../desktop.md#releases-on-windows-linux-and-macos). A row is filled only from a person's run on a real machine; a CI job or fixture run never fills one. Delete this paragraph in the copy.

# Release <X.Y.Z>: macOS, Windows and Linux

Task `<register id>`, branch `release/v<X.Y.Z>`, owner `<session>`.

## Scope

- Release notes: `docs/releases/<X.Y.Z>.md`.
- Bump PR `#<n>`, merged as `<merge commit>`; reviewed head `<sha>`, tree `<sha>`, `<n>` hosted checks.
- Decisions taken for this release (Val's, with dates): `<…>`

## Candidate

**macOS** (local, detached worktree at `<merge commit>`):
- `pnpm install --frozen-lockfile`, `pnpm run test:desktop`: `<n>/<n>`.
- `desktop:package` and `desktop:package:check`: `<result>`.
- `desktop:sign --notary-profile river-oaks-notary`: authority `<…>`, notarization `<submission id>` `<status>`, stapled, `spctl` `<…>`. Receipt: `<path>`.
- `TypeSafe-Place-<X.Y.Z>-macOS-arm64.zip`: `<bytes>` bytes, SHA-256 `<…>`.

**Tag:** `v<X.Y.Z>` (object `<sha>`) points to `<merge commit>`; GitHub reports it `<verified?>`.

**Windows and Linux** (`Desktop` run `<run id>` on the tag):
- `Windows signing configuration`: `<configured / skipped>`. `sign (windows-latest)`: `<result>`, environment approved by `<who>`.
- Certificate subject `<…>`, SHA-1 thumbprint `<…>` (from `installer-acceptance-windows-signed`).
- Artifact `TypeSafe-Place-<X.Y.Z>-installers`, downloaded to `~/worktree-backups/river-oaks/release-v<X.Y.Z>-artifacts/installers`; `shasum -a 256 -c SHA256SUMS` `<result>`.

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `TypeSafe-Place-<X.Y.Z>-windows-x64-Setup.exe` | `<…>` | `<…>` |
| `TypeSafePlace-<X.Y.Z>-full.nupkg` | `<…>` | `<…>` |
| `RELEASES` | `<…>` | `<…>` |
| `TypeSafe-Place-<X.Y.Z>-linux-x64.AppImage` | `<…>` | `<…>` |
| `TypeSafe-Place-<X.Y.Z>-linux-x64.deb` | `<…>` | `<…>` |

## Machines

| Id | Model or VM | OS version and build | Display session | GPU | Tester | Date |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | `<…>` | Windows 11 `<version, build>` | — | `<…>` | `<…>` | `<…>` |
| L1 | `<…>` | Ubuntu `<version>` | X11 | `<…>` | `<…>` | `<…>` |
| L1w | same as L1 | same | Wayland | same | `<…>` | `<…>` |
| M1 | `<…>` | macOS `<version, build>` | — | `<…>` | `<…>` | `<…>` |

## Acceptance

Each cell: **pass**, **fail** with the issue filed, or **n/a** with the reason. Put what was observed in the notes below the table, by row and machine.

| Row | W1 | L1 (X11) | L1w (Wayland) | M1 |
| --- | --- | --- | --- | --- |
| Install and first launch | | | | |
| Device sign-in | | | | |
| Microphone | | | | |
| Window state | | | | |
| Photo and Studio export | | | | |
| Renderer crash recovery | | | | |
| Studio hosts | | | | |
| Upgrade | | | | |
| GPU and frame timing | | | | |

Notes, by row and machine:
- **SmartScreen (W1):** `<the prompt shown, if any, and the publisher it named>`
- **AppImage on Ubuntu 23.10+ (L1):** `<sandbox stop as documented, or the profile used>`
- **Cookie protection (L1):** `<keyring unlocked or not>`
- `<…>`

## Publication

- `gh release create v<X.Y.Z> --verify-tag --draft` with `<n>` assets and `SHA256SUMS`.
- Uploaded digests compared with `SHA256SUMS`: `<result>`.
- Published `<time>` as `<Latest / prerelease>`: `<release URL>`.
- A fresh download into an empty folder passed `shasum -a 256 -c SHA256SUMS`.
- Evidence kept in `~/worktree-backups/river-oaks/release-v<X.Y.Z>-artifacts/`: `<list>`.

## Unverified scope

Empty, or each item with its reason and the issue that owns it: `<…>`

## Close-out

- Register task `<id>`: delivered with the evidence above, then retired with `pnpm run project:prune --branch release/v<X.Y.Z> --expected-head <sha>` (dry run, then `--apply`), archive `<…>`.
