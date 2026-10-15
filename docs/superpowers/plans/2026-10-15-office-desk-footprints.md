# #362 R19: the kit's measured desk footprints

- **Task:** `office-desk-footprints-362` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/office-desk-footprints-362-20261015` in `../river-oaks-office-desk-footprints`,
  on #403 (`feat/office-kit-fit-362-20261015`) with #400's current head merged in.
- **Decision:** Val, 2026-10-15, asked directly in session river-oaks-39: "Import footprints". That covers
  the measured desk footprints and colliders only, as numbers, with no art and no kit bytes.
- **Source:** `~/Downloads/jevica-office-kit/layout.json`, SHA-256 `ccd7e275…`. The values below come
  from `node scripts/office-kit-fit.mjs ~/Downloads/jevica-office-kit` (#403), which passes 5/5 desks
  and 12/12 routes.

| Collider | x | d | Height | Stations |
| --- | --- | --- | --- | --- |
| `executive-desk` | −5 to −1 | 7.2 to 8.8 | 0.76 | desk-executive |
| `bench-a` | 2.4 to 7.6 | 6.4 to 7.6 | 0.76 | desk-a1, desk-a2 |
| `bench-b` | 2.4 to 7.6 | 11.4 to 12.6 | 0.76 | desk-b1, desk-b2 |

## Change

- `preview/src/office-layouts.js` adds the three as `kind: 'desk'` obstacles on the penthouse main floor.
  The server and the client both collide with them.
- `preview/src/office-penthouse-graybox.js` draws them as one instanced draw, each instance zoned
  `obstacle:<id>`. The glazed graybox draws 59 meshes, inside #405's budget of 60.
- Docs: `docs/offices.md`, and the R19 row in `docs/design/office-ipic/review-matrix.md`.

## Checks

| Check | Result |
| --- | --- |
| Red first: the plan and fit tests before the import | 2 failed: no desk obstacles |
| `node --test preview/tests/office-layouts.test.js scripts/tests/office-kit-fit.test.js` | 13/13 |
| Red first: the instanced-desk graybox test | failed: no `desks` mesh |
| `node --test preview/tests/office-*.test.js server/tests/office*.test.js scripts/tests/office-kit-fit.test.js` | 129 pass, 6 Redis skips, 0 fail |

## Not in this change

- Desk monitors and the dynamic desk screens. They now have desk geometry to sit on; that is #363's next step.
- Furniture collision for the lounge, meeting and terrace pieces, and final art.
- Activation: the penthouse stays off by default.
