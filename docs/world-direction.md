<<<<<<< Updated upstream
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
=======
# Creative direction: human residents, magical visitors

River Oaks is an inhabited district with human pedestrians, shoppers and workers.
This supersedes the earlier alien-population direction at the user's request.
The mapped Houston setting remains the spatial foundation; its character
identities, magic and reactions are authored fiction. Alien anatomy remains available for the optional invasion scenario.

## Realism is the rendering and movement standard

People should feel physically present: detailed skin and eyes, believable cloth,
grounded feet, acceleration, weight, attention and collision. Photorealism and
hyper-realistic motion remain quality targets that require visual evidence;
passing unit tests is insufficient.

The browser population uses six clothed CC0 human rigs with their original skin,
hair, eyes and head geometry. Indoor staff retain their occupations, shop,
conversation identity, seated/work poses and duties. Mannequins remain human-shaped
displays, not conversation targets. Population changes preserve the existing
layout, sidewalk routing and encounter access.
>>>>>>> Stashed changes

## Player and flight

The player begins as **Jevica**, a fictional celebrated magical visitor with a
Glinda-inspired pink gown, blonde hair, filigree crown and crystal starburst wand. The character name is
<<<<<<< Updated upstream
Jevica throughout the experience. There is no ordinary-human player option.
The other transformations are a scary witch and a Grey alien.
=======
Jevica throughout the experience. Jevica is the only playable character. The witch and alien transformations are no longer offered.
>>>>>>> Stashed changes
See [character forms](character-forms.md) for the latest statue references,
rendering decisions and verification entry points.

- Jevica flies in an iridescent bubble.
<<<<<<< Updated upstream
- The witch carries a bristled broom and rides it in flight.
- The alien travels in a small illuminated UFO.
- Third person is the default; **V** switches the camera.
- **B** takes off or lands, **Space** rises and **C** lowers altitude.
- WASD moves, arrows turn, dragging orbits the camera, and Shift moves faster.
- The character panel provides camera, transformation and flight buttons.
=======
- Third person is the default; **V** switches the camera.
- **B** takes off or lands, **Space** rises and **C** lowers altitude.
- WASD moves, arrows turn, dragging orbits the camera, and Shift moves faster.
- The character panel provides camera and flight buttons.
>>>>>>> Stashed changes
- Flight starts outdoors, stays within district bounds and observes conservative
  building clearance. Landing requires clear ground. Changing storefronts returns
  the character to ground level.

Nearby characters briefly attend, gesture and speak authored recognition lines.
Jevica receives starstruck greetings. Reactions observe room boundaries and
line-of-sight checks, expire, and have a cooldown. They do not rewrite identities,
needs or jobs. Storm response and active volunteer visits retain priority.

<<<<<<< Updated upstream
=======
## Wishes and consequences

Jevica grants one active wish per resident through their conversation card.
The five gifts are a dragon egg, flight without landing, invisibility that leaves
clothes visible, unwanted mind reading, and a dog transformation with an allergy.
The gift turns troublesome after 8–12 seconds of visible game time. The resident
asks for its removal after 20–28 seconds. Wishes continue while the support
scenario is paused; changing or resetting that scenario doesn't remove them.
Reloading the world starts a fresh set of wishes.

Incidents interrupt nearby residents in the same room or outdoor space. Workers
pause their tasks, walkers stop, and the People panel tracks active incidents.
Undoing a wish restores the resident and clears its disruption. Other active
incidents remain. Jevica can undo a wish before its catch appears, too.

>>>>>>> Stashed changes
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
