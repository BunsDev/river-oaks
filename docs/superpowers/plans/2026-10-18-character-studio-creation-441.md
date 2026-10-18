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

## Gaps and next steps

Not claimed: human keyboard, VoiceOver or novice acceptance (#444 protocol),
physical touch devices, #442 garment fit in the required poses, or #443
publication.
