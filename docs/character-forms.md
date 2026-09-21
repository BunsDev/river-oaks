# Playable character forms

The district offers exactly **Alien, Witch and Jevica**. Jevica is selected on
load. Residents are humans with six coordinated fashion palettes, as described in
[world direction](world-direction.md). Grey anatomy belongs only to the playable
Alien. Human skin, hair, eyes and facial geometry stay intact.

## Reference direction

The September 21, 2026 reference pass uses the supplied Iron Studios statues for
silhouette, dress construction and accessories, while retaining the existing
adult proportions and animated rigs:

- [Jevica reference](https://ironstudios.com/cdn/shop/files/White_c72006e2-f08a-4016-a43e-5e28e9ed2e84_1024x1024.jpg?v=1763573772):
  layered rose silk, curled scalloped hems, open silver filigree, blonde hair and
  a crystal starburst wand. Her resting arms clear the gown.
- [Witch reference](https://ironstudios.com/cdn/shop/files/04-Details_Grey_12d30dc2-6597-4189-9081-5d1fbf792a4b_1024x1024.jpg?v=1763573744):
  green skin, a dark ribbed crooked hat, long dark hair, a folded cloak and broom.
  The hat uses the actual rig's measured skull to place its brim and crown.
- [Grey reference](https://ironstudios.com/cdn/shop/files/white.low.clean_9d93dc91-19d3-454d-bf07-1d80493eb747_1024x1024.jpg?v=1757360629):
  a bald tapered cranium, dark almond eyes and a black suit. The alien face is a
  continuous surface with integrated relief; the original human head triangles
  and eyes are hidden on the alien instance so faces do not overlap.

The references are visual inputs, not shipped textures or purchased statue
meshes. The existing local character assets retain their source receipts.
Costumes and alien anatomy are procedural geometry. Photoreal skin, facial
animation and physically simulated cloth remain quality targets, not claims
established by this pass.

## Controls and rendering

Third person is the default. **V** switches cameras. **B** takes off or lands,
**Space** rises and **C** lowers altitude. Jevica flies in a bubble, the witch
rides a broom and the Alien flies in a UFO. Character controls also expose these
actions, with a collapsed mobile panel and portraits of the actual models.

Accessories following the same bone are batched by material. In the same studio
fixture, Jevica dropped from 175 to 41 render calls and the witch from 101 to 21,
including the fixture's passes. These are fixture measurements, not district FPS.
Alien anatomy and filtered head geometry use shared caches; per-person
identities, skeletons and material instances remain independent.

## Verification entry points

- `npm test`: navigation, flight, head replacement, source isolation, costume
  transforms and resource ownership.
- `npm run build`: production bundle.
- `preview/e2e/player-forms.js`: the exact three forms, real portrait loading,
  takeoff, measured ascent, landing, camera toggles and mobile keyboard controls.
- `preview/e2e/character-portraits.js`: regenerate the three local PNG portraits
  from `/e2e/fixtures/jevica.html` using the Playwright CLI.
- `preview/e2e/store-encounters.js`: same-room conversations across all stores.
- `preview/e2e/grounded-motion.js`: foot contact on the six actual resident rigs.

Browser artifacts go to `output/playwright/`. Native Unreal behavior and target
hardware performance require separate acceptance; see the remaining work in
[people interaction progress](people-interaction-progress.md).
