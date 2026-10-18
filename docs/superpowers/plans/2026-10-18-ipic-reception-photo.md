# IPIC reception from IMG_9738 (photo review P3, P4, P6)

- **Task:** `ipic-reception-photo` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-reception-photo-20261018` in `../river-oaks-ipic-reception`, from main
  `c17f9f1c`.
- **Decision:** Val chose all four remaining photo areas on 2026-10-18; reception is the first.

## Change (`ipic-interior.js`, `ipic-materials.js`, `ipic-plan.js`)

- **P3:** the marble desk steps down to a 0.76 m counter at its west end, inside its old footprint and collider.
  A west ledge, as in the photo, would narrow the 1.7 m route from the door to the right escalator.
- **P4:**
  - close light-oak flutes with a lit cove;
  - they start at a = 2.45, east of the right lane;
  - the sign moves east with them, so neither hangs over the lane's entrance (a recorded art defect; its two
    agreement allowances are removed);
  - the backing is now a collider (`ipic-reception-backing`), so bodies stop short of it.
- **P6:**
  - a mid-beige matt stone with quiet joints;
  - a coffered ceiling (a dropped perimeter band with a cove light);
  - a lower linear pendant of horizontal lamps over the desk.

## How the floor colour was settled

1. The first stone (`#d3c5ad`) read near-white in-world.
2. I guessed the district's street paving was winning a depth tie and lifted the floor 4 mm. An in-world
   `pickAt` showed the visible floor was already this stone, so that guess was wrong. Those two commits were
   folded away before the branch was pushed.
3. The cause is lighting. The lobby's downlights, cove and pendant wash a light stone out in-world; the
   standalone export is lit more softly.
4. A mid-beige matt stone now measures (174, 160, 142) in-world against the photo's (167–181, 136–150,
   113–128).

## Checks

| Check | Result |
| --- | --- |
| New tests, written first (desk levels; flute material, extent and cove; floor; coffer; pendant) | Failed first. With the two allowances removed, the walkable-space test failed too, which led to the backing collider. All pass now. |
| `node --test preview/tests/ipic-*.test.js server/tests/ipic*.test.js scripts/tests/office-ipic-contract.test.js` | 70 pass, 1 Redis skip; review data current |
| Exports and `ipic-photo-views.mjs` (Metal) | Passed; T1 matches IMG_9738's sign, flutes, cove and floor tone |
| `node preview/e2e/ipic-runner.mjs` | Passed 8 checks |
| `pnpm run verify` | Passed: agent 116, preview 3396, server 753 with Redis skips, 76/76 |
