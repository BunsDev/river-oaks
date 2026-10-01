# Intentional creative direction: a retrofuturistic garden district

River Oaks is now an inhabited retrofuturistic garden district. This is an intentional
product direction, requested on September 21, 2026. The latest direction keeps residents human, with varied romantic, gothic and futuristic fashion. The mapped Houston setting remains the spatial foundation;
its inhabitants, magic, species and character reactions are authored fiction.

## Realism is the rendering and movement standard

The fantastic setting should feel physically present: coherent anatomy, detailed
skin and eyes, believable cloth and metal, grounded feet, acceleration, weight,
attention and collision. Resident variation comes from the human rigs, clothing silhouettes and fashion
palettes. Jevica has a dedicated silhouette and accessories. Photorealism and hyper-realistic motion remain
quality targets that require visual evidence; passing unit tests is insufficient.

The browser population uses six clothed human rigs with their original faces,
skin textures, eyes and hairstyles. Deterministic fashion palettes vary silk
rose, midnight velvet, stellar tailoring, botanical linen, gallery colors and
pearl classics. Boutique staff retain their uniforms with restrained accents;
guests wear the fuller palettes. Residents have no alien head replacements or
Oz hats. Indoor staff retain occupations, shop identity, seated/work poses and
duties. Mannequins are displays, not conversation targets. Alien anatomy is used only by enemies in the separate invasion scenario.

## Player and flight

Standalone play centers **Jevica**, a fictional celebrated magical visitor with a
Glinda-inspired pink gown, blonde hair, gold filigree crown and luminous star wand. The character name is
Jevica in her authored story. Shared-town players use their account names and select from 11 looks built on seven shipped rigs, including human, fox, wolf, lynx, and hybrid styles. The Witch and Alien player forms, their
portraits, the broom, and the personal UFO were retired on September 23, 2026.
See [character forms](character-forms.md) for the latest visual reference,
rendering decisions and verification entry points.

- Jevica flies in an iridescent bubble.
- Third person is the default; **V** switches the camera.
- **B** takes off or lands, **Space** rises and **C** lowers altitude.
- WASD moves, arrows turn, dragging orbits the camera, and Shift moves faster.
- The character panel provides camera and flight buttons.
- Flight starts outdoors, stays within district bounds and observes conservative
  building clearance. Landing requires clear ground. Changing storefronts returns
  the character to ground level.

Nearby characters briefly attend, gesture and speak authored recognition lines.
Jevica receives starstruck greetings. Reactions observe room boundaries and
line-of-sight checks, expire, and have a cooldown. They do not rewrite identities,
needs or jobs. Storm response and active volunteer visits retain priority.

## Retrofuturistic environment, September 23, 2026

The space-age direction is intentional: ivory ceramic surfaces, teal glass and
enamel, champagne brass, rose and mint accents, terrazzo interiors, rounded
cantilever canopies, orbital streetlamps and rooftop antenna domes. Continuous
fascia bands carry the palette across facades without named storefronts. The
interface uses the same colors and rounded forms. These are authored visual
interpretations, not evidence of historical or surveyed Houston architecture.

Houston street centerlines, buildings and store entrances stay in place. Human
residents and existing worker roles remain the population standard. Jev chauffeurs
Jevica in a pink six-wheel glass-canopy car or a rose motorcycle, with fitted seats,
gold spinners and restrained jewel glints; see [character controls](character-forms.md).

## Streets and planting

Retain the Houston street and building layout. Vehicle streets widen to 8.4 m
with two clear lanes; interpreted stems in the road clearance are removed. Street furniture follows
the shared sidewalk profile, with planters aligned along the furnishing strip. The vegetation
pass uses detailed local tree meshes and PBR materials for fuller mature crowns,
with clipped shrubs and ornamental grasses in the existing rectangular planters.
See [vegetation provenance](vegetation.md) for actual asset sources and the
separation between measured data and artistic foliage.

Palo Alto-derived curb, gutter, sidewalk and ramp dimensions follow the existing
Houston streets. See [street standards](street-standards.md) for source drawings,
metric dimensions and retained terrain/right-of-way constraints.
Zebra crossings identify permitted road crossings. Resident routing prefers
sidewalks and existing footways, allows plaza connections and avoids unmarked
road travel. People and public stops initially positioned in carriageways move
to nearby clear sidewalks. Short connectors still allow a visitor already in a
road to leave it; this is not permission to route through the road as a shortcut.
Indoor work positions and architecture retain their existing locations.

Browser outdoor ground queries use the rendered terrain, road, sidewalk and kerb
triangles. Jevica, resident foot placement, vehicle tyres, tree stems and street
fixtures use those support heights. Room floors retain their own authoritative
height. The terrain sampler is a rendering contact correction, not a relocation
of the district or a replacement for native collision acceptance.

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
