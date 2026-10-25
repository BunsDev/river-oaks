# Default-appearance realism trial (#517)

The trial gave the owner's default Jevica and the guest's default Sable (on
Jevica's rig) one part of the existing realism layer, the regional skin roughness
map, and judged it in pixels and in cost. Their face, eyes, hair, brows, outfit,
palette and skin tone stayed as authored. This is the bounded continuation
approved on #517 on 2026-10-24 under #638. It does not establish AAA quality, a
device budget or human acceptance.

**Outcome: the trial ships switched off.** Roughness passed both independent
visual reviews for both looks, but each look went over the +10% CPU bar in a
deciding timing run whose rule was written down before it ran:

| Look | Visual verdict | Cost | Shipped |
| --- | --- | --- | --- |
| Jevica | accept | over in timing-3 (×1, +10.5%) and timing-6 (×8, +10.2%) | no: stopped, kept off the policy |
| Sable | accept | within in timing-3, timing-5 and timing-6; over in timing-7 (×24, +11.7%) | no: the trial is switched off |

As shipped, the world, the Studio hero and every peer draw both defaults with
imported materials, exactly as on `main`, so the shipped cost is `main`'s.

Policy and rollback: [`default-appearance-realism.js`](../../preview/src/default-appearance-realism.js).
It lists `sable-human: ['roughness']` with `enabled: false`. Setting `enabled` to
`true` is the one switch that turns Sable's roughness on, once a quiet host or a
physical device measures it within the bar. The layer, the tests and the
two-account journey cover both settings. Nothing about it reaches the server, the
saved character or other players' selections.

## How the trial was judged

`node scripts/default-appearance-trial.mjs` renders native 3840×2160 full-body
and close-up views through the production portrait path with a fixed camera and
pose, under three fixed lights (the hero's daylight, a warm dusk and a warm
interior with a room environment). Each component is rendered alone at the high
tier, the trial set at every tier, and the whole preset as evidence only. A
no-MSAA pair shows the software-rendering path. Every case is compared with
realism off under the same light: whole-image channel error, and per region
(hair, brows with lashes, skin) the covered area, its overlap with off (IoU of
8×8 cells) and the CIE76 shift of its mean colour. Regions are found by
rendering again without their meshes.

The close-up camera is about 1.0 m from the face with a 24° vertical field of
view, about 5.1 px per mm at the face.

## Component verdicts

From trial run-1 (`ed35a2e8` patch on `f33c914b`, input manifest
`54154c63f28b…`, 19:51–20:17Z, load 14–23). Ranges cover all three lights and
both views.

| Component | Jevica | Sable | Verdict |
| --- | --- | --- | --- |
| `roughness` | Skin ΔE 0.04–0.08, area and overlap 1.000. New gloss on the lower lip and nose tip only, which places the map's lip region on her lips. | Skin ΔE 0.05–0.18, overlap ≥0.998. | Accept |
| `pores` | Skin ΔE ≤0.05, overlap ≥0.999, no visible tiling. Specks 3–5 px apart (0.6–1 mm), plausible on the cheek, but applied evenly: the lips look pebbled, the eyelids rough and the neck like stucco at high. | Same. | Revise; not shipped |
| `coverage` | Brows with lashes cover ×1.73–2.60 the area, IoU 0.40–0.54, ΔE 1.7–6.7: thicker, longer, solid brows. Hair gains only thin slivers at card seams. Without MSAA ×1.82–2.89. | Same shape change, brow ΔE up to 12.3. Hair cards are already solid (the look's colour texture has no alpha), so nothing to cover. | Reject |
| `hairColor` | No pixel changes; her look keeps the source hair map. | Hair turns cream with mint-green streaks in every light, and a ragged seam appears at the hairline. | Reject |

Scatter and sheen were never candidates. In the whole-preset evidence they move
skin ΔE to 8.8–9.5 under dusk light (1.1–4.8 elsewhere), and the corneal shell
and iris recolor change both defaults' eye colour.

Run-3 repeated every component on the final code and adds what run-1 missed:
- Hair regions, now measured:
  - coverage leaves Jevica's hair at area ≤1.004 and IoU ≥0.991, so its
    rejection rests on the brows;
  - strand recolor moves Sable's hair ΔE 16.3–19.6.
- Pores at standard strength (0.18 instead of high's 0.32) still speck the lips and
  roughen the eyelids and nose, more lightly. Capping strength alone is not enough;
  pores need a region mask.

An independent reviewer (a separate agent given the captures and this contract,
not these verdicts) reached the same four verdicts. On pores it suggested masking
the lips and weakening them on the eyelids, neck and body.

A second independent reviewer, also given no verdicts, saw the final set on the
PR head's code. Its inputs were timing-5's off and trial captures on `82b51d89`,
the three-light face grids and the hero images. It accepted roughness:
- Only skin pixels change, by at most 17/255 (PSNR 53–65 dB). Eyes, irises,
  hair, outfit and background are byte-identical.
- The lip highlight sits inside the lower lip. At 5× contrast it found no seams,
  patches or tiling.
- Skin tone shifts by at most 2/255.
- The look is neutral to slightly better. The shoulder sheen in the close-up is
  the most visible change and comes close to satiny, though not waxy.

It couldn't confirm nail alignment at the captured scale: nails are about 10 px
wide in the full view.

Crops (from run-3, daylight unless noted; magenta lines separate panels):
- [Jevica, off vs trial](default-appearance-517/jevica-face-off-vs-trial.png) and
  [Sable, off vs trial](default-appearance-517/sable-human-face-off-vs-trial.png):
  rows are daylight, dusk and interior.
- [Lips at 2×: off, trial, pores at high](default-appearance-517/jevica-lips-off-trial-pores.png)
- [Brows: off, coverage](default-appearance-517/jevica-brows-off-coverage.png)
- [Sable's hair: off, strand recolor](default-appearance-517/sable-hair-off-haircolor.png),
  daylight and interior.

## Final set (as evaluated, switched on)

This is what the trial drew with the switch on, for both looks. As shipped, it
is not drawn. From trial run-3 (`3e7ff114` patch on `f33c914b`, input manifest
`9fb7504ef04b…`, 20:33–22:08Z, load 6–10 at the end, Chromium 156.0.8078.4 on
ANGLE Metal, Apple M5 Max). Ranges cover both looks, all three lights and both views.

- High, standard and low render byte-identically to each other and to roughness
  alone, in all 12 light and view cases. For these two looks the graphics tier no
  longer changes the material.
- Against realism off, the only change is skin highlights:

  | Region | Jevica | Sable |
  | --- | --- | --- |
  | Skin | ΔE 0.04–0.08, area 1.000, IoU 1.000 | ΔE 0.05–0.18, area 1.000, IoU ≥0.998 |
  | Hair | ΔE ≤0.04, area 0.998–1.000, IoU ≥0.998 | ΔE ≤0.04, area 0.998–1.002, IoU ≥0.997 |
  | Brows and lashes | ΔE ≤0.01, area 1.000, IoU 1.000 | ΔE ≤0.02, area 1.000, IoU 1.000 |

  1–13% of pixels change, by at most 13–50 of 255, on the lower lip, nose tip,
  cheeks, shoulders and nails. Silhouette, palette, eye colour, brows and hair are
  unchanged.
- Without MSAA, comparing the low tier with off rendered without MSAA: the same
  ranges (skin ΔE ≤0.18, hair IoU ≥0.996, brows IoU 1.000). The software path
  shows no fringes.
- Lifecycle: every variant (20) went through 10 viewport and 10 two-camera 4K
  load/dispose cycles with zero geometry, texture or shader-program residue.

### Costume order (code review)

An independent review of the code found that in the world, Jevica's realism was
applied while her avatar loaded, before the caller added her costume. That had two
effects:
- her skin drew the roughness map scaled by the costume's 0.58, not the map at
  full strength as captured here;
- any later re-tier restored the materials as they were before the costume, which
  removed her rose-gold hair and soft-brow shaders.

The costume now makes its material edits beneath the applied tier
(`createCharacterFidelity().underneath`). The world therefore uses the same order
as the Studio hero and these captures: costume first, then realism. A regression
loads the shipped rig as the world does and checks the costume and map through
high, standard, low and off. The trial fixture already used this order, so the
captures and timing above measure the shipped look. To confirm it, off and the
trial at high were recaptured on the fixed head (`2065b5ef`, clean tree, input
manifest `7771b2af3163…`, finished 02:44Z, 3 load/dispose cycles each). All 24
captures are byte-identical to run-3, with zero lifecycle residue.

## Cost and lifecycle

The bar is at most +10% frame p95 and CPU-submission p95 against realism off,
at the same revision, as the median of three warmed 30 s samples. Jevica and
Sable have no frame-time or census ceilings of their own; no budget was added
or loosened. Because all three tiers apply the same material to these looks,
high stands for low and standard.

**Enforced gates** (each run fails otherwise), all passed:
- source and asset inputs unchanged during the run;
- native 4K captures and a cross-origin-isolated timing page;
- no geometry, texture or program growth after 10 viewport and 10 two-camera 4K
  load/dispose cycles;
- no console errors.

Everything else below is an observation.

**Census.** Draw calls (Jevica 13, Sable 20), triangles, geometries, materials,
programs, alpha-tested materials (4) and transparent materials (0) are identical
to off. The one addition is a 512² roughness texture, 1.33 MiB uncompressed:
Jevica 52.1 → 53.4 MiB, Sable 25.6 → 26.9 MiB. Hair, brow and lash materials are
untouched, so hair-card overdraw is unchanged.

**Timing.** No script fails on timing, so the +10% bar is judged here, not
enforced. A run counts as a measurement when no sample's one-minute load
exceeds about 20, and as an observation otherwise. All runs are cross-origin
isolated with timer resolution 0.005 ms. The tables show trial vs off, median
of three.

timing-5 is on the PR head `82b51d89`: clean tree, input manifest
`956cf7d8cec9…`, finished 13:24Z, load 2.9–17.2 across all 36 samples. It is a
measurement.

| Look, crowd | frame p95 | CPU p95 | GPU p50 |
| --- | --- | --- | --- |
| Jevica ×1 | 2.00 → 2.17 ms (+8.5%) | 1.92 → 2.10 (+9.1%) | +2.6% |
| Jevica ×8 | 16.0 → 15.4 (−3.8%) | 16.0 → 15.3 (−4.2%) | −1.6% |
| Jevica ×24 | 47.0 → 47.3 (+0.6%) | 45.3 → 45.4 (+0.1%) | +9.0% |
| Sable ×1 | 2.90 → 2.78 (−4.0%) | 2.81 → 2.71 (−3.6%) | +3.4% |
| Sable ×8 | 3.05 → 3.00 (−1.6%) | 2.99 → 2.91 (−2.7%) | −4.2% |
| Sable ×24 | 3.77 → 3.99 (+6.0%) | 3.69 → 3.91 (+6.0%) | −1.2% |

Two earlier runs on the pre-merge tree (`f33c914b` plus the trial patch, input
manifest `9fb7504ef04b…`):

| Look, crowd | timing-3 frame p95 | timing-3 CPU p95 | timing-4 frame p95 | timing-4 CPU p95 |
| --- | --- | --- | --- | --- |
| Jevica ×1 | 2.41 → 2.66 ms (**+10.4%**) | 2.28 → 2.52 (**+10.5%**) | 2.25 → 2.33 (+3.6%) | 2.18 → 2.26 (+3.9%) |
| Jevica ×8 | 16.3 → 29.0 (**+78%**, bimodal 16/33 ms) | 16.2 → 17.4 (+7.5%) | 18.3 → 15.8 (−13.6%) | 17.1 → 15.7 (−8.1%) |
| Jevica ×24 | 58.3 → 54.3 (−6.9%) | 55.1 → 52.0 (−5.7%) | 56.3 → 60.9 (+8.2%) | 53.6 → 58.4 (+9.0%) |
| Sable ×1 | 2.64 → 2.67 (+1.1%) | 2.51 → 2.53 (+0.8%) | | |
| Sable ×8 | 2.54 → 2.54 (0%) | 2.43 → 2.42 (−0.4%) | | |
| Sable ×24 | 5.42 → 4.87 (−10%) | 5.28 → 4.74 (−10%) | | |

In timing-3 and timing-4, GPU p50 stayed within −1% to +8% of off in every case.

- timing-3: 22:08–22:34Z, both looks, load 5.1–14.4. It is a measurement.
- timing-4: Jevica only, 23:36–02:28Z, load 5.4–23.8, with 2 of 18 samples
  above 20. It is an observation.
  - It waited up to 300 s before each sample for one-minute load ≤10.
  - That never held: none of its samples were quiet.

timing-6 repeated timing-5 on `7757f387`, with the same code and command. Its
inputs `956cf7d8cec9…` match timing-5's. It finished 14:46Z, at load 3.4–11.9
across all 36 samples, so it is a measurement. Before it ran, the ledger recorded
the rule: cost counts as met on the head only if timing-6 also stays within the
bar everywhere.

| Look, crowd | frame p95 | CPU p95 |
| --- | --- | --- |
| Jevica ×1 | 2.08 → 1.98 ms (−4.6%) | 2.00 → 1.91 (−4.7%) |
| Jevica ×8 | 15.4 → 17.0 (**+10.5%**) | 15.3 → 16.8 (**+10.2%**) |
| Jevica ×24 | −2.1% | −4.4% |
| Sable ×1 / ×8 / ×24 | +4.9% / 0% / +4.7% | +3.3% / −0.2% / +5.1% |

In timing-6, all three ×8 trial samples for Jevica (16.6–17.5 ms CPU) were
slower than all three off samples (15.2–15.3 ms), even though the trial samples
ran at lower load.

The measurement runs side by side, as each run's median-of-three trial vs off,
then the adjacent trial/off sample pairs pooled (nine for Jevica, twelve for
Sable):

| Look, crowd | CPU p95: timing-3, timing-5, timing-6, timing-7 | Paired CPU ratio, median (range) |
| --- | --- | --- |
| Jevica ×1 | +10.5%, +9.1%, −4.7%, not run | +2.4% (−6.9 to +17.4%) |
| Jevica ×8 | +7.5%, −4.2%, +10.2%, not run | +8.5% (−7.7 to +19.3%) |
| Jevica ×24 | −5.7%, +0.1%, −4.4%, not run | −2.0% (−13.0 to +26.4%) |
| Sable ×1 | +0.8%, −3.6%, +3.3%, −1.4% | −0.2% (−3.6 to +5.8%) |
| Sable ×8 | −0.4%, −2.7%, −0.2%, −0.5% | +0.0% (−4.8 to +24.5%) |
| Sable ×24 | −10.2%, +6.0%, +5.1%, +11.7% | +4.3% (−21.2 to +19.1%) |

Frame p95 follows CPU, except for Jevica ×8 in timing-3, whose frame p95 was
bimodal at 16 or 33 ms.

timing-7 ran after Jevica was stopped, on the final code (`e8b30b8b`, clean
detached snapshot, input manifest `8e7a249ae13e…`, Sable only, finished 15:42Z,
load 7.8–18.1 across all 18 samples), so it is a measurement. Before it ran, the
ledger recorded the rule: any case over the bar stops Sable's roughness too, and
the trial ships switched off.

| Look, crowd | frame p95 | CPU p95 |
| --- | --- | --- |
| Sable ×1 | 2.90 → 2.84 ms (−1.9%) | 2.81 → 2.77 (−1.4%) |
| Sable ×8 | 3.03 → 2.99 (−1.3%) | 2.95 → 2.94 (−0.5%) |
| Sable ×24 | 4.21 → 4.71 (**+12.0%**) | 4.12 → 4.60 (**+11.7%**) |

All three ×24 pairs had the trial slower (CPU +6.2%, +11.7%, +4.3%), while the
three off samples alone spread from 4.05 to 4.77 ms (17%). Over the twelve paired
samples of timing-3, timing-5, timing-6 and timing-7, Sable's CPU medians are
−0.2% (×1), +0.0% (×8) and +4.3% (×24, range −21.2 to +19.1%).

**Verdict on cost: no component met the bar on this host, so the trial ships
switched off.**
- Under the rule set beforehand, timing-6 decided for Jevica: her ×8 crowd was
  over the bar, so her roughness was stopped (the goal's stop rule for a
  component that breaks a budget).
- Under the rule set before timing-7, Sable's ×24 crowd was over the bar, so her
  roughness was stopped too.
- Three of the four measurement runs have one case 0.2–2 points over the bar,
  a different case each time (Jevica ×1 in timing-3, Jevica ×8 in timing-6,
  Sable ×24 in timing-7). timing-5 is within the bar everywhere.
- Sable's paired medians are 0–4%; her ×24 crowd is the one to profile.
- Jevica ×8 CPU is the case nearest the bar. Its pooled paired median is +8.5%,
  and timing-6's pairs agree, so it may be a real cost rather than noise.
- Nothing structural explains a CPU cost. At every crowd size the census has the
  same draw calls and triangles as off, plus one shared 1.4 MB texture, and the
  costume edit runs once at load, not every frame.
  - Jevica's crowd is already about five times Sable's in CPU and texture memory
    with realism off. That predates this trial.
- On this shared host the same code moves by up to ±12% between runs, and one
  run's off samples by up to 17%, so the host can't resolve a 10% difference.
  Turning the trial on needs a quiet host or a physical device, and profiling
  Sable ×24 and Jevica ×8 (Decision for Val).

Jevica's crowd CPU time (about 16 ms at ×8 and 50 ms at ×24, against Sable's
2.5 and 5 ms) is the same with realism off. It predates this trial and was not
investigated here.

**Quality-tier cycles.** These use the real avatar and graphics control, with
synthetic 40 ms governor inputs to drive the auto step; those inputs test the
transitions, not performance. The fixture used to accept only realistic rigs and now
also accepts a named default in the trial. Each look ran ten cycles of
Sharpest → Smoothest → Auto (high → standard → low), 30 transitions in all.
- After a re-tier to high and to standard, the render matched a freshly loaded rig
  at that tier exactly (maximum channel difference 0).
- Geometries, textures and programs were the same after the ten cycles as before
  (Jevica 9/16/22, Sable 21/15/23).
- Run on `2065b5ef` plus the fixture patch, input manifest `b43d139e1713…`,
  finished 03:21Z. Sable's cycles passed again on the final code with the switch
  on (`e8b30b8b`, finished 15:43Z, 21/15/23 before and after, rendered re-tier
  maximum 0).

## Identity, fallback and reconnect

The `default-appearance-tiers` shared journey plays a real two-account session.
The owner wears Jevica at Sharpest and alice wears Sable at Smoothest, each
viewing the other. It reads the policy and checks what it says.

With the switch off, as shipped, both defaults stay at realism off at both tiers,
own and remote. With the switch on, it checks:
- each listed look carries only its trial components, own and remote, with no
  cornea shell. A look the policy leaves out (Jevica, after her stop) reports
  `off` for its owner and every peer, and each viewer holds the other's canonical
  definition;
- a peer's `realism` report matches its tier;
- re-tiering sends no selection command, and no client message carries graphics
  quality or realism state;
- both viewers reload without the roughness map. Each listed look, own and remote,
  is reported as `roughness_unavailable` and keeps its identity and components;
  a look left out stays `off` with no fallback;
- after both reconnect, each look returns as before, own and remote, with the
  same definitions and no fallback.

The report describes what is drawn because the material layer builds it from its
own edits to the rig: it counts a skin material only after giving it the map
(`character-realism.js`, `upgradeSkin`). `default-appearance-realism.test.js`
checks this on the shipped rig:
- as shipped, `loadResidentAvatar` (the loader that builds peers) draws Jevica and
  Sable at `off`, with no roughness map on the skin;
- switched on, the same layer on Sable's rig reports only `roughness`, with one
  or more skin materials and no cornea shells.

In the switched-on case the rig's own materials match the report:
- the skin material carries `realism-skin-roughness` and no pore normals;
- no cornea mesh exists;
- brows and lashes keep their alpha settings.

The journey then reads that report for each peer at each viewer's tier:
- In the 18/18 run on clean `2065b5ef`, with both looks listed, each view of
  Jevica and Sable (own and remote, at high and standard) reports
  `components: ["roughness"]`, `skin: 1`, `cornea: 0`, and zero hair, brows and
  lashes.
- In the 20/20 run on `e8b30b8b` plus the review fixes, with only Sable listed
  ([receipt](../../data/reports/default-appearance-tiers-sable-only-517.json)):
  - each view of Sable reports the same;
  - each view of Jevica reports `{"tier": "off"}`;
  - without the map, alice's own Sable and the owner's view of her report
    `fallback: "roughness_unavailable"` at standard.

Results:
- Hosted Linux CI on `2065b5ef`, job 121026515790: default-appearance-tiers,
  character-studio-shared and character-studio-tiers all passed.
- Local Chromium (ANGLE Metal) on clean `2065b5ef`:
  - character-fidelity 9/9 and character-studio 43/43 (experience journeys);
  - rollback default-appearance-tiers 4/4 ([receipt](../../data/reports/default-appearance-rollback-517.json));
  - a separate default-appearance-tiers run, 18/18.
- `pnpm run verify full` on clean `2065b5ef`:
  - experience stage: all 17 world journeys passed (393 checks), including
    player-lifecycle 19/19 and multiplayer-lifecycle 17/17, which render the
    player and peers;
  - shared stage: all 28 required journeys passed (597 checks), including
    default-appearance-tiers 18/18, character-studio-tiers 64/64 and
    character-studio-shared 81/81.
  - verify full's `ipic-screening` stage timed out after 926 s without running.
    It was still waiting for the shared browser lock while the host was in idle
    sleep from 05:03Z. The standalone `node preview/e2e/ipic-screening-runner.mjs`
    on the same clean tree, with the host awake, passed 19/19 checks at 09:53Z.
- A separate character-studio-tiers run failed at its first page-ready wait. The
  host had gone into idle sleep at 05:03Z, and the run spanned it. The same journey
  passed on that head in verify full's shared stage and on hosted CI. A rerun on the
  same clean tree, with the host awake, passed 64/64 checks at 11:37Z.
- Hosted CI on the PR head `82b51d89` (run 40179234053): all 22 checks passed.
  Job 121126491272 ran default-appearance-tiers, character-studio-tiers and
  character-studio-shared.

## Hero reference

The Studio hero applies the same policy. With the switch on, Sable's reviewed
hero reference (`preview/e2e/goldens/character-hero/sable-human.png`, recorded at
`d9dca2e5` on 2026-10-16 on an M3 Max) would no longer describe her look. As
shipped, the hero draws her with imported materials again, as the reference does,
so the trial asks nothing of it. The candidate below was recorded with the switch
on, before the stops. Nothing in the reference directory was changed.

- The check, `node scripts/character-hero-goldens.mjs --check preview/e2e/goldens/character-hero`,
  exited 2 (incompatible) on `82b51d89`: "Reference environment mismatch:
  osRelease, osVersion, gpu". This host is an M5 Max on Darwin 27.0.0; the
  reference was recorded on Darwin 25.6.0. The check stops before rendering, so it
  says nothing about pixels.
- `--record .runtime/character-studio/hero-candidate-517-82b51d89` passed. It made
  three native 4K captures with zero changed pixels between them: `sable-human.png`
  sha256 `e5597125fc15…`, a `candidate` manifest with sha256 `e55076da431f…`.
- Against the reference, 3.5% of pixels changed, mean channel error was
  0.042/255 and the maximum 186/255. The check allows 0.1%, 0.01 and 2.
  - The face, eyes, iris colour, brows, hair, palette, pose, bag and shoes match.
  - The skin carries the roughness highlights on the nose, forehead, cheekbone and
    lower lip.
  - The largest differences are on the dress: the candidate's bodice shows
    rectangular shading tiles, and its side edges have moved.
- The tiles do not come from the trial. Timing-5's off and trial captures of Sable
  on the same head show the same tiles on her white dress, and the two are
  identical there.
- Two other causes remain, and these images can't tell them apart:
  - `main`'s code: since the reference was recorded, `main` has changed 42 of its
    hashed sources, including outfit code (the new `character-bodice-fit.js`,
    `romance-look.js`, `player-costume.js` and `avatars.js`; commits `1c9c36c1`
    and `2b5062b6`);
  - this M5 Max GPU.

  The reference and every older capture come from the M3 Max, and none of those
  includes the outfit changes.
- The second independent reviewer advised against promoting this candidate: it
  would make the tiles the new baseline. It suggested recording off and trial hero
  renders on one GPU once the tiles are fixed or explained.
- Crops: [face and bodice, reference vs candidate](default-appearance-517/sable-hero-reference-vs-candidate.png),
  and [bodice off vs trial, contrast raised](default-appearance-517/sable-bodice-off-vs-trial-contrast.png).

## Receipts and commands

Committed receipts, under `data/reports/`:
- Timing: [timing-3](../../data/reports/default-appearance-timing-3-517.json),
  [timing-4](../../data/reports/default-appearance-timing-4-517.json),
  [timing-5](../../data/reports/default-appearance-timing-5-517.json) and
  [timing-6](../../data/reports/default-appearance-timing-6-517.json).
  - Command: `node scripts/character-fidelity-baseline.mjs --appearances jevica,sable-human --realism off,high --crowd 1,8,24 --repeats 3 --seconds 30`.
  - timing-4 used `--appearances jevica --quiet load=10,browsers=0 --quiet-timeout 300`.
  - timing-5 and timing-6 ran under `caffeinate -i`, from the clean PR-head
    worktree.
  - [timing-7](../../data/reports/default-appearance-timing-7-517.json) used
    `--appearances sable-human` under `caffeinate -i`, from a clean detached
    snapshot of `e8b30b8b`. With Jevica out of the policy, the fixture would time
    her whole preset at `high`, so she has no timing-7 case. Each timing receipt
    records the components it drew (`realismReport.components`).
- Hero: `node scripts/character-hero-goldens.mjs --check preview/e2e/goldens/character-hero`
  (exit 2), then `--record .runtime/character-studio/hero-candidate-517-82b51d89`
  (exit 0). The candidate stays under `.runtime/` on the trial host.
- [Quality-tier cycles](../../data/reports/default-appearance-quality-cycles-517.json):
  the same script with `--appearances jevica,sable-human --realism off --quality-cycles --repeats 0`;
  [Sable again on `e8b30b8b`](../../data/reports/default-appearance-quality-cycles-7-517.json)
  with `--appearances sable-human`. The fixture refuses a look the policy doesn't
  switch on.
- [Experience journeys](../../data/reports/default-appearance-experience-517.json):
  `node preview/e2e/experience-runner.js character-fidelity character-studio`.
- [Rollback journey](../../data/reports/default-appearance-rollback-517.json):
  with `enabled: false`, `RIVER_OAKS_SHARED_JOURNEY=default-appearance-tiers node preview/e2e/shared-runner.js required`.
  The [Sable-only run](../../data/reports/default-appearance-tiers-sable-only-517.json)
  used the same command with Sable listed and the switch on.

`scripts/default-appearance-trial.mjs` skips the policy-decided `trial-*`
variants for a default the policy doesn't switch on, and lists them under
`skipped`. Otherwise it would save that look's whole preset under the trial's
name. The trial reports are 2–10 MB
each, plus native 4K PNGs (144 in run-3). They are not committed; they were kept on
the trial host under `.runtime/default-appearance-517/`. Each is identified by its
input manifest and report digest:

| Run | Revision | Input manifest | Report sha256 | Cases |
| --- | --- | --- | --- | --- |
| run-1 | `f33c914b` + patch | `54154c63f28b…` | `8c856852cee5…` | 66 |
| run-3 | `f33c914b` + patch | `9fb7504ef04b…` | `b726b3b4ed61…` | 72 |
| final | `2065b5ef`, clean | `7771b2af3163…` | `60654ef9467e…` | 12 |

The crops linked above come from run-3.

## Limits

- One host: Apple M5 Max, Chromium 156.0.8078.4 (ANGLE Metal), shared with other
  agents' work. Load averages are kept with each result. No physical device.
- Pore normals were not shipped. A version that spares the lips and eyelids and
  weakens on the neck and body needs a new region mask, outside this trial.
- The reviewed `sable-human` hero golden (`preview/e2e/goldens/character-hero`)
  was recorded with imported materials on an M3 Max, before `main`'s outfit
  changes. Its check is incompatible on this host. A candidate recorded here with
  the switch on also carries bodice tiles that the trial doesn't cause; they come
  from `main`'s outfit code or this GPU. The reference was not replaced. As
  shipped, the hero draws imported materials, as the reference does.
- Morgan and Imani are unchanged; their tiers pass no component list.
- No component met the +10% cost bar here, so the trial ships switched off.
  Three of four measurement runs have one case over (Jevica ×1, Jevica ×8,
  Sable ×24). The paired medians nearest the bar are Jevica ×8 at +8.5% and
  Sable ×24 at +4.3%. Run-to-run noise on this shared host is about the size of
  the bar, and no physical device was measured.
- No human has signed off on the look; the verdicts rest on this session's reading
  and an independent agent's. #517 stays open for its AAA and all-device criteria.
