# Character Studio #441: guided creation flow

## Objective

Advance #441 with a novice-friendly guided start and accessible choice controls on
the existing Studio editor. Every exposed choice still comes from the validated
catalog and the v2 definition contract. This increment adds no new assets, morphs
or colors.

## Ownership and base

- Task `character-studio-creation-441-20261018`, owner `claude:river-oaks-a9 (6cf0a612)`.
- Branch `feat/character-studio-creation-441-20261018` in the sibling worktree
  `river-oaks-character-creation-441`, based on the pushed #464 head `45b5ac0b`.
- Val, 2026-10-18: take #441 as a new draft PR stacked on the stack tip. Codex
  (`codex-character-studio-20261015`) keeps #461–#464 and the garment and
  persistence work. Updates flow one way: this branch merges Codex's pushed
  commits, and never pushes to Codex's branches.

## Files owned

- `preview/src/character-studio-guide.js` (new): roster, per-character choices and
  spoken look descriptions, derived from `SHARED_APPEARANCES` and the color allowlist.
- `preview/src/character-studio.js`, `preview/src/character-studio.css`: guided steps,
  native radio groups, character summary, wardrobe segments, in-place color
  compatibility, announcements, keyboard undo from a focused choice, and the status
  for an unedited look.
- `preview/tests/character-studio-guide.test.js` (new).
- Journeys whose selectors change: `preview/e2e/character-studio.js`,
  `character-portrait.js`, `character-studio-shared.js`, `character-studio-paused.js`.
- `docs/character-studio.md` (#441 section) and this ledger.

## Round 1 (2026-10-18)

### Usability audit of the stack tip, before any change

The audit ran in real Chromium (Metal ANGLE) against the fixture server, with the
owner fixture, desktop 1440×1000 and phone 390×844.

- Opening the Studio said "You have unsaved edits" before anything was edited.
- The character roster, five dress swatches and four hair swatches were separate
  toggle buttons: 17 tab stops in the creation area, all announced as buttons.
- Form was a bare Human/Beast select. The town picker beside it shows
  "Humanoid / Beast · White fox".
- Seven of eight characters showed disabled color swatches. The reason was the last
  line of the panel, below the fold.
- Characters without outfit choices still showed a disabled one-item Wardrobe select.
- Undo, redo, Surprise me and restoring a favorite changed the look silently for
  screen readers, and Ctrl/Cmd+Z was ignored whenever focus was on a choice.

### Change

- Numbered steps: 1 Choose a character, 2 Choose a form (with Wardrobe only when a
  character has several validated outfits), 3 Add color.
- Native radio groups, the same pattern as the town picker: one tab stop per group,
  arrow keys, and the full chip or swatch as the touch target.
- A summary card shows the character's name, title, the current look's authored
  description, and exactly what can change ("You can change the form, dress color
  and hair color.").
- Unsupported colors are withheld, with the reason given in place ("Rowan's colors
  stay as designed for now. Choose Sable to try dress and hair colors.").
- A polite live region announces undo, redo, Surprise me, favorites and
  before/after. Favorites are listed by their full description.
- Opening an unedited look says "This is your current town look." The save and
  wear logic is unchanged (#443).

### Verification

- `node --test preview/tests/character-*.test.js`: 57 passed, 0 skipped
  (3 new guide tests).
- Browser probe (`.runtime/cs441/look-v1.log`, captures `v1-*.png`): arrow keys move
  the dress color; Ctrl+Z on a focused radio undoes and announces "Undone: Sable,
  Humanoid form, Ivory dress, Ash blonde hair."; Kai's summary and three
  wardrobes; a phone tap changes the color; no horizontal overflow at 390 px.
  Console showed only the fixture's absent-backend 503s.

- First editor journey (`.runtime/cs441/editor-run1.json`): 27 checks passed in
  77 s, up from 21 on #461. Captures inspected: desktop, fox with rose dress and
  espresso hair, phone, walk and wave.
- First regression run (`.runtime/cs441/regressions-run1.json`): character-portrait
  15, character-studio-paused 6, character-studio-disabled 6, player-forms 139,
  rail-navigation 78 and player-lifecycle 19 checks passed. beast-movement failed
  with a strict-mode violation: the Studio's new `[data-species]` collided with the
  journey's page-wide locator for the town picker. The dialog stays in the DOM
  while closed. All new Studio hooks are now namespaced `data-cs-*`, and the
  wardrobe container no longer writes `data-character`. On rerun, beast-movement
  passed.
- The rerun's editor journey then hit ENOSPC writing a screenshot. Swap held 26.8
  of 27.6 GB, with 117 MB free. The coven-cave dev server (`server.ts`, up 2 days)
  held 16 GB. Val approved stopping it, and free space recovered to 7.4 GB. That
  failure says nothing about the code.

### Creative tools: Remix and a Surprise that always changes something

- `draft.randomize()` could restage the current look, so Surprise me silently did
  nothing. Both `randomize()` and the new `remix()` now pick a look uniformly (so
  Sable's 20 color variants do not crowd out the other looks), then one of its
  variants other than the current one. Remix stays with the current character's
  validated forms, wardrobes and colors. The "Remix <name>" button announces its
  result. A unit test covers constant random sources and the Kai and Sable cases.

### Independent review (subagent, read-only) and fixes

1. The "current town look" status compared against the look at open time. After
   Wear followed by Undo, it would mislabel the old look. It now compares against
   the live `getDefinition()`.
2. Undo or redo that hid the focused swatch or wardrobe, or disabled the focused
   button, dropped focus to `<body>`. Focus then left the dialog's key handling,
   and gameplay keys could reach the town behind the modal. `step()` now moves
   focus to Redo or Undo, or else to the selected character. Covered by a journey
   check.
3. The status check could race the account load. The journey now waits for
   `accountPhase==='ready'`.
4. If the preview failed to start, `render()` was skipped and the radios kept stale
   selections. `render()` now runs after the try/catch.

### Final-source verification (2026-10-18, base 45b5ac0b plus this change)

- `node --test preview/tests/character-*.test.js`: 58 passed, 0 skipped.
- `pnpm run test:experience character-studio character-portrait character-studio-paused
  character-studio-disabled player-forms beast-movement rail-navigation player-lifecycle`:
  all 8 passed, 309 checks. Editor 29 (82 s), portrait 15, paused 6, disabled 6,
  player-forms 139, beast-movement 17, rail-navigation 78, player-lifecycle 19
  (`.runtime/cs441/final-run.json`).
- `RIVER_OAKS_SHARED_JOURNEY=character-studio-shared pnpm run test:shared required`:
  passed, 81 checks in 72 s (`.runtime/cs441/shared-run.json`).
- `pnpm run verify` (core): passed (`.runtime/cs441/core.json`). Tooling 117/117;
  preview 3423 of 3425 passed, with 1 existing skip and 1 todo; server 667 of 872
  passed, with 205 Redis-dependent skips because there is no `REDIS_URL`; desktop
  69/69; build; Python 141 passed. Redis, browser-full, native, live auth and
  production acceptance were not run.

### Merge of #464 head 594cceb1 (2026-10-18)

Codex pushed `594cceb1`, which adds the `character-studio-worlds` journey, written
against the old button and select markup. A signed merge brought it in (`8a14a081`),
and its selectors were moved to the radio groups. After the merge: unit 58/58, and
`RIVER_OAKS_SHARED_JOURNEY=character-studio-worlds pnpm run test:shared development-world`
passed with 27 checks in 73 s (`.runtime/cs441/worlds-run.json`).

## Round 2: phone layout (2026-10-18)

- Measured before the change (`.runtime/cs441/phone.mjs`): with the dress swatches
  on screen, **0 px** of the preview was visible on 390×844 or 375×667. The
  390 px stage scrolled away with the controls.
- Change, phones only (≤700 px): the stage is sticky with
  `--cs-stage-h: clamp(230px, 40dvh, 340px)`. View, Light and Pose share one
  row; their labels stay in the accessibility tree. The Rotate label is
  visually hidden. The header is compact. The footer drops its duplicate
  "Close studio", since the header ✕ also closes and keeps edits. The workspace
  gets `scroll-padding-top` equal to the stage height.
- After: 234 px of preview at 390×844 and 163 px at 375×667, beside the swatches.
  Focus probe (`.runtime/cs441/focusprobe.mjs`): after scrolling to the bottom,
  focusing the selected character puts it at 527 px, below the stage's bottom edge
  at 403 px. With scroll padding removed it lands at 358 px, under the stage, so
  the journey check can fail.
- `character-studio` journey: 31 checks passed in 97 s
  (`.runtime/cs441/phone-run.json`). Two new phone checks cover preview visibility
  and focus not obscured. Unit 58/58. `pnpm run build` passed.

## Round 3: preview label and shortcut hints (2026-10-18)

- The preview canvas (`role=img`) is labelled with the look it shows ("Live
  preview: Sable, Humanoid form, Rose silk dress, Espresso hair"), or "Original
  look: …" during before/after. It used to read a static "Live character preview".
- Undo and Redo declare `aria-keyshortcuts` (Control or Meta+Z, plus Shift for Redo).
- `character-studio` journey: passed, 33 checks in 87 s (`.runtime/cs441/a11y-run.json`).
  Unit 58/58.

## Round 4: automated accessibility audit and a keyboard-only path (2026-10-18)

- axe-core 4.10.3, injected for the audit only and not added to the repo
  (`.runtime/cs441/axe.mjs`, `.runtime/cs441/axe-report.json`). It ran over
  `.character-studio` with the wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa and
  best-practice rule sets, in six states: open as Jevica, Sable edited, and Kai
  comparing, each on desktop 1440×1000 and phone 390×844. **0 violations**
  (28–29 rules passed per state). The only incomplete rule was color-contrast:
  the modal sits over a blurred backdrop, so axe could not resolve backgrounds.
- Contrast measured directly (`.runtime/cs441/axe2.mjs`): every text style is at or
  above 4.5:1. Lowest: summary title and small species line 4.55; help,
  color-name, footer and portrait text 4.85; eyebrow 5.0; summary description
  5.02; status 5.34. Legends and roster names 10.17.
- A keyboard-only path was added to the editor journey. Enter on the Studio entry
  opens it. Tab reaches the character group, where arrows pick Sable; then form,
  where arrows pick the fox; then dress and hair colors. Ctrl+Z and Ctrl+Shift+Z
  work. Tab reaches Save draft, and Enter saves it ("Private draft saved").
  Escape closes and returns focus to the entry. No pointer events are used.
  `character-studio` passed with 43 checks in 132 s (`.runtime/cs441/keys-run.json`).
- The hosted preview cannot be used for human or device sessions. The Preview
  environment does not define `VITE_CHARACTER_STUDIO` (checked by name only), so
  preview builds omit the Studio. The local fixture issues loopback-only
  identities, so a physical phone cannot sign in to it.

## Round 5: a sign-in-capable branch preview for human sessions (2026-10-18)

- Before: the #484 preview answered `/auth/session` with 503 `auth_unavailable`.
  Previews have no Redis namespace, public origin or cookie secret, and the server
  refuses to share the production town (`server/redis-backend.js`).
- Val approved a full branch preview. Five Preview variables were added, scoped
  to `feat/character-studio-creation-441-20261018` only:
  - `REDIS_NAMESPACE=river-oaks:preview:cs441:v1`, an isolated keyspace;
  - `PUBLIC_ORIGIN` set to the branch alias;
  - `RIVER_OAKS_CHARACTER_STUDIO=1`;
  - `VITE_CHARACTER_STUDIO=true`;
  - a generated, sensitive `WORKOS_COOKIE_PASSWORD`, never printed.
  Production and every other branch are unchanged.
- Redeployed as `river-oaks-ffav4xfqd` (Ready). At the branch alias
  `https://river-oaks-git-feat-character-studio-creation-441-dcb2ad-0xbuns.vercel.app`,
  `/auth/session` now answers 200 `{"authenticated":false}` and
  `/api/waitlist/status` answers 401 `sign_in_required`.
- Email-code sign-in needs no callback allow-list. GitHub sign-in would need
  `<alias>/auth/callback` allowed in WorkOS. No email was sent from automation.
- To remove later: `vercel env rm <NAME> preview feat/character-studio-creation-441-20261018`
  for each of the five variables, then delete the `river-oaks:preview:cs441:v1*`
  keys if the namespace is retired.

## Round 6: pose matrix of every exposed look (2026-10-18)

- `.runtime/cs441/poses.mjs` captured 22 looks (owner view) × 4 poses: idle
  front, walk front, walk side (90°) and wave front. The captures came from the
  Studio's own motion-enabled preview, on the tree with #464 merged through
  `dd23161f`. 88 captures, 0 page errors. Contact sheets and raw captures:
  `~/Documents/river-oaks-evidence/cs441-poses-20261018/`.
- No major visible intersection for Jevica, Sable (human and fox), Rowan,
  Vesper, Lyra or the four Silvan looks.
- Open, in the #442 coat lane (reported in #442 comment 6247112528):
  - Kai's celestial formal and noir coats render as flat rectangular panels and a
    chest plate.
  - Aurel's and Kai noir's walking coat backs are one flat sheet with a hard
    waist edge, and a dark bar stands up behind the shoulder.
  - No garment code was changed here. #441's pose criterion depends on that fix.

## Round 7: the summary names edited colors; the Wave pose checked (2026-10-18)

- After a recolor, the summary card still said "an ivory city dress" beside a rose
  preview. It now adds "Your colors: Rose silk dress, Espresso hair." whenever the
  colors differ from the authored ones. `character-studio` passed with
  44 checks in 141 s (`.runtime/cs441/summary-run.json`). Unit 58/58.
- The preview's Wave pose, captured every 400 ms for about 4 s
  (`.runtime/cs441/wave-strip.png`), holds the right hand near the chest with
  only a small forearm wiggle. It is the town's own `'wave'` gesture
  (`resident-gestures.js`), so the Studio shows what other players see when
  you wave. Its look belongs to the motion system, not #441, and the label is
  unchanged.

## Novice trial kit (#444 protocol, prepared 2026-10-18, not yet run)

Val recruits five people. Nothing here has been sent. The criteria come from the
"Usability trial protocol" in `docs/character-studio.md`. They are fixed before
the first session and are not lowered afterwards.

**Recruiting note (for Val to send):**
> I'm testing a new character creator in a small online town and would love 20
> minutes of your time. No prep and no right answers. You'll make a look for a
> character on a phone or laptop while I watch quietly and take notes. Nothing is
> recorded without your OK, and I won't keep your name with the notes. Reply with
> a time that suits you.

**Consent (read aloud, note the answer):** "I'll note what you do and say, under a
code like P1, with no name. I'll only record the screen if you say yes, and you
can stop at any time. Is that OK? And is screen recording OK?"

**Facilitator rules:** explain the goal, not the controls. Don't coach until the
person asks for help or has been stuck for 60 seconds, and log every hint. Use a
fresh account with no saved favorites. Note the exact commit, browser, device and
fixture configuration.

**Task card (hand over one at a time):**
1. Open the character studio from People, choose a character, and make a version
   you like.
2. Undo one change, compare with how it started, and save it as a draft.
3. Wear it in town, then check that a second player sees the same look. The
   facilitator runs the second window.
4. Reload the page, change the look again, and wear the new version.
5. The facilitator simulates a failed save. Get your edit back, then make a
   second, different look with any tools you find.

**Observation sheet (one row per participant):**

| Code | Device / input / assistive tech | Time from People to first Wear | Tasks 1–4 done without coaching | Help requests (time, what) | Mistakes and recoveries | Explains Save draft vs Wear? | Second distinct look? | Satisfaction 1–5 | Would make another? | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | | | | | | | | | | |
| P2 | | | | | | | | | | |
| P3 | | | | | | | | | | |
| P4 | | | | | | | | | | |
| P5 | | | | | | | | | | |

**Pass gate (fixed in advance):**
- At least 4 of 5 finish tasks 1–4 without coaching, within 5 minutes to the first Wear.
- All 5 recover their edit without losing it.
- At least 4 tell private save apart from shared wear, and make a second distinct look without help.
- Median satisfaction is at least 4 of 5.
- Any identity leak, permission bypass or lost saved work fails the trial, whatever the totals.

## Round 8: coat back panel, taken from the #442 lane with Val's approval (2026-10-18)

- Val chose "Take the coat fix". Codex had marked its goal blocked at 07:02Z and
  was idle, with no uncommitted coat files. The change stays outside the frozen
  coat bake (`coat-tail-morph-receipt.json` inputs unchanged; the provenance test
  passes).
- The bake receipt already proves 0 penetrating vertices and 0 edge crossings, with
  at least 2.5 cm clearance, so the coats met the intersection criterion. The
  visible problem was art: the tails' waist ring sits about 7 cm behind the back
  (measured: ring z −0.156 against a back at −0.083 m), a hard shelf in profile.
- `coat-back.js` adds a skinned 280-triangle panel from that ring to the shoulder
  blades (pelvis → `spine_02` → `spine_03`, back ±54° only). Beast tails root
  about 9 cm below it. Before and after captures:
  `.runtime/cs441/coats-compare-*.png`. The profile shelf is gone, and the coat
  now hangs from the shoulders.
- Checks: `coat-back.test.js` 6/6, with a negative control that fails when the
  panel is moved inside the back. Coat, batching, character and garment tests:
  92/92, with pinned triangle counts +280 for the six coat looks. The
  `character-wardrobe` journey passed 877 checks in 292 s, 0 crossings
  (`.runtime/cs441/wardrobe-run.json`).
- Still open for art review: the tails' flat front panels (a bake input) and the
  box lapels.

## Round 9: chest tailoring on the chest (2026-10-18)

- Close-ups (`.runtime/cs441/chest-sheet.png` before, `chest2-sheet.png` after)
  showed three problems:
  - Kai's waistcoat and Aurel's shirt were flat boxes whose tops stood off the
    receding upper chest as slabs.
  - The lapels were thick flaps.
  - Kai's embroidery points sat at a fixed depth (z 0.181) across x ±0.2 m, so at
    the sides they hung in the air beside the arms: detached attachments, in all
    three Kai outfits including explorer.
  - Also, Aurel's buttons had been 2 cm inside the chest, so they were never visible.
- First attempts were wrong. A measured table, then vertex-window sampling,
  either sank or floated pieces at the chest's edge, because the surface falls
  2–3 cm within a centimetre there and suit vertices are about 3 cm apart
  vertically.
- Fix: `measureChestFront` rasterizes the suit's skinned triangles into a 5 mm
  front-depth grid in the torso frame, once per avatar (1–4 ms median). The
  pieces now on that surface: a V-necked waistcoat, a curved shirt and vest,
  tapered lapels, and embroidery, brocade, buttons and chain.
- Checks:
  - `chest-tailoring.test.js` (4 looks) raycasts the skinned suit independently.
    Each chest vertex must be no more than 4 mm inside and no more than 3.5 cm in
    front. Negative controls fail as expected: panels sunk 1.2 cm are caught as
    inside, and stars lifted 6 cm as floating.
  - Related suites 128/128. Full preview suite 3452 of 3454 passed, with the
    existing 1 skip and 1 todo.
  - Triangles fall: Aurel 10,200, Kai formal 13,872, noir 15,216. Draws ≤ 17.
  - Journeys run with the browser lock bypassed at Val's request: character-studio 44 checks in 127 s; character-wardrobe 877 checks in 301 s
    (`.runtime/cs441/chest-journeys.json`). Close-ups are inspected in `chest2-sheet.png`.

## Round 10: coat fronts sweep back (2026-10-18)

- The tails' front edges hung as two straight vertical boards with a 14 cm gap.
  `coat-tail-geometry.js` now sweeps each front from 0.35 rad at the waist to
  0.75 rad at the hem (`.4·depth^1.4`), keeping the waist ring (radius ratio
  1.0000) and all 950 vertices.
- Rebaked deterministically (`bake-coat-tails.mjs --write`, then `--check`
  verified): Kai and Aurel 0 penetrating, 0 crossings, 2.5 cm minimum clearance,
  maximum stretch 3.09 and 3.08 (was 3.07). This is a bake input, so the receipt
  changes too.
- Coat, back, chest, batching, garment and skirt tests 51/51. Full preview suite
  3452 of 3454 passed, with the existing 1 skip and 1 todo. `character-wardrobe`
  877 checks passed, `character-studio` 44 passed
  (`.runtime/cs441/fronts-journeys.json`).
- Before and after: `.runtime/cs441/fronts-compare-*.png`. The fronts open in a V
  toward the hem. Broad waist-level tail panels remain a matter for final art
  approval.

## Round 11: Rowan's chest tailoring (2026-10-18)

- The chest test, pointed at Rowan, found his flat shirt box 1.8 cm inside the
  chest at the collar. Rowan uses the `man-tailored` rig, whose suit is
  `man-tailoredmale_elegantsuit01`, so the measurement now finds whichever suit
  the rig has.
- His shirt, lapels, pocket flaps (moved 2 cm inward, where the narrower suit
  front exists) and buttons now lie on the chest. `chest-tailoring.test.js`
  covers rowan-human and man-casual: 6/6 looks. Rowan triangles 7,644 → 6,416,
  14 draws.
- Related suites 128/128. Full preview suite 3454 of 3456 passed, with the
  existing 1 skip and 1 todo. Close-ups: `.runtime/cs441/rowan-after-sheet.png`.
- `character-studio` 44 checks and `player-forms` 139 checks passed
  (`.runtime/cs441/rowan-journeys.json`).

## Merge after the human-only Studio landed (2026-10-18)

- #496 (human-only Character Studio) and #464 merged at 11:53Z. #496 carried
  this branch through `7705cb25` to `main`, so #484 now adds only `a7d00be0`
  (Rowan) and `abac94b4` (the chest fallback).
- `fdefc2bf` merges `main` `153471bc`:
  - `character-definition.js` takes `main`'s import.
  - `reference-batching` keeps the human-only list, with Rowan at 6,416 vertices.
  - Docs status rewritten.
  - The five morph receipts are regenerated. They match `main`'s byte for byte
    and every bake passes `--check`.
- Checks on the merge, under load of 60–220:
  - Focused tests 26/26.
  - `pnpm run verify`: agent, build, Ruff, pytest, demo, demo verify (exit 2,
    as expected) and secrets passed.
    - Its one preview failure was the penthouse idle-slice timing test (85 ms).
      Its file passes 15/15 alone.
    - Server tests passed on rerun (668, 204 Redis skips). The first run had two
      timing failures.
    - Desktop tests 76/76 after reinstalling dependencies: `main` added
      `@electron/osx-sign`.
  - Journeys `character-studio`, `character-studio-disabled`,
    `character-studio-paused` and `character-studio-layout` passed. The layout
    journey passed on rerun; its first run caught the access gate still checking.

## Round 12: Val's device, keyboard and VoiceOver session (2026-10-18)

- Setup:
  - Code: `a0949092`.
  - Server: the local acceptance fixture at `127.0.0.1:5196`, with the Studio on
    and loopback dev identities. Its town server was restarted on the merged code.
  - Devices: Safari 27.0 on macOS 26.7.1, and the iPhone 16 Pro simulator (iOS
    26.5), whose Safari counts as loopback and signs in through the same fixture.
- Val's results, from a checklist mapped to the acceptance criteria:
  - **A. Keyboard only: pass.** Tab to "Open character studio", arrows through
    character, dress and hair, Cmd+Z and Cmd+Shift+Z, Save draft by Tab and
    Enter, then Escape back to the entry.
  - **B. VoiceOver on macOS, same path: pass.** Steps, groups, selected state,
    the live preview's look name and the save are announced.
  - **C. Reduce motion: pass.** The Studio works without animated transitions.
  - **D. Phone layout and touch in the simulator: pass.** Tapping changes the
    look, the preview stays in view, and cancel or undo restores the start.
  - **E. Novice self-check:** not reported.
- Not covered: a physical phone, VoiceOver on iOS, and the five-person novice
  trial (#444 protocol). A physical phone needs a sign-in-capable branch
  preview; its variables were removed at Val's request.

## Gaps and next steps

Not claimed: human keyboard, VoiceOver or novice acceptance (#444 protocol),
physical touch devices, #442 garment fit in the required poses, or #443
publication.
