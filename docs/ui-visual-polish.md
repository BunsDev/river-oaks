# District interface finish

Keep the street as the main experience. The HUD is a Map panel (top left), a
People panel (top right) and a Settings dialog (it was a People / Places / Scene
rail when this was written). Apply a tactile finish to the existing interface: warm ivory
glass, graphite text, fine edge highlights, and restrained layered shadows.
People remain green and scene controls amber. Places now use the HUD action teal,
with five category colours on destination rows (`places-guide.css`), and rose
survives only on the map's summary and focus rings. Labels and outlines also
communicate selection. Editorial serif headings contrast with compact
system sans-serif controls. Use 4 px spacing increments and 44 px primary targets.

In play, the Explore rail, Play dock, walking console and their triggers share one
material from `preview/src/hud-glass.css`, imported just before `game-hud.css`.
The panels, launchers and the Places atlas all use the same HUD tokens. Each surface
is a single translucent sheet with borderless tiles inside, so nested controls never
blur again. Shortcuts appear as keycaps. Reduced transparency, or no backdrop blur,
makes the glass near opaque. Touch keeps 44 px targets and hides keycaps.

- [x] Inspect the live interface and preserve concurrent character work.
- [ ] Unify rail, conversation, character, and visit controls.
- [ ] Inspect desktop/mobile and light/dark states; check keyboard and overflow.
- [ ] Run the build and existing preview tests.

Scope is interface finish, not a claim of a photorealistic reconstruction of the
district. No reference image was supplied for an exact visual match.
