# Character hero render references

These are native 3840 × 2160 PNGs of the two supported customizable forms, with
the rose outfit and espresso hair. They capture the current authored rendering;
they are not approval of the final art quality or a physical-device release gate.
The manifest records the visual review and its limitations.

Run from the repository root:

```sh
node scripts/character-hero-goldens.mjs --check preview/e2e/goldens/character-hero
```

The check launches the exact hashed Chromium executable, compares the OS, GPU,
browser, Three.js and color-pipeline pins, renders through the production native
portrait path, then compares decoded RGBA8 pixels. Missing unmasked GPU identity
or a different environment exits 2 as incompatible. An image/integrity failure
exits 1. Neither case is a pass. Reports and current captures go to a new directory
under `.runtime/character-studio/hero-goldens/`; references are never overwritten.

Three captures of each form had zero pixel differences. The fixed limits allow
maximum channel error 2/255, mean channel error 0.01/255 and at most 0.1% changed
pixels. All three must pass. The maximum prevents a small missing attachment from
being hidden by the large background's contribution to the mean. These limits
are deliberately local to the pinned renderer, not cross-GPU equality promises.

To propose a new reference, use a fresh directory:

```sh
node scripts/character-hero-goldens.mjs --record .runtime/character-studio/hero-candidate
```

Recording makes three fresh captures per form and requires stable repeats. It
creates a `candidate` manifest, which the check rejects. Inspect the native images,
source changes and provenance, record the review scope and limitations, then
deliberately copy the two PNGs and manifest here with
`kind: "reviewed-render-reference"` and a `review` object containing nonempty
`scope` and `limitations`. Run the check again and include the image changes in
review. Do not widen limits or replace references merely to turn a failure green.

The manifest hashes the 60 transitive local sources, fixture, locked dependencies,
base rig and its source/license receipt. PNG hashes protect the reviewed bytes.
This covers neutral human/fox portraits only; animation, other wardrobe/attachment
combinations, performance, native apps, live auth and human acceptance remain
separate checks. The original Studio download journey is
`pnpm run test:experience character-portrait`.
