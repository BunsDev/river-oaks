# Office outlook: the snapshot on phones

- **Task:** `office-outlook-phones`, owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch:** `feat/office-outlook-phones-20261015`, from #449's head `a7b2a996`.
- **Decision (Val, 2026-10-15):** after reviewing #449, keep the bounded snapshot on phones, and land #449.

## Change

- `officeOutlookFor({ scale, coarsePointer, maxCubemapSize, maxTextureSize })` in `preview/src/office-skyline.js` decides the outlook:
  - a coarse pointer, or a render scale below 0.75, gets `{ mode: 'snapshot', size }`, with the size from #433's `officeSkylineSize` (512, within the device limits);
  - everything else gets `{ mode: 'live' }`.
- `main.js` passes that choice as the visit's `skyline`. The development off switch and software acceptance still pass `null`.
- The snapshot path is #408/#433's bounded capture, unchanged in #449. It runs once, as the doors close, and the office lights use the district's light pool.

## Checks

| Check | Result |
| --- | --- |
| New test: phones, reduced scale and device limits get the snapshot; full-scale fine pointers get live | red (no export), then green |
| `node --test preview/tests/office-*.test.js preview/tests/green-roofs.test.js` | 135/135 |
| `pnpm run verify` | core passed: agent 112/112, preview 3299/3301 (1 skipped, 1 todo), server 592/742 (150 skipped: need Redis), desktop 69/69, Python 141, build, ruff |

## Next

Open a PR targeting main. Land it right after #449, with Val's approval given for this change.
