# Jevica reference fidelity review — October 31, 2026

Resumed November 2 after the sign-in prompt was cancelled.
Status: partial; normal correction only, visual acceptance blocked.
Baseline: c2698d9ed6cb061c86de6a34235afb4ccb647c88; existing PR #822,
stacked on #818, #817, #816, #815 and #814.
Owner: codex:deaf6aa23910.
Files: preview/src/jevica-suit.js, preview/tests/jevica-reference-look.test.js, this ledger.

## Evidence and change

Inspected the actual October 29 reference PNG, suit/costume code, real rig,
likeness journey and the six stacked PR descriptions. Prior matched captures
were described as session-local, not committed. No fresh browser captures
were obtained.

The face deformation is x' = x*k(x,y,z). Its old normal correction assumed
constant scaling, ignoring the gradient at cheek/jaw/nose transitions.
Apply the inverse-transpose Jacobian to each authored normal using central
differences (0.01 mm). Do not recompute normals across UV/split vertices.

The independent tangent-cross-product regression failed before the correction
with a 14.15994-degree error, then passed. Duplicate positions/normals and source
data preservation are covered. Independent code review found no blocking issue
and independently passed all 14 reference-look tests. This is code review, not
human visual acceptance.

Actual-rig before/after comparison on October 31:
- Position arrays, UVs, skin indices, weights and morph attributes identical.
- 4,869 affected vertices and 0.004803031845800575 m maximum displacement unchanged.
- 3,013 normals differ by more than 0.1 degree; maximum correction 16.7653 degrees.

No source rig, asset packs, facial proportions, animation data, gameplay or
similarity thresholds were changed.

## Reference review priorities

The reference visibly emphasizes long pink waves, shaped dark fringe, alert
eyes, a softly defined face, fitted satin tailoring and botanical trim.
The stack's own evidence acknowledges hidden front hair ends, unchanged eyes/
lids/brows, single-sheet bangs, body-derived tailoring and flat-foot pumps.
These are priorities to inspect, not fresh observations of current renders.

| Distance | Matched-view questions |
| --- | --- |
| Full body / ordinary play | Visible pink hair length and silhouette; jacket/trouser proportions |
| Conversation / torso | Fringe, expression, lapel/collar structure and satin response |
| Face front / three-quarter / profile | Eye/lid/brow shape, jaw/nose profile, lips and cheek shading |
| Walking / seated / flight | Hair overlap, garment clearance, blink compatibility and foot contact |

The likeness test excludes missing hair ends from its color average.
The reported IoU 0.598 and delta-E 17.4 are prior author measurements, not new
scores or a likeness acceptance threshold.

## Observed verification

October 31:
- Baseline reference-look: 13/13 passed.
- Corrected focused reference-look, player-costume, default-appearance-realism:
  26/26 passed, including the new regression.
- Build passed; Python profile passed (215 tests, lint/format and expected
  offline fixture verification outcome).
- Server: 1,105 passed, 290 skipped.
- Core stopped in six project-prune-cancel tests: ps -axo command= failed with
  "fatal library error, lookup self".
- Desktop: 127 passed, one failed, four skipped. The live Linux process-status
  test could not read /proc/<pid>/status.
- Security passed for the worktree and shallow local history (one commit).
- Full preview tests were started; their terminal result was not observed before
  the workspace expired during the sign-in wait. Do not count them as passing.
- Browser blocked: required Chromium absent; both repository/runtime Playwright
  downloads returned invalid ZIP files. Package installation also failed on
  UID/group restrictions.
- Vercel preview required sign-in. The secure prompt was cancelled; no auth
  bypass, rendered comparison, browser animation acceptance or human acceptance.

The prior baseline hosted run 41170333055 failed its JavaScript dependency audit
(three vulnerabilities; GHSA-g3hv-75wg-m249 and GHSA-3g3m-2fjr-6pw4), before unit
tests. That is a separate merge blocker.

The temporary checkout expired during the sign-in wait. The narrow source/test
patch was restored from this session onto the unchanged baseline for a fresh
focused test/build run before publishing. Historical broad-suite results above
remain explicitly dated.

## Next action and acceptance

Keep the stack draft. Restore browser execution or authenticate the preview.
Capture baseline and candidate at identical camera, pose, exposure, lighting,
viewport and settled cloth: face front/three-quarter/profile, torso, reference
full body, ordinary gameplay distance, blink, walking, seated and flight.
Place the unmodified reference beside the actual captures; record exact
revisions/settings. Resolve browser/full-suite/hosted gates and obtain human
visual acceptance separately from scores before marking ready or merging.
No restricted MPFB/Faceunits packs were downloaded.

November 2 restored patch verification: all 26 focused tests passed again and the
production build passed. Full preview/browser/core acceptance remains outstanding.
