# #418 acceptance: soak and late/missing textures for every template (2026-10-16)

## Objective and ownership

#418 asks for "#417's same-profile edit/walk/save/reopen/recovery and repeated-replacement
checks across the delivered templates", with the harness reused rather than copied. The three
template slices are on main: House #466 (`c71a7325`), Boutique #474 (`bf8892d8`) and Café #476
(`a797d6b4`). Each passed `studio-template-journey`, which covers edit, refusal, undo/redo,
save/reopen, the stale tab and the walked route. This task adds the two #417 checks that were
still office-only.

- Register task `studio-template-acceptance-418`, owner `claude:river-oaks-safe-edits (e9aa0185)`.
- Branch `test/studio-template-acceptance-20261016` in `../river-oaks-studio-acceptance-418`,
  from `a797d6b4`.

## Finding

`studio-pilot-assets` measured the Garden Office's limestone reception counter top, which was
the office's only textured surface. Since #466, stone worktops and table tops are plain slabs,
so that check no longer exercises a texture at all. Only floors are textured now:

- limestone: the House bathroom, the Boutique sales floor and the Café terrace;
- terracotta: the House patio and the Café floor.

## Change

- **`studio-pilot-soak.js`:** `STUDIO_TEMPLATE` soaks any stock template, replacing it with
  another template (Courtyard House, or Garden Office when soaking House) each cycle. The
  receipt keeps #417's field names and adds `templateId`.
- **`studio-pilot-assets.js`:** `STUDIO_TEMPLATE` picks a station that faces a textured floor
  in each template (the office keeps its counter station). Both the stone and the paver
  textures are now blocked or delayed, and the failure message names the measured surface.

## Checks

All on main `a797d6b4` with this branch's harness changes. Chromium 156, ANGLE Metal on an M3
Max, through `pnpm run test:experience` with `STUDIO_TEMPLATE` set.

**Late and missing textures** (`studio-pilot-assets`). Mean brightness of the measured patch,
0–255:

| Template | Surface | normal | missing | loading | loaded | replaced |
| --- | --- | --- | --- | --- | --- | --- |
| House | terracotta patio | 81 | 111 | 111 | 81 | 81 |
| Boutique | limestone sales floor | 154 | 184 | 184 | 154 | 154 |
| Café | terracotta floor | 82 | 112 | 112 | 82 | 82 |
| Office | limestone counter top (now untextured) | 224 | 224 | 224 | 224 | 224 |

- **Missing or still loading:** the floor shows its plain base colour, about 30 levels lighter
  than the textured floor. That is within #417's ±40 rule and nowhere near black.
- **Loaded, or replaced while loading and reopened:** the readings match normal.
- **Measured patches:** the normal captures read RGB 134/67/41 (terracotta) and 181/159/123
  (limestone).
- **Earlier run:** the first House run sampled the bottom middle of the view, which is the
  patio table's plain slab, and read 213 throughout. It proved nothing. Each region now comes
  from a `studio-template-stations` capture of the same view.

**Repeated replacement** (`studio-pilot-soak`, one warm-up plus ten cycles of open, walk and
replace):

| Template | Cycles 1→10: calls, triangles, geometries, textures, programs, listeners, nodes, canvases | Heap MiB 1→10 | Run |
| --- | --- | --- | --- |
| House | flat (700 calls, 48 geometries, 10 textures, 8 programs, 164 listeners, 960 nodes) | 14.21 → 14.95 | 56 s |
| Boutique | flat | 14.51 → 15.44 | 56 s |
| Café | flat | 14.52 → 15.29 | 56 s |

The heap grows by 0.7–0.9 MiB over ten cycles, the 80-step undo history filling as #417's heap
snapshots showed; every counter is flat.

**Core gate:** `pnpm run verify` passed, 11/11 tasks: agent 112/112; preview 3,367/3,368 (1
skipped); server 599/753 (154 skipped); desktop 76/76; pytest 141.

## Gaps

The a11y pilot check is template-independent UI, so it was not rerun. Not run: devices,
packaged builds, VoiceOver and touch.
