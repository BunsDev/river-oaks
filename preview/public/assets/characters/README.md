# Generic River Oaks residents

These six clothed, skinned GLB variants were generated with **MPFB 2.0.17** in **Blender 5.2.1 LTS**, using MakeHuman's CC0 system assets. They are generic appearances, including when a fictional cultural encounter uses a public figure's name. They are not scans or likenesses of those people.

The mesh, skin, clothing, hair, shoe and eye source assets are dedicated to the public domain under [CC0 1.0](LICENSE-CC0.md). Source credits: MakeHuman Community, Data Collection AB, Joel Palmius, Jonas Hauquier and the contributors credited in the source pack. MPFB's program code has a separate GPL license; it is a build dependency kept outside the shipped browser assets.

- [Official system asset pack and CC0 download](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html)
- [MPFB 2.0.17 source](https://github.com/makehumancommunity/mpfb2/tree/v2.0.17)
- `sources.json`: exact profile ingredients, generated file sizes and SHA-256 hashes.

The files embed WebP textures and one skeleton each. Per-profile triangle counts range from approximately 27,000 to 36,000. All six models together occupy about 9.5 MiB. The browser caches the six templates, clones their skeletons for independent poses, and limits full character rendering to 120 meters or the selected conversation. Speech produces a subtle head motion, not phoneme lip synchronization. Missing assets leave an explicit fallback condition.

To rebuild from the repository root, install Blender 5.2.1 and run:

```sh
uv run python scripts/fetch_character_assets.py
mkdir -p data/raw/characters/blender-user
BLENDER_USER_RESOURCES="$PWD/data/raw/characters/blender-user" \
  blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python scripts/build_characters.py
```

The fetcher verifies both archive hashes and bounds downloads/extraction. The builder uses an isolated extension repository, generates relaxed standing poses, reduces texture resolution, and exports self-contained GLBs. It does not save user Blender preferences. Source archives and the build environment remain ignored under `data/raw/characters/`.
