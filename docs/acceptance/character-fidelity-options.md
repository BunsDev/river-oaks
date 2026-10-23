# Human fidelity routes and integration constraints

Review date: 2026-10-18. Repository baseline: f897c1d6. Supporting work for #517;
not a fixture acceptance or final vendor decision. The implementation owner's
M1/M2 measurements must decide whether the cached asset path meets the requested
realistic-human quality.

## Initial route

Use the cached MPFB/MakeHuman core assets for the first measured fixture. This
avoids a new provider, purchase or download and matches the current Blender/glTF
pipeline. It does not establish that the fixture looks realistic. Reject the
candidate if matched close-up/world evidence cannot demonstrate the objective.

| Route | Verified rights/cost facts | Integration implication and current disposition |
| --- | --- | --- |
| MPFB/MakeHuman core assets | Core assets are CC0; tool code has separate GPL/AGPL licensing. No asset license fee. Community additions still require their own provenance review. [Official license](https://static.makehumancommunity.org/about/license.html) | Existing pipeline uses MPFB exports and pinned GLBs. Preferred first fixture; preserve per-input provenance and generated hashes. Do not vendor tool code as asset data. |
| MetaHuman / Unreal | Epic's EULA distinguishes non-engine asset files from engine products, including use of qualifying files in other engines; separate asset agreements can impose restrictions. Seat exemptions and royalty rules depend on use and revenue. [EULA §§3–6](https://www.unrealengine.com/eula/unreal), [MetaHuman license](https://www.metahuman.com/license) | Not categorically Unreal-only. No selected asset or redistribution permission has been established for this repository. No account/license acceptance or download performed. Export and material/rig adaptation need proof before selection. |
| MetaHuman export / Devkit | Official export tool supports external DCC workflows; Devkit describes external-platform rig evaluation. [Export tool](https://dev.epicgames.com/documentation/metahuman/metahuman-creator-export-tool-in-unreal-engine), [Devkit](https://www.metahuman.com/devkit) | External export does not prove drop-in Three.js fidelity, browser performance or matching expressions. Do not assume Unreal skin/hair shaders or RigLogic become working glTF materials/morphs. No conversion measured. |
| Unity HDRP / licensed asset workflow | HDRP 17 lists desktop/consoles with compute shaders and excludes OpenGL/OpenGL ES; it is not a listed browser/iOS renderer. Asset rights depend on the selected asset and applicable Asset Store terms. [HDRP requirements](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/System-Requirements.html), [Asset Store terms](https://unity.com/legal/as-terms) | A different renderer and asset pipeline, not a small extension of current Three.js. No asset selected, no price quoted, no port measured. Engine migration requires a separate decision. |
| Remote Unreal rendering / Pixel Streaming | Epic describes server-side rendering, encoded media delivery and signalling infrastructure. [Official overview](https://dev.epicgames.com/documentation/unreal-engine/overview-of-pixel-streaming-in-unreal-engine) | GPU hosting, latency, bandwidth and session capacity require a measured deployment design and actual provider quote. No paid service invoked. Does not satisfy local WebGL fidelity by itself. |
| Offline hero render | A reference/capture path, not the interactive runtime | Useful for matched material/shape comparison. Cannot count as real-time, crowd or phone acceptance. |

No numeric vendor quote is asserted without a selected product, license scope,
region and usage. Current implementation spend remains zero. This matrix does
not certify unrestricted redistribution of proprietary source assets.

## Concrete downstream constraints

Inspected source at f897c1d6:

- `preview/src/character-definition.js`: strict canonical v1/v2 definitions;
  parameters are empty, attachments are empty and assets are pinned. A realistic
  fixture is not publishable merely because its loader renders it. Any extension
  needs browser/server validation and legacy-read tests before #441 exposes it.
- `preview/src/character-assets.js`: current pins are jevica, man-casual and
  man-tailored. Preserve them; add a distinct reviewed pin for the new fixture.
- `preview/src/avatars.js`: transparent imported materials are converted to
  alpha-test 0.4, depth-write and double-sided rendering. Check eye/cornea/hair
  semantics on the real new asset before reusing this conversion unchanged.
- Avatar instantiation clones materials and owns disposal of skeletons and
  selected geometries. Prove texture/material sharing and disposal boundaries
  before adding normal/roughness maps or tier replacement.
- Resident face processing can strip idle face morphs. Preserve player expression
  bindings and explicitly distinguish resident baking from editable expressions.
- Unreal's project declares engine association 5.8. Its existence does not prove
  a character path integrated with the browser application.

Required fixture handoff to #441: immutable asset/version and provenance;
capability allowlist derived from the asset; rig/morph/material bindings;
permission-preserving canonical identity; measured tiers; preview/world/portrait
consistency; recovery/disposal behavior. This is a checklist for the working
contract, not a proposed schema or permission to add unsupported controls.

Unity Asset Store §2.2 permits distribution embedded in a qualifying product;
that is not permission to place raw purchased assets in a public repository.
Its UGC monetization limitation also needs review for a character-creation product.
No Unity asset is selected or acquired here.

`server/character-store.js` imports the shared definition validator for writes
and migration for stored reads. Keep the new fixture contract authoritative at
that boundary; a preview-only acceptance test cannot establish publication safety.

## Fixture decision for the #517 implementation

The implementation uses the cached CC0 route for Morgan and Imani. Both export
as separately pinned GLBs below the existing 12 MiB asset limit, use the existing
53-joint game rig, and expose tested blink, speech, and expression targets.
No provider, paid service, or new asset download was used in this implementation.
The existing Jevica pin remains unchanged.

The measured fixture adds regional roughness, pore normals, a skin-wrap
approximation, corrected irises, corneas, and strand-preserving recoloring in
Three.js. It retains alpha-card hair and fixed wardrobe bundles. Those limits
remain visible in the rendered evidence; the implementation doesn't establish
AAA quality or a physical-device budget. Current measurements and remaining
gates are recorded in the [implementation ledger](../superpowers/plans/2026-10-18-character-fidelity-517.md).

MetaHuman, a Unity renderer migration, and remote rendering remain unselected.
No selected proprietary asset has a verified redistribution contract or measured
conversion for this browser pipeline. No numeric vendor quote is inferred from
an engine's general licensing page. Revisit those alternatives only against the
specific visual or performance gaps the implemented fixture still demonstrates.
