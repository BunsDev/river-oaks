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

## Jevica

`jevica.glb` is a separate hero asset built from the same CC0 system pack. It
uses authored feminine face and shoulder proportions, adds one level of body subdivision,
high-poly eyes with their corneal alpha mask, eyebrows, eyelashes, long hair,
and an original fitted bodice. `jevica.sources.json` records the ingredients,
macro values, detail targets, byte size and SHA-256. Face targets are applied
before the rig and accessories are fitted. Gentle waves modify only the hero's
hair mesh and retain its skin weights. The six resident assets retain their neutral geometry and textures; all seven
models now include the eyelid animation data described below.

`preview/src/jevica-costume.js` adds strand-color shading, woven rose silk,
gold floral neckline and hem embroidery, one flowing skirt, an open gold crown,
earrings and a glowing star wand. This is a higher-detail real-time character, not a scanned
actor or a claim of film-quality photorealism. The supplied Glinda and premiere
photos informed costume design; those photos are not redistributed.

Build with Blender and the cached assets, or an isolated `bpy` environment:

```sh
uv venv --python 3.11 data/raw/characters/jevica-build
uv pip install --python data/raw/characters/jevica-build/bin/python bpy==4.5.3
BLENDER_USER_RESOURCES="$PWD/data/raw/characters/blender-user" \
  data/raw/characters/jevica-build/bin/python scripts/build_jevica.py
```

**Jevica is the only playable character** and flies in a bubble. The Witch and
Alien player costumes, portraits, broom and personal UFO are retired. Procedural costume and
anatomy additions belong to the player instances. Residents, shoppers and staff
use the six original human rigs with their skin, hair and eyes intact. See
[character forms](../../../../docs/character-forms.md) and
[world direction](../../../../docs/world-direction.md).

Workers use the rigs' actual arm and finger joints for palm-up support poses.
Tablet users support the device with one hand and tap with the other index finger,
with the fingertip contact fitted to the skinned pad and the remaining fingers curled.
Hands angle inward with the forearms, and surface fitting accounts for skinned
pads rather than putting the wrist or palm bone on the load. These runtime poses
do not change the GLB meshes, textures, bind skeletons or source receipts.
`e2e/fixtures/jevica.html?resident=local-04&rig=1` renders a human resident on a
given shared rig for inspection.
The `*-portrait.png` files are actual renderer captures of these models, made
with `e2e/fixtures/jevica.html?form=<id>` at 288 × 352 and
`window.jevicaFixture.render('portrait')`.
Use `e2e/player-forms.js` with the repository's Playwright browser runner to
check the sole player identity, camera mode, flight, responsive controls and portrait.

## Eyelid animation

All seven GLBs include `eyeBlinkLeft` and `eyeBlinkRight` sparse morph targets
from Mika Suominen's CC0 [MakeHuman Faceunits 01](https://static.makehumancommunity.org/assets/assetpacks/faceunits01.html).
The source archive SHA-256 is
`d113107bd7eb59f3af4df6fc0ec29bfcc593f496d0b336aec14f086a80ce7146`.
Both receipts record the source, current asset hashes and neutral asset hashes.
Neutral geometry, textures, skin bindings and original binary payloads are
preserved. The data adds 1,112,916 bytes across the seven models.

The facial build uses the cached MPFB assets and `bpy==4.5.3`, with one process
per profile. Fetch the pinned pack using the existing asset fetcher above.
Save the pre-morph GLBs under `data/raw/characters/face-original/` before building;
already augmented GLBs are deliberately rejected as merge inputs.

```sh
PYTHONDONTWRITEBYTECODE=1 \
BLENDER_USER_RESOURCES="$PWD/data/raw/characters/blender-user" \
  data/raw/characters/jevica-build/bin/python \
  scripts/build_facial_candidates.py woman-casual
mkdir -p data/raw/characters/face-merged
node scripts/add-facial-targets.mjs \
  data/raw/characters/face-original/woman-casual.glb \
  data/raw/characters/face-candidates/woman-casual.glb \
  data/raw/characters/face-merged/woman-casual.glb
```

Repeat for `man-casual`, `woman-tailored`, `man-tailored`, `woman-daywear`,
`man-workwear` and `jevica`. The candidate builder transfers the eyelid offsets
to affected hair, brows and lashes using their authored fitting mappings. The
merge validates geometric vertices, skin weights and oriented triangle topology
before appending sparse deltas. It tolerates reordered vertices and UV splits,
retaining the original mesh buffers. The default character builders still export
neutral models; run this separate facial step to restore blinking after a rebuild.

Use `preview/e2e/facial-assets.js` with the Playwright runner to compare originals
and merged candidates. It requires both cached directories above. Review the
open/closing/closed portraits before copying merged candidates into this folder
and refreshing the GLB byte sizes and hashes in both source receipts. Runtime
checks live in `preview/e2e/facial-motion.js`; they include lifted workers and
reduced motion. Lip synchronization and broader facial expression remain open.

`preview/src/eye-tracking.js` gives each runtime instance two fitted eye pivots
and an independently owned eye skeleton and geometry copy. The shipped GLBs
remain unchanged. The eye meshes retain their positions, normals, UVs and
materials; only their cloned skin bindings attach to the added pivots. This
allows bounded target tracking and near-target convergence while the head moves.
The original eye skeleton remains owned by the avatar and is disposed with it;
the new eye resources are disposed by the tracking controller. Neutral portraits
remain pixel-identical. `preview/e2e/eye-tracking.js` checks all seven portraits,
and `preview/e2e/eye-contact.js` checks tracking during head and worker motion.

Jevica now receives active conversation targets as well as spell targets.
`preview/src/player-attention.js` resolves the shared encounter position and eye
height, eases standing body turns and yields to manual movement or a mounted
pose. The hero rig receives an explicit conversation context for listening nods.
This runtime behavior leaves the cached character assets unchanged.

## Runtime skeleton ownership

The avatar loader shares one body skeleton across meshes whose cloned bones,
bone order and inverse bind matrices match exactly. `SkeletonUtils.clone`
otherwise produces separate skeletons for each mesh, duplicating animation work
and texture uploads. `preview/src/avatar-skeletons.js` retires those duplicates
once, within the owned avatar clone. Each character keeps independent bones;
the eye controller owns its separate two-bone skeleton. Geometry, material and
mesh bind transforms stay independent. The shipped GLBs are unchanged.

`preview/e2e/avatar-skeletons.js` verifies pixel-identical portraits for all seven
models and measures duplicate/shared/shared/duplicate runs at normal and Retina
density. Results are in `data/reports/browser-avatar-skeletons.json`.

## Speech candidates

Speech variants are bundled separately under `speech/` and load only for a voiced
conversation. The base models in this directory retain their existing appearance
and startup cost. Speech variants add
fifteen CC0 [Visemes 02](https://static.makehumancommunity.org/assets/assetpacks/visemes02.html)
shapes by Mika Suominen and the system pack's `teeth_base` and `tongue01` assets.
The pinned archive is included in `scripts/fetch_character_assets.py`.

Use the facial build environment above, with `--speech` before the profile:

```sh
PYTHONDONTWRITEBYTECODE=1 \
BLENDER_USER_RESOURCES="$PWD/data/raw/characters/blender-user" \
  data/raw/characters/jevica-build/bin/python \
  scripts/build_facial_candidates.py --speech woman-casual
mkdir -p data/raw/characters/speech-merged
node scripts/add-speech-targets.mjs \
  preview/public/assets/characters/woman-casual.glb \
  data/raw/characters/speech-candidates/woman-casual.glb \
  data/raw/characters/speech-merged/woman-casual.glb
```

Repeat for the other six profiles. Existing blink shapes are retained. The speech
merge validates the original geometry and appends only selected morph targets,
oral meshes and their resources. It checks the oral skeleton hierarchy, transforms
and inverse binds; the numerical tolerance is 0.000005 to accommodate observed
Blender float32 export rounding. It rejects duplicate installation, changed rigs
and external oral texture references, and keeps the 12 MiB output limit.

`preview/e2e/speech-shapes.js` renders the isolated outputs through the browser
loader and compares them with the live assets. `speech-shapes-cost.js` measures
the district with the new oral geometry shown and hidden. Results and checksums
are in `data/reports/browser-speech-shapes.json`. The verified merged variants are
copied into `speech/`; update that directory’s source receipt when rebuilding.
Jevica’s variant remains close to the per-character size limit.

`preview/src/speech-avatar.js` binds only the active speaker’s face. It appends
relative mouth targets to cloned geometry, preserves blink controls and uses the
existing body skeleton for teeth and tongue meshes. It restores the original
geometry after a 120 ms release. Inactive oral meshes stay hidden. Pending asset
loads cannot attach a face after a conversation is cancelled or replaced.

`preview/src/speech-track.js` samples phoneme cues against the audio playback
clock, with overlapping anticipation and release windows. Reduced motion retains
this purposeful articulation. Untimed/device speech leaves the mouth neutral.
`preview/e2e/speech-playback.js` covers every rig using a locally generated timed
WAV; `preview/e2e/live-speech.js` covers the district UI and running voice service.

Generate the playback test's recorded line after installing the voice dependencies
and model described in the root README:

```sh
uv run --extra voice python scripts/build_speech_fixture.py
```

This writes the timed WAV and its source receipt to the ignored
`data/raw/speech-voice-checks/` directory. It runs local synthesis once and does not
call an inference service. Playback and live-district results are recorded in
`data/reports/browser-live-speech.json`.

## Prince Jev

`prince-jev.glb` is Prince Jev's hero mesh, built by `scripts/build_prince.py`
with only the MPFB 2.0.17 source (for the base mesh, targets and rig) and the
already-shipped CC0 GLBs. A fresh MPFB body gets young, tall, athletic macros and
jaw, cheekbone, nose and brow detail targets. Because every MPFB body shares one
base-mesh topology, the tailored resident's suit, shoes and short hair, and
Jevica's high-poly eyes, eyebrows and eyelashes, are moved onto him with a
surface-deform driver (donor body as basis, prince body as shape key). The
garments keep their original MakeHuman skin weights. The donor's skin mask hides
skin under the suit, and its blink morphs carry over by base-mesh index.
`prince-jev.sources.json` records the macros, targets, bytes and SHA-256.
Runtime dress-uniform details live in `preview/src/prince-costume.js`.

```sh
git clone --depth 1 --branch v2.0.17 https://github.com/makehumancommunity/mpfb2 \
  data/raw/characters/mpfb-src/mpfb2-2.0.17
data/raw/characters/jevica-build/bin/python scripts/build_prince.py
```
