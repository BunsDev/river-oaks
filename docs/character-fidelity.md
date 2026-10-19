# Realistic human fixtures

Use the pinned human bundles and the shared validator for Studio, publication,
and world rendering. The executable capability contract is
`preview/src/character-fidelity-contract.js`.

```js
import {characterDefinitionFor, validateCharacterDefinition} from './preview/src/character-definition.js';
import {characterFidelityContract} from './preview/src/character-fidelity-contract.js';

const definition = characterDefinitionFor('fixture-owner', 'morgan-human');
const result = validateCharacterDefinition(definition, {ownerId:'fixture-owner'});
if (!result.ok) throw new Error(result.error);
const capabilities = characterFidelityContract(result.definition.rig);
console.log(capabilities.asset.sha256, capabilities.expressions);
```

You can inspect capabilities before exposing a control. Definitions still use
canonical v1/v2 fields. Unknown asset hashes, arbitrary URLs, body parameters,
clothing replacements, and foreign owners fail validation. Expressions are
transient runtime poses; they don't add unvalidated fields to stored definitions.

## Bundles and sources

| Appearance | Rig | Body and wardrobe |
| --- | --- | --- |
| Morgan | `man-realistic-casual` | Male body, casual shirt/trousers, short hair |
| Imani | `woman-realistic-tailored` | Female body, tailored suit, bob haircut |

Both bundles use the MakeHuman game rig with 53 joints, fitted brows and lashes,
high-poly eyes, two blink targets, 15 visemes, and three expression targets.
`realistic-human-assets.test.js` checks these against the exported bytes and
requires every exported morph weight to start at zero. These are distinct fixed
body and wardrobe bundles. Independent clothing fitting and body editing aren't
supported. Each bundle has a fixed target height (`targetHeightM`: Morgan 1.78 m,
Imani 1.66 m), independent of the legacy NPC index used by Studio, player, peer,
or crowd callers. Measured posed bounds remain separate from that scale target.

The files are CC0 derivatives of the existing cached MakeHuman assets, built
with MPFB 2.0.17. No new asset pack or paid service was acquired. The receipt at
`preview/public/assets/characters/realistic-humans.sources.json` records asset,
expression, transitive material/texture, generator dependency, MPFB code/data,
Blender binary, and output hashes. MPFB tool code isn't shipped as asset data. The [vendor review and fixture decision](acceptance/character-fidelity-options.md) reuse the official-source review from [PR #536](https://github.com/BunsDev/river-oaks/pull/536).

Existing Jevica and other canonical GLB bytes and pins are retained. The new
bundles don't replace her authored identity.

## Runtime ownership

`loadResidentAvatar` creates the instance's fidelity controller and expression
bindings. `createCharacterHero` uses the same material layer on a fresh neutral
rig. The diagnostic harness can explicitly disable realism for matched captures.

The material layer adds regional roughness, procedural pore normals, a diffuse
skin-wrap approximation, natural brown irises, a separate specular cornea, and
strand-preserving hair recoloring. The wrap approximation isn't a measured
subsurface scattering model. Hair uses alpha cards; it has no strand simulation.
The rig has no facial bones or cloth simulation.

Call `avatar.setExpression('smile', 0.65)` or
`avatar.setExpression('browRaise', 0.65)` for bounded expression weights. Use
`neutral` to clear those targets. Blink and speech bindings keep their existing
owners. The 15 exported viseme targets are available for a future native binding;
`speechRuntime:false` means the current donor-based speech loader is not integrated
for these two bundles. Unsupported expression names or weights outside `[0, 1]` fail.

The production tiers are `low`, `standard`, and `high`. Each retains the same
asset, natural iris color, corneal shell, and hair coverage. `low` omits pore
normals and the skin-wrap shader. Diagnostic `off` restores the imported asset
materials and is used only for controlled before/after comparisons.

The existing graphics governor publishes effective quality through
`character-quality.js`. New human avatars subscribe, and remove their
subscriptions on disposal. Quality changes restore the previous instance's
materials and geometry before applying the next layer. Late map responses can't
override a newer request or mutate a disposed avatar. Missing roughness maps
produce an explicit fallback report.

Generated iris and recolored strand maps belong to one effect. The pore map and
regional roughness map are bounded shared caches. Dispose an effect before
reapplying authored material customization. Avatar disposal performs this order
for its owned layer. Portrait capture releases renderer-owned transmission
targets after each camera, including failed readback.

## Reproduce the evidence

```sh
node scripts/character-fidelity-baseline.mjs \
  --appearances morgan-human,imani-human \
  --realism off,low,standard,high --expressions --quality-cycles \
  --repeats 0 --out .runtime/character-fidelity/local-fixtures
pnpm run test:experience character-fidelity character-studio
```

The first command captures native 4K full-body, close-up, smile, and brow-raise
views with fixed camera, lighting, and pose. It checks repeated viewport,
two-camera portrait, and quality-transition resource counts. The quality test
feeds synthetic 40 ms intervals into the real governor to test transitions;
those inputs aren't performance measurements. `--repeats 0` omits timing and
reports timing agreement as unmeasured.

Run without `--repeats 0` for cold loading, frame p50/p95, GPU timing where
available, and crowd samples. Keep load averages with those results. A shared
host with competing CPU/GPU work doesn't establish a device budget. Source and
asset inputs must remain unchanged during the run; each receipt contains their
SHA256 manifest, including untracked inputs.

## Acceptance still required

Track current results and exact revisions in the [#517 ledger](superpowers/plans/2026-10-18-character-fidelity-517.md).
Screenshots don't establish AAA quality. Current hair silhouettes, fine eye
detail, and wardrobe texture quality still need visual review against the goal.
Material tiers share the same geometry; geometric LOD isn't implemented.

Desktop Chromium fixtures don't prove Safari, iOS, physical-device, native,
live-auth, or human acceptance. No supported mobile target or device budget has been established.
The existing #441 P4/P5 novice trials were waived by Val and remain waived,
rather than passed. Keep prior human results intact.
