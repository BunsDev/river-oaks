# Browser client

Read `docs/world-direction.md` and the relevant feature doc before changing world
behavior. `src/` uses plain JavaScript ESM, Three.js, and CSS; match nearby modules.

- Keep render-loop work bounded. Route searches belong in the existing workers;
  fence results by scene/tick/generation and dispose GPU/audio resources on teardown.
- Shared state is server-authoritative. Do not make client-only changes to shared
  commands, movement contracts, account appearance or permissions.
- Preserve existing input, focus recovery, reduced motion and responsive behavior.
  Browser automation is not human accessibility acceptance.
- Inspect `tests/` for the matching risk. Run `npm test` and `npm run build` from
  the root; use `npm run test:experience -- <journey>` for browser changes and
  `npm run test:shared` for shared changes. Runners own their fixture servers.
- Public assets need provenance and license receipts. Do not regenerate or
  download models/textures just to satisfy a source-only change.

See `docs/testing.md`, `docs/browser-worker-roles.md`, and root AGENTS.md.
