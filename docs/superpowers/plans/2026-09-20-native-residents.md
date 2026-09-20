# Native resident integration plan

**Goal:** Replace the district's native markers with the same six clothed catalogue
profiles already used in the browser, with simulation-driven locomotion.

**Architecture:** Convert the checked-in, hash-verified GLBs into Unreal-compatible
skeletal assets without changing their appearance ingredients. Import into a
dedicated generated content directory, assign all six profiles to the existing
`ResidentAppearances` map, and retain its fail-closed marker fallback. Use a native
locomotion implementation that consumes the existing authoritative state/speed;
it must not move the actor or require a licensed plugin.

**Tech stack:** Pillow WebP-to-PNG conversion, UE5.8.2 Interchange and Editor Python, C++ animation
instance, existing Python/JavaScript/native verification suites.

- [x] Probe one GLB conversion and native skeletal import; inspect materials,
      skeleton, bounds, orientation and saved/reopened assets before scaling up.
- [x] Add reproducible conversion/import scripts with input hashes, explicit
      output paths and refusal to overwrite unrelated assets.
- [x] Add native locomotion regressions before implementation. Verify stationary
      states, speed-driven gait, independent instances and unchanged root poses.
- [x] Configure all six district profiles; inspect a rendered stationary character
      from front/back. Evaluate moving poses in automation. Full motion review
      across all profiles remains an explicit visual acceptance limit.
- [x] Run native Editor/Game builds, automation, Python/JS checks, source review
      and secret scans; document measured results and limitations.
- [ ] Deliver through a reviewed PR and verify main CI. Preserve generated local
      content and the user's other checkouts.

Generated `.uasset`/`.umap` content remains local under the repository's existing
policy. The scripts and source manifest must make the result reproducible on
another engine host. This pass does not enlarge the district or add camera modes.
