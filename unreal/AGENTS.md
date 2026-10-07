# Native Unreal runtime

Use UE 5.8.2 and the native toolchain documented in `docs/unreal.md`.
Read `docs/engine-acceptance.md` as dated evidence, not current acceptance.

- Keep code under `Source/RiverOaks/` and follow existing public/private module
  structure. Build the Editor target after C++ changes; Game target when relevant.
- Preserve east/south/up centimeters at the native boundary, asynchronous HTTP,
  bounded requests, stale-tick rejection, authoritative collision and schedules.
- Run `RiverOaks.Contracts` for source-only acceptance; the full `RiverOaks` group
  needs imported assets. Consult the documented build/automation commands and
  retain report paths, engine version and tested revision.
- Web/Python tests do not prove C++ compilation, packaging, map bootstrap, native
  visual correctness or performance. State missing engine/assets/GPU evidence.
- Do not commit Binaries, Intermediate, Saved, DerivedDataCache, generated maps or
  imported binary assets. Do not download/rebuild large asset packs without scope.

See root AGENTS.md. Never overwrite another worktree's native edits or processes.
