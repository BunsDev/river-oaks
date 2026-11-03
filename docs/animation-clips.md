# Quaternius animation clip packs

Phase 2 prepares the CC0 Quaternius Universal Animation Library clips as five animation-only GLBs. The packs retain the source skeleton's local joint transforms and are intended for the `quaternius-ual-v1` skeleton contract. They do not add a playable character, retarget the current MakeHuman rigs, or replace procedural walking.

## Groups

| Group | Clips | GLB bytes | Intended use |
| --- | ---: | ---: | --- |
| `ambient-idle` | 8 | 641,772 | Idle, conversation and acknowledgment |
| `seated` | 10 | 813,512 | Chair and ground sitting transitions and idles |
| `service` | 6 | 501,716 | Counter service gestures |
| `garden` | 9 | 578,916 | Gardening and fishing actions |
| `interact` | 6 | 402,184 | Interaction, pickup, opening, drinking and consuming |

The five GLBs total 2,938,100 bytes. Both source license texts are copied verbatim beside the packs; `quaternius.sources.json` records the original source/archive hashes, generated group hashes and the exact exporter/audit/publisher hashes.

The pinned catalog in `preview/src/animation-clip-assets.js` is the runtime allowlist. Each entry identifies its family, URL, byte count, SHA-256, exact clip names, joint names and source receipt. Unsupported families and unknown groups are rejected before fetching. No automatic cross-family retargeting is provided.

## Load and play

`createAnimationClipLibrary` in `preview/src/animation-clips.js` lazily fetches a requested group, verifies its bytes, and parses it through the existing `createAssetGLTFLoader`. Concurrent requests for the same group share a load. Each result has independent scene transforms and cloned animation clips; failed requests are evicted, and only a new explicit request retries them. `clear()` removes cached templates.

```js
import { createAnimationClipLibrary } from './animation-clips.js';

const library = createAnimationClipLibrary();
const { scene, animations } = await library.load('ambient-idle', {
  family: 'quaternius-ual-v1',
});
```

The returned scene is the clip skeleton, not a dressed avatar. A future character integration must establish matching hierarchy, axes, rest transforms and scale before binding a mixer to that character. Phase 1's `Regular_Female_FullBody` import and Phase 3's avatar playback remain separate work. Consumers own mixer lifetime and transition/loop choices; stop actions and uncache the mixer root when disposing playback.

## Rebuild and verify

Keep the original in-place `UAL1.glb` and `UAL2.glb`, license texts and hash receipts in the ignored `data/raw/characters/quaternius/` directory. Do not substitute the root-motion packs. Run the exporter through the repository's shared heavy-command queue, using the actual Blender executable path:

```sh
python3 -m py_compile scripts/build_quaternius_clips.py
node scripts/browser-lock.mjs 'Quaternius staging' -- /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python scripts/build_quaternius_clips.py
```

Inspect `.runtime/quaternius-clips/report.json`. Each rebuild archives the previous report under `.runtime/quaternius-clips/history/` and invalidates current success before work begins; failed attempts report `ok: false`. Retain failed outputs and logs before rerunning. The audit checks complete source channel coverage, clip duration, joint and ancestor transforms, scene membership, and motion at source/output key times and interval midpoints. Public asset output is allowed only after every group passes staging. `--write`, passed after Blender's `--`, is the explicit local public-directory write mode. Neither mode saves Blender user preferences.

Focused checks use pure malformed-GLB fixtures and local HTTP with the real runtime parser and animation mixer:

```sh
uv run --locked pytest -q tests/test_quaternius_clip_audit.py tests/test_quaternius_clip_publish.py
node --test preview/tests/animation-clips.test.js
node scripts/browser-lock.mjs 'Quaternius browser' -- node preview/e2e/quaternius-clips.js
pnpm test
pnpm run build
pnpm run verify
```

The real-asset test checks every group against its receipt and evaluates every exported clip at multiple times. These checks prove data integrity and loader compatibility; they do not establish skinning quality, garment contact, human animation acceptance, device performance or a deployed feature. See the [implementation ledger](superpowers/plans/2026-10-26-quaternius-clip-import.md) for the current completion state, failures, skips and pending gates.
