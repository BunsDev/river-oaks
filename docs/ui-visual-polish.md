# District interface finish

Keep the street as the main experience and the rail organized into People,
Places, and Scene. Apply a tactile finish to the existing interface: warm ivory
glass, graphite text, fine edge highlights, and restrained layered shadows.
People remain green, places rose, and scene controls amber; labels and outlines
also communicate selection. Editorial serif headings contrast with compact
system sans-serif controls. Use 4 px spacing increments and 44 px primary targets.

In play, the Explore rail, Play dock, walking console and their triggers share one
material from `preview/src/hud-glass.css`, which `main.js` imports last. Each surface
is a single translucent sheet with borderless tiles inside, so nested controls never
blur again. Shortcuts appear as keycaps. Reduced transparency, or no backdrop blur,
makes the glass near opaque. Touch keeps 44 px targets and hides keycaps.

- [x] Inspect the live interface and preserve concurrent character work.
- [ ] Unify rail, conversation, character, and visit controls.
- [ ] Inspect desktop/mobile and light/dark states; check keyboard and overflow.
- [ ] Run the build and existing preview tests.

Scope is interface finish, not a claim of a photorealistic reconstruction of the
district. No reference image was supplied for an exact visual match.
