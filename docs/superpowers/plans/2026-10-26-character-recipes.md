# Character recipes (2026-10-26)

Task `character-recipes-20261026`. Branch `feat/character-recipes-20261026` from main
8b73888a, in the worktree `../river-oaks-character-recipes-20261026`. Owner:
claude:ios-draw-budget-289 (4c25a886).

Val asked on 2026-10-26: "update the character studio to focus on a random starting
point and combination of customizable face and looks down to things like nose, mouth,
eyes, cheeks, brows, skin color, height, body type, gender, shoes, hairstyle, hair
color, outfits, dresses, suits, tops, bottoms, shoes, and colors, eye colors, etc".

That request supersedes, for this task, the #517 and #441 ledgers' rule to keep face
and body controls unavailable (`2026-10-18-character-fidelity-517.md:466-467`,
`2026-10-18-character-studio-441-integration.md:27-45`). Their other constraints still
hold:
- exact validation;
- pinned assets with receipts;
- human-only, generic characters, with no uploads and no likeness;
- tier and quality never stored in the record;
- the per-figure draw and resource budgets.

## Baseline (main 8b73888a)

The studio offers 13 authored looks. Only Sable takes colours: 5 dress and 4 hair. A
version 1 or 2 record must equal the definition rebuilt from
`(ownerId, appearanceId, revision, palette, hair)`, and `parameters` must be `{}`
(`character-definition.js`). Nothing about face, skin, eyes, height, body, hairstyle
or separate garments reaches players.

Shipped CC0 building blocks, currently used only for NPC residents:

- **Six body bases** with 27 face targets each: `woman-casual`, `woman-tailored`,
  `woman-daywear`, `man-casual`, `man-tailored` and `man-workwear`. Two of these
  (`man-casual`, `man-tailored`) already back player looks; the other four are not
  pinned in `character-assets.js`.
- **Per-rig materials.** Each base has exactly one skin, one hair, one suit, one iris
  (`brown*`) and one shoes material. Its suit and hair come with it:

  | Base | Skin | Suit | Hair | Shoes |
  | --- | --- | --- | --- | --- |
  | `woman-casual` | `young_african_female` | `female_casualsuit01` | `bob01` | `shoes02` |
  | `woman-tailored` | `middleage_caucasian_female` | `female_elegantsuit01` | `bob02` | `shoes02` |
  | `woman-daywear` | `young_asian_female` | `female_casualsuit02` | `ponytail01` | `shoes01` |
  | `man-casual` | `young_caucasian_male` | `male_casualsuit02` | `short01` | `shoes01` |
  | `man-tailored` | `middleage_african_male` | `male_elegantsuit01` | `short04` | `shoes03` |
  | `man-workwear` | `middleage_asian_male` | `male_worksuit01` | `short02` | `shoes04` |
- **Face (`resident-face.js`).** 25 face shapes in single-direction targets, baked per
  resident at load, after which the morphs are stripped.
- **Hairstyle (`resident-hairstyle.js`).** Moves any of the 7 hairstyles to any of these
  heads and refits it.
- **Colours (`resident-style.js`).** Hair colour by measured texture means, which
  lifts near-black hair, and garment tints by material name.

## Phase 1 design: shipped assets only

### The record

The record is version 3, `appearanceId: 'custom-human'` (a new shared appearance), with
`rig` set to the chosen base and `outfit` equal to the base. `parameters` is the recipe.
Every value is an integer or a catalogue key, so the server validates by rebuilding
the record and comparing it exactly. Recipe fields:

| Field | Values |
| --- | --- |
| `body` | one of the six bases (feminine or masculine frame, with its outfit) |
| `height` | 150–200 cm |
| `face` | the sliders below |
| `skin` | one of about 10 tones; each base's own texture is gained toward the tone |
| `eyes` | iris colour key; a generated iris texture replaces the rig's brown |
| `hairStyle` | one of 7, or the base's own |
| `hairColor` | key, using `resident-style.js` gains |
| `outfitColor` | key; tints the suit material |
| `shoeColor` | key; tints the shoes material |

The face sliders are integers from -100 to 100, or 0 to 100 for one-sided shapes,
mapped onto the 25 targets. Weights are capped at about 0.7 to avoid caricature;
left and right are driven together.

| Feature | Sliders |
| --- | --- |
| Head | shape (square to triangular) |
| Nose | width, length, hump, tip |
| Mouth | width, upper lip, lower lip |
| Chin | prominence, width, height |
| Cheeks | cheekbones, fullness |
| Eyes | size, spacing |
| Brows | height |

### Random starting point

The first time the Studio opens in a visit, it starts from a random recipe, staged as an
unsaved draft; the town look doesn't change until Wear. A visit is the tab's session
(`sessionStorage`): a reload, a reconnect or world travel reopens on the worn look. "Your own" is the first chip in
the character roster:
- choosing it shows the recipe editor in place of the wardrobe and colour steps;
- choosing an authored character goes back to the authored steps, and the character
  last shown returns with its colours.

In Your own:
- "Surprise me" re-rolls every category that isn't locked;
- each category has its own dice (Roll …) and lock (Keep … when surprising);
- Undo walks back through every edit, to the worn look.

### Rollout

Older builds don't know `custom-human`, so they show the account's authored fallback.
That is acceptable, and it will be documented.

### Delivery: one branch

The record, rendering and the Studio landed together on this branch as one draft PR,
because none of them is usable alone. The earlier plan split this into three PRs (A
record, B rendering, C studio). The scope inside each part is unchanged:
- **Record:** `character-recipe.js`, the version 3 definition and the `custom-human`
  appearance, plus pins for the four unpinned bases, with receipts.
- **Server:** selection, checkpoint and route tests.
- **Rendering:** the recipe applied in `avatars.js`, `player-avatar.js`,
  `remote-players.js`, the hero and the studio preview, plus culling tests and garment
  rebakes.
- **Studio:** the editor, the random start, dice, locks, guide text and journeys.

`docs/character-studio.md` gains a "Your own" section before "Signed account deletion", which is left alone. Its owner (`account-safety-292`, session 0b) agreed on 2026-10-26.

## Phase 2

- **Body build** (slim to broad), by bone scale within garment fit.
- **Two-tone outfits** (top and bottom), using a UV mask on each suit texture.

## Phase 3: needs Val's authorization

Separate tops, bottoms, dresses and suits on any body, more shoes, and face targets
on the Jevica and realistic bodies. This needs the pinned MakeHuman asset download
(`scripts/fetch_character_assets.py`), Blender rebuilds, and re-running the garment
bakes, which hash the rigs.

## Checks

- Focused behavioural tests that fail on main.
- `pnpm run verify`.
- The character journeys: `character-recipes` (new), `character-studio`,
  `character-studio-layout`, `character-portrait`, `character-studio-shared`,
  `character-studio-paused`, `character-studio-worlds`, `character-studio-tiers` and
  `character-fidelity`.
- Inspected captures of faces, heights, skins, eyes, hair and outfits, both in the Studio
  and in town.

## Results

Recorded on the uncommitted branch at base 8b73888a (2026-10-26).

- **Unit and server suites:** the character, studio, guide, resident, remote-player,
  player-avatar and server character suites all pass, together with the asset audit,
  the garment bake tests and `bake-provenance`.
  - 405 tests: 361 pass, 44 skipped. Every skip is a Redis-gated server case (`redis: …`)
    that core runs without Redis.
  - `node scripts/character-assets-audit.mjs` exits 0 for all nine rigs.
- **Tests that fail on main:** the eight changed test files were run against a
  `git archive` of 8b73888a. Assets and `node_modules` were linked from this worktree,
  and the log is `.runtime/recipes/tests-on-main.log`.
  - Result: 7 fail and 30 pass.
  - The failures are the new Studio "making your own", guide "your own look" and
    culling "player-made recipes" cases.
  - `character-recipe.test.js`, `character-recipe-look.test.js`,
    `character-equip.test.js` and `character-world.test.js` fail at import (no recipe
    catalogue or version 3 record).
  - The existing cases pass on main.
- **Culling:**
  - Every recipe body was checked at 150 cm with donor ponytail01 and at 200 cm with
    donor bob02, with every face slider at 100.
  - In every remote pose, all skinned vertices stay within 0.754 of the figure sphere,
    against a limit of 0.97.
  - A transplanted hairstyle hides the body's own hair rather than drawing both.
- **Bake provenance:**
  - `avatars.js` and `resident-style.js` are bake inputs, and the two recipe modules now
    reached from `avatars.js` were added to `avatarInputs`, so the five garment bakes
    were rerun with `--write`.
  - All six `*-morph-data.js` files are byte-identical (`shasum -c`); only the receipts'
    input hashes change.
  - `bake-provenance` and the garment bake tests: 54 of 54 pass.
- **Browser journeys, first valid run** (snapshot of the working tree, 00:14–01:30Z; log
  `scratchpad/recipes-browser-3.log`):
  - **Passed:** `character-studio-layout`, `character-portrait`, `character-studio-paused`,
    `character-studio-tiers` and `character-fidelity`.
  - **Failed:** `character-recipes` and `character-studio`.
    - The cause was this branch's bug. The preview recorded its loaded look as
      `host.dataset.look`, so the preview host also carried `data-look`. The Studio fills
      its caption with `$('[data-look]').textContent`, and the host comes first in the
      DOM. After the first figure loaded, every edit replaced the preview's canvas with
      the look's label.
    - In both failure captures the preview pane is blank, with the label in its corner.
    - Fixed: the preview now writes `data-loaded-look`. `character-recipes` checks that
      an edit keeps the canvas, its label and the caption.
  - **Wrong runner:** `character-studio-shared` and `character-studio-worlds` failed
    because they belong to `shared-runner.js` (development mode).
    - Under the experience runner, garden-2 doesn't exist ("World not found."), so the
      worlds failure says nothing about this branch.
    - The shared reconnect check did conflict with the random start, which was then
      per page load. See "Hosted checks on #694" below.
    - Hosted `preview shared (development)` runs both, with `character-studio-tiers`.
- **After the fix:** focused character, studio, culling and server character tests pass,
  137 pass and 2 skipped (`.runtime/recipes/focused-2.log`). The six experience-runner
  journeys are queued again from a snapshot of the fixed tree.
- **Core gate:** three runs failed in one tooling test only, "a queued lander wakes on
  release…". It timed out at 30 s while other sessions' suites ran. The stage alone
  passes, 276 of 276. The logs are `.runtime/recipes/verify-{1,2,3}-land-wake-flake.log`.
  - The fourth run, on the fixed tree after waiting for a 1-minute load under 15, passed
    (01:48–01:55Z, load 13.7; `.runtime/recipes/verify.log`, `.runtime/agent/core.json`):
    276 of 276; 4184 pass, 1 skipped; 917 pass, 225 Redis-gated skips; 120 pass,
    3 skipped.

- **Hosted checks on #694 at 2f5cefd0:** 21 of 23 green.
  - `preview shared (development)` passed, including `character-studio-shared`, which then
    expected a random start after the reload, with one Undo back to `rose`.
  - `preview shared (worlds-and-creator)` failed in `character-studio-worlds`: "Reopened
    Studio retains the saved look after travel and retry". The aggregate `preview` failed
    with it.
  - Both journeys require a reopened Studio to show the saved look after a reconnect or
    world travel. A random start on every page load discarded that.
  - Fix: the random start happens once per tab session (`sessionStorage`), so reloads and
    world travel reopen on the worn look. `character-studio-shared` is back to main's
    version, and the two hosted journeys are its regression.
  - Core gate on the fix: passed, 02:28–02:35Z at load 13.3. 281 of 281; 4226 pass,
    1 skipped; 928 pass, 227 skipped; 127 pass, 5 skipped. Studio and recipe tests:
    23 of 23.

- **Experience journeys after the preview fix** (snapshot, 01:35–03:02Z;
  `scratchpad/recipes-browser-4.log`):
  - **Passed:** `character-studio`, `character-studio-layout`, `character-portrait`,
    `character-studio-paused` and `character-fidelity`.
  - **Failed:** `character-recipes`, again on "A face slider changes only its own
    feature", from a second bug in this branch.
    - Rolls drew face values on any integer, such as −49, while the slider steps by 5.
      The browser showed −49 as −50 on its slider, and four key presses moved the face by
      19.
    - Fix: `FACE_STEP = 5` is shared by the rolls (20–80 in steps of 5), the slider and
      validation, which rejects values off the step.
    - New test: "every rolled face value is one its slider can show". Against the old
      module, it and the extended tamper list (−49, 33) fail.
    - Focused: 144 pass, 2 skipped (`.runtime/recipes/focused-step.log`).
- **Journeys with the step fix** (03:04–03:06Z; `scratchpad/recipes-browser-5.log`):
  - `character-studio` passed. `character-recipes` passed the face-slider checks, then
    failed on a third bug in this branch: "Keep skin when surprising" could not be
    clicked, because the Tan swatch lay over it.
  - Each category's 44 px dice and lock sat at `top:-12px` beside a legend about 24 px
    tall, so the category's first row of content covered their lower half. The first
    capture shows the same overlap on Body's controls and on the face's "Chin and jaw"
    heading.
  - First fix (a 44 px legend row, with the tools at `top:0`) made it worse: the new check
    found nearly every button covered (03:07–03:10Z; `scratchpad/recipes-browser-6.log`).
    In a fieldset, absolute positions start below the legend, so `top:0` is the first row
    of content.
  - Fix: each category is a `div` holding its fieldset and, beside it, the tools, aligned
    with a 44 px legend row. Inside the legend, the buttons would join the group's name.
  - `character-recipes` now checks that every roll and keep button is the topmost
    element at its centre.
  - `character-recipe.js` is a garment-bake input, through `avatars.js`, so the five
    receipts were rebaked. The morph data is byte-identical, and the bake and provenance
    tests pass, 390 of 390.
  - With the tools fixed, `character-recipes` reached its frame step for the first time
    and failed there (03:13–03:16Z; `scratchpad/recipes-browser-7.log`). It clicked the
    label text "Feminine", which the label's transparent radio covers by design. It now
    clicks the radio by role, as the other Studio journeys do. The whole journey then
    passed, 03:19–03:21Z (`scratchpad/recipes-browser-8.log`).
  - The passing run's first capture showed the face sliders 30–40 px wide. At 1100 px and
    up, the face had four fixed columns of about 154 px, beside a 6.2em label and a 2.8em
    value. The columns are now at least 15rem: two in the Studio's pane, more on wider
    screens. `character-recipes` checks that all 16 face sliders are at least 120 px wide.
  - With the column fix, `character-recipes`, `character-studio-layout` and
    `character-studio` passed (03:23–03:25Z; `scratchpad/recipes-browser-9.log`).
- **Skin tones** (found by inspecting the random-person captures):
  - The swatches were display colours used as albedos. Porcelain needed per-channel gains
    of 1.3–1.6 in red and 2.8–3.3 in blue, so it and Fair rendered chalk-white.
  - Brown brightened a deep texture 2.3x into saturated orange, and Golden brown on
    `woman-casual` hit the gain cap (4.08).
  - Captures of all ten tones on `woman-daywear` and `man-tailored`, before and after:
    `scratchpad/skins-compare.png`, from the local tool `preview/e2e/recipe-skin-captures.js`
    (not committed).
  - Fix: the tones are albedos. They step evenly in luminance from 1.45x the shipped
    light skins' mean to 0.75x the deep ones', with hue interpolated between them.
    - Worst channel spread over the six bodies: 2.20 before, 1.37 after.
    - Largest gain: 3.30 after, within the cap.
  - New test: "every skin tone is a near-uniform gain of the texture each body wears for
    it". It fails on the old palette (`woman-daywear porcelain … 1.46 2.15 2.87`).
  - Receipts rebaked again, with byte-identical morph data. Focused tests: 167 pass, 2
    skipped (`.runtime/recipes/focused-skin.log`). Bake tests: 381 of 381.
  - Main 9ee35b4c is merged, bringing #693's queue-wake recheck. One more core run at
    03:08Z failed only the land-PR wake test that #693 fixes
    (`.runtime/recipes/verify-step-1-land-wake-flake.log`).
- **Hosted checks on 1cb4d8fc:**
  - `preview shared (worlds-and-creator)` passed, including `character-studio-worlds`.
  - `preview shared (development)` failed in `crime-shared` ("A timed evade (U) beats the
    rival's telegraphed counter"), as main's run 40420131202 does, before
    `character-studio-shared` ran. That job was rerun.

## Gaps

- Phase 2 and Phase 3 aren't started; Phase 3 waits for Val's authorization.
- Builds older than this branch show the account's authored fallback for a
  `custom-human` record.
- Each slider edit reloads the preview avatar from the cached rig, rather than morphing
  it live.

- **Final tree (60e2351c):**
  - Experience journeys passed (03:36–03:38Z; `scratchpad/recipes-browser-10.log`):
    `character-recipes`, `character-studio`, `character-studio-layout`,
    `character-portrait`, `character-studio-paused` and `character-fidelity`.
    - The random people in its captures read as natural skin, light to deep.
  - Core gate: passed, 03:36–03:41Z (`.runtime/agent/core.json`):
    - 284 of 284;
    - 4239 pass, 1 skip;
    - 972 pass, 251 skips;
    - 127 pass, 5 skips.
- No WebKit, phone-hardware or human visual acceptance.

## Next

Hosted checks on the pushed head of #694, including the shared Studio journeys
(`character-studio-shared` has not yet run past `crime-shared`, which fails the same way
on main and other branches). Merging awaits Val; Phase 3 awaits Val's authorization.
