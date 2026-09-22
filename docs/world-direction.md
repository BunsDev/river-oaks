# Intentional creative direction: a fantastic district with human residents

River Oaks is now an inhabited science-fantasy district. This is an intentional
product direction, requested on September 21, 2026. The latest direction keeps residents human, with varied fashion inspired by
the three playable characters. The mapped Houston setting remains the spatial foundation;
its inhabitants, magic, species and character reactions are authored fiction.

## Realism is the rendering and movement standard

The fantastic setting should feel physically present: coherent anatomy, detailed
skin and eyes, believable cloth and metal, grounded feet, acceleration, weight,
attention and collision. Resident variation comes from the human rigs, clothing silhouettes and fashion
palettes. The playable forms have distinct silhouettes and accessories. Photorealism and hyper-realistic motion remain
quality targets that require visual evidence; passing unit tests is insufficient.

The browser population uses six clothed human rigs with their original faces,
skin textures, eyes and hairstyles. Deterministic fashion palettes vary silk
rose, midnight velvet, stellar tailoring, botanical linen, gallery colors and
pearl classics. Boutique staff retain their uniforms with restrained accents;
guests wear the fuller palettes. Residents have no alien head replacements or
Oz hats. Indoor staff retain occupations, shop identity, seated/work poses and
duties. Mannequins are displays, not conversation targets. The Grey anatomy is
exclusive to the playable Alien form.

## Player and flight

The player begins as **Jevica**, a fictional celebrated magical visitor with a
Glinda-inspired pink gown, blonde hair, filigree crown and crystal starburst wand. The character name is
Jevica throughout the experience. There is no ordinary-human player option.
The other transformations are a scary witch and a Grey alien.
See [character forms](character-forms.md) for the latest statue references,
rendering decisions and verification entry points.

- Jevica flies in an iridescent bubble.
- The witch carries a bristled broom and rides it in flight.
- The alien travels in a small illuminated UFO.
- Third person is the default; **V** switches the camera.
- **B** takes off or lands, **Space** rises and **C** lowers altitude.
- WASD moves, arrows turn, dragging orbits the camera, and Shift moves faster.
- The character panel provides camera, transformation and flight buttons.
- Flight starts outdoors, stays within district bounds and observes conservative
  building clearance. Landing requires clear ground. Changing storefronts returns
  the character to ground level.

Nearby characters briefly attend, gesture and speak authored recognition lines.
Jevica receives starstruck greetings. Reactions observe room boundaries and
line-of-sight checks, expire, and have a cooldown. They do not rewrite identities,
needs or jobs. Storm response and active volunteer visits retain priority.

## Streets and planting

Retain the existing street, building, tree-stem and planter layout. The vegetation
pass uses detailed local tree meshes and PBR materials for fuller mature crowns,
with clipped shrubs and ornamental grasses in the existing rectangular planters.
See [vegetation provenance](vegetation.md) for actual asset sources and the
separation between measured data and artistic foliage.

Designated pale stone sidewalk bands follow the existing vehicular streets.
Zebra crossings identify permitted road crossings. Resident routing prefers
sidewalks and existing footways, allows plaza connections and avoids unmarked
road travel. People and public stops initially positioned in carriageways move
to nearby clear sidewalks. Short connectors still allow a visitor already in a
road to leave it; this is not permission to route through the road as a shortcut.
Indoor work positions and architecture retain their existing locations.

## Scope and evidence

These features currently target `preview/`, the Three.js browser district. They
are not proof of equivalent Unreal behavior. Native residents, skeletal backend
acceptance, job routines, crowd interactions and performance remain part of the
broader end-to-end work. Preserve source provenance, existing worker roles and
encounter access as the visual direction evolves.

Validation combines navigation/flight invariants, actual rig and geometry checks,
rendered close-ups, walking and flying browser interactions, indoor encounters,
reactions, reloads and reduced-motion behavior. Keep proof gaps explicit in
[the people progress record](people-interaction-progress.md).
