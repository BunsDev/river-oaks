# Penthouse captures (#362)

Captures of the furnished penthouse, by stage. The review and the defect matrix are in
`../../penthouse-review.md`. The cameras are O1-P, O2-P, O3-P, O4 and O4-T in `../../camera-manifest.json`.

| Folder | Stage | Made by | Receipt |
| --- | --- | --- | --- |
| `asset-preview/` | Asset preview: the fixture page's lights, no avatars, 12:00 and 18:45 | `node scripts/export-office-penthouse.mjs export` | `assets/office-penthouse/export.json` (`views`) |
| `blender-preview/` | Blender preview: Cycles at 48 samples, denoised, AgX, daylight sun and the office lamps | `scripts/export-office-penthouse-blender.py -- --render` | `assets/office-penthouse/blender.json` (`renders`) |
| `runtime/` | Runtime: the game, two accounts, live district outlook, Metal ANGLE, 12:00 and 18:45 | `node preview/e2e/office-penthouse-review.mjs` | `runtime/result.json` |

The blockout for comparison (the graybox before #362) is #473's pair:
`docs/office-review/penthouse-lighting-{noon,dusk}.jpg`.

All captures are 1440 × 900 at device scale 1, on an Apple M3 Max. None is device, Safari, iOS
or human visual acceptance.
