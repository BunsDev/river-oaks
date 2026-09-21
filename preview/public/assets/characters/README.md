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

## Jevica and playable forms

`jevica.glb` is a separate hero asset built from the same CC0 system pack. It
retains the existing female proportions, adds one level of body subdivision,
high-poly eyes with their corneal alpha mask, eyebrows, eyelashes, long hair,
and an original fitted bodice. `jevica.sources.json` records the ingredients,
byte size and SHA-256. The shared six resident assets are unchanged.

`preview/src/jevica-costume.js` adds strand-color shading, woven rose silk,
embroidered bodice detail, a folded skirt, sheer shoulder bows, silver filigree,
earrings and the wand. This is a higher-detail real-time character, not a scanned
actor or a claim of film-quality photorealism. The supplied Glinda and premiere
photos informed costume design; those photos are not redistributed.

Build with Blender and the cached assets, or an isolated `bpy` environment:

```sh
uv venv --python 3.11 data/raw/characters/jevica-build
uv pip install --python data/raw/characters/jevica-build/bin/python bpy==4.5.3
BLENDER_USER_RESOURCES="$PWD/data/raw/characters/blender-user" \
  data/raw/characters/jevica-build/bin/python scripts/build_jevica.py
```

The other playable forms are Baum's Oz travellers, built from the public-domain
novel's descriptions rather than any film design: Dorothy (gingham pinafore,
braids, basket and silver shoes), the Scarecrow (patched burlap, straw cuffs and
a floppy hat), the Tin Man (riveted tin, jointed limbs, funnel hat, oil can) and
the Cowardly Lion (tawny fur, a bowed mane and a tufted tail), plus the Wicked
Witch in velvet robes and cape. Costumes are player-only. Residents and store
people are dressed by `preview/src/oz-folk.js` as the peoples of the five Oz
countries (Munchkin, Winkie, Quadling, Gillikin and Emerald City): the shared
suit is tinted to the country colour and a country hat follows the head bone.
`preview/src/head-fit.js` measures each rig's skull and hair around the head
joint from the skinned mesh (cached per template, scaled per instance), and
every hat — folk hats and the player hats alike — is cut to those measurements,
so brims clear the hair, crowns sit on it, hoods replace it and the Emerald
spectacles sit at the eye line. `e2e/fixtures/jevica.html?resident=local-04&rig=1`
renders a dressed resident on a given shared rig for inspection.
The `*-portrait.png` files are actual renderer captures of these models, made
with `e2e/fixtures/jevica.html?form=<id>` at 288 × 352 and
`window.jevicaFixture.render('portrait')`.
Use `e2e/player-forms.js` with the repository's Playwright browser runner to
check transformations, camera mode, flight, responsive controls and portraits.
