# Desktop release rehearsal: unsigned candidate from `main` `67203a6a` (#373)

Task `desktop-platform-release-373`, branch `docs/desktop-release-packet-373-20261024`, owner `claude:river-oaks-7c (0cd79998)`. Goal ledger: [2026-10-24-desktop-three-platform](2026-10-24-desktop-three-platform.md).

These are **rehearsal bytes, not release bytes**. They are labelled 0.2.1, the version of the existing macOS-only release, and Windows is unsigned. A rehearsal finds platform bugs before the first three-platform release; it fills no row of a release ledger. The release itself follows [docs/desktop.md, "Releases on Windows, Linux and macOS"](../../desktop.md#releases-on-windows-linux-and-macos) on a signed tag.

## Candidate

`Desktop` dispatched on `main` once at 2026-10-24 19:29Z: run [40125506138](https://github.com/BunsDev/river-oaks/actions/runs/40125506138) at `67203a6a7a4eb75888e01ade1301f9411f382b4e`. Before dispatching, `gh api repos/BunsDev/river-oaks/actions/variables` returned no variables and the environments were `copilot`, `Preview` and `Production`, so `Windows signing configuration` skipped signing and `sign (windows-latest)` was skipped. Every other job passed: `desktop` on all three runners, `installers (windows-latest)`, `installers (ubuntu-24.04)` and `installers (SHA256SUMS)`.

`TypeSafe-Place-0.2.1-installers-unsigned` (artifact expires 2026-11-23), downloaded and checked with `shasum -a 256 -c SHA256SUMS`, all five OK:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `TypeSafe-Place-0.2.1-windows-x64-Setup.exe` | 156,165,632 | `191fd328c9f13bb65ca79000561c388d801b22f7a5c0627fabd77a2545aae028` |
| `TypeSafePlace-0.2.1-full.nupkg` | 155,424,231 | `bfa40e95bfab91498b9e2200f9e53c998489809977149352a4c5f218ec23ab2d` |
| `RELEASES` | 84 | `09418d4e793ce343cac167a909253b335fab1293dce05090629679196fc2be34` |
| `TypeSafe-Place-0.2.1-linux-x64.AppImage` | 115,862,008 | `97bc29e7acfc0a24c9e00402d2dfc2c4c8cdd252c4ba7073af290c4e03777aa7` |
| `TypeSafe-Place-0.2.1-linux-x64.deb` | 91,740,656 | `a48dc042f80c1e9fd9cf4c8563fbf7a7035807cb25ae97941904a822f4f993cd` |

The macOS rehearsal file is the per-platform zip `TypeSafe-Place-0.2.1-macos-arm64-unsigned` from the same run (ad-hoc signed; expires 2026-11-07). A release builds macOS locally with Developer ID instead.

What CI already proved on these exact installers (`installer-acceptance-linux`, `installer-acceptance-windows`, both `ok: true`): checksums, install, the fuse wire and asar of the installed copy, every installed file against the build manifest, shortcuts and their AppUserModelID or the desktop entry and icons, `chrome-sandbox` root 4755 and the AppArmor profile, one offline launch, and a clean uninstall. The Linux job ran on Ubuntu 24.04.5 LTS, kernel 6.17.0-1022-azure, with the user-namespace restriction on. CI cannot prove a GPU, a display, a person signing in, a microphone or an upgrade; the rows below are for those.

## Getting the files

```sh
gh run download 40125506138 -R BunsDev/river-oaks -n TypeSafe-Place-0.2.1-installers-unsigned -D typesafe-place-rehearsal
gh run download 40125506138 -R BunsDev/river-oaks -n TypeSafe-Place-0.2.1-macos-arm64-unsigned -D typesafe-place-rehearsal-macos
cd typesafe-place-rehearsal && shasum -a 256 -c SHA256SUMS
```

On Windows without `shasum`, compare `certutil -hashfile TypeSafe-Place-0.2.1-windows-x64-Setup.exe SHA256` with the table above.

## Rows, per machine

Record each machine as it is (model or VM, OS version and build, GPU) and each row as **pass**, **fail** (with what happened) or **n/a** (with why), in a copy of the template's Machines and Acceptance tables. Rows that need an approved account: Device sign-in, Microphone, and anything after sign-in. Use a real account through the normal sign-in; this packet never uses fixture identities.

### W1: Windows 11 x64

| Row | Steps | What to record | Open defect that could fail it |
| --- | --- | --- | --- |
| Install and first launch | Run `Setup.exe`. Expect SmartScreen's unknown-publisher prompt (unsigned): "More info", "Run anyway". The app opens. | The prompt's exact text and publisher; Start menu and desktop shortcuts present; the "TypeSafe Place" entry under Installed apps (publisher Jev Works); taskbar icon and title. | Unsigned Windows (#372) |
| Device sign-in | From a fresh profile: the dialog shows a code, the browser opens, enter it, return; play loads. Quit, relaunch: still signed in. Sign out: back to sign-in. | Each transition; whether relaunch kept the session. | — |
| Microphone | Join shared voice, unmute. Turn off Settings → Privacy → Microphone → "Let desktop apps access your microphone": the game stays playable. Turn it on: a peer hears you. | No per-app prompt is expected on Windows; record what appeared. | — |
| Window state | Resize, move, maximize, fullscreen; quit and relaunch after each. With two displays, disconnect the window's display and relaunch. | Whether each state restored; where the window opened. | — |
| Photo and Studio export | Commands → Photo mode → save a PNG; Game → World Studio → export the region JSON. Both through the native Save dialog. | File saved; no other download prompt. | — |
| Renderer crash recovery | Task Manager → Details → add the Command line column → end the `TypeSafe Place.exe` with `--type=renderer`. It reloads once by itself. End it again within a minute: "The game stopped unexpectedly"; Reload game works. | Seconds from ending the process to the reloaded game. | — |
| Studio hosts | On a machine without `claude`, `codex` or `coven`: open World Studio. Both providers show unavailable; the first send names the `.exe` to install. | The message text. | — |
| Upgrade | n/a for this rehearsal: no earlier Windows install exists. For the release, install this candidate first, then the release over it, and say so. | — | — |
| GPU and frame timing | From a checkout of `67203a6a`: `RIVER_OAKS_ACCEPTANCE_FIXTURE=1 RIVER_OAKS_DEV_TOWN_PORT=8797 pnpm run test:desktop:e2e --dev`, then attach `gpu` and `performance` from `data/reports/desktop-development.json`. | GPU, frames, median, p95, and the quality line. | macOS e2e measurement (#371, PR #651) affects how `performance` is read on slow GPUs |

Uninstall afterwards from Installed apps; `%AppData%\River Oaks` keeps the profile until deleted.

### L1 and L1w: Ubuntu LTS x64, once in an X11 session and once in Wayland

| Row | Steps | What to record | Open defect that could fail it |
| --- | --- | --- | --- |
| Install and first launch | `sudo apt install ./TypeSafe-Place-0.2.1-linux-x64.deb`, then open TypeSafe Place from the launcher. Separately: `chmod +x TypeSafe-Place-0.2.1-linux-x64.AppImage && ./TypeSafe-Place-0.2.1-linux-x64.AppImage`. On Ubuntu 23.10+ the AppImage is expected to stop with "The SUID sandbox helper binary was found, but is not configured correctly" unless an AppArmor profile is installed. | Launcher icon, dock match to the running window (X11 and Wayland), title; the AppImage result and which profile, if any. | — |
| Device sign-in | As on Windows. | Whether a keyring (GNOME Keyring) was unlocked: it decides how the cookie is protected (`docs/security-review.md`). | — |
| Microphone | Join voice, unmute; deny or turn the microphone off: still playable; allow: a peer hears you. | What appeared (no per-app prompt is expected). | — |
| Window state | As on Windows, in both sessions. | Each state, per session. | — |
| Photo and Studio export | As on Windows. | — | — |
| Renderer crash recovery | `pgrep -af 'typesafe-place.*--type=renderer'`, then `kill <pid>` (the documented row: SIGTERM, which writes no core dump). It reloads once; again within a minute: the recovery choice. **Then repeat with a real crash signal:** `kill -SEGV <pid>`. First run `cat /proc/sys/kernel/core_pattern`: if it pipes to `systemd-coredump`, time the wait. | Core pattern; seconds to reload after SIGTERM and after SIGSEGV. | Linux crash recovery waits for `systemd-coredump` (#370; measured about 290 s on CI) |
| Studio hosts | Without `claude`, `codex` or `coven` on `PATH`: World Studio shows both unavailable. | The message text. | — |
| Upgrade | n/a for this rehearsal (no earlier Linux install). For the release: install this `.deb`, then `apt install` the release `.deb` over it. | — | — |
| GPU and frame timing | As on Windows, from a checkout of `67203a6a`. | GPU and frame fields. | — |

Remove with `sudo apt remove typesafe-place`; it also unloads the AppArmor profile.

### M1: Apple Silicon Mac

| Row | Steps | What to record | Open defect that could fail it |
| --- | --- | --- | --- |
| Install and first launch | Unzip `TypeSafe-Place-0.2.1-macos-arm64-unsigned`, check its `SHA256SUMS`, move the app to Applications and open it. This rehearsal zip is ad-hoc signed, so Gatekeeper is expected to block it until it is allowed in System Settings → Privacy & Security; a release zip is Developer ID signed and notarized and must open without a warning. | What Gatekeeper showed. | — |
| Device sign-in, Microphone, Window state, Photo and Studio export, Studio hosts | As above. macOS asks once for the microphone. | — | — |
| Renderer crash recovery | Activity Monitor → TypeSafe Place Helper (Renderer) → Force Quit; then again within a minute. | Seconds to reload. | — |
| Upgrade | Replace the app in Applications with the newer build. | Preference and session kept or not. | — |
| GPU and frame timing | As on Windows. | — | macOS e2e measurement (#371, PR #651) |

## Platform bugs found

Record each as a comment on #370 (code) with the machine, OS, file digest and steps; do not fix them in a docs branch.

None recorded yet: no person has run these rows.

## What this packet does not do

It fills no release row, signs nothing, tags nothing and publishes nothing. The first three-platform release still needs Windows signing (#372), Val's decisions on #372 and #373, the version bump, the signed tag and its own run.
