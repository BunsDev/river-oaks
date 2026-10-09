# Landing page to the October 9 mockup

## Objective and authority

The user supplied `ChatGPT Image Oct 9, 2026, 07_26_13 AM.png` (1625 × 968) and
asked for the landing page to match it exactly. Branch `feat/landing-mockup` from
`origin/main` `1018d0c`, worktree `.worktrees/river-oaks/landing-mockup`. Files owned:
`landing-page/` only. Codex's concurrent sign-in work edits `preview/index.html` and
`access-gate.css`, which this branch does not touch.

## Findings

The live page already had the mockup's structure and copy. The differences:
- **Artwork:** new art throughout, a mythic-dress cast in place of the streetwear and anthro cast.
- **Palette:**
  - Always dark, with neutral grey secondary text instead of mauve.
  - A paler pink button with dark plum text, and a mauve outline on Explore.
- **Hero copy:**
  - The intro paragraph is visible; a container query hid it below 640 px of hero height.
  - The tagline is plain white with no pink italic "you".
  - Buttons are 182 × 42, smaller than before.
- **Tighter type:** slightly smaller pathway, card and footer type, 26 px gutters,
  and a 47 px card caption row.

No full-resolution export of the new art exists. `~/Downloads/the-greeks.png` is a
full-body character sheet in a different composition, not a source for these scenes.

## Changes

- **Art:** cropped from the mockup at native size, with its baked text removed by
  OpenCV Telea inpainting (`landing-page/assets/README.md` records the crop boxes).
  - `pantheon-hero.jpg` (1621 × 591)
  - `pantheon-avatars.jpg`, `district-fountain.jpg`, `pantheon-supper.jpg` (514 × 172 each)
- **Dialogs:** each reuses the hero art, framed with its own `--focus`.
- **Retired art:** the old streetwear JPEGs are removed; they remain in git history.
- **Palette and color scheme:** a dark-only `color-scheme` with tokens sampled from
  the mockup. The CSS hero shade is reduced to a narrow left guard, because the art
  carries its own shading.
- **Metrics:** title `16cqh`, tagline 20 px/600, intro 13.3 px with 21 px leading at
  372 px, buttons 42 px with 6 px corners, the Mac row 48 px.
- **Intro rules:**
  - The intro shows down to 480 px of hero height.
  - Phones keep the previous behaviour: the intro is hidden below 640 px, so the copy
    stays clear of the bright top of the art.
- **Mac download:** points to the published v0.1.6 release
  (`TypeSafe-Place-0.1.6-macOS-arm64.zip`), instead of the stale v0.1.3 the mockup
  copied from the old page.

## Checks

- [x] A render at 1625 × 968 (dark, 1×) compared with the mockup side by side, by
      glyph rows and element boxes:
      - the hero is 0–591
      - pathways 595–685
      - cards 693–914 with the image 694–866
      - footer 928–968
      - hero copy rows within 1–3 px of the mockup
- [x] 1440 × 900 at 2× with the OS set to light (renders dark), 390 × 844 at 3× mobile,
      and the avatars, world and community dialogs on laptop and mobile. No page
      errors, no failed requests, and no horizontal overflow.
- [x] `npm run verify -- web` passed (receipt `.runtime/agent/web.json`). The built
      `dist/preview/index.html` references only the four new images and links v0.1.6.

## Limits

- The art is the mockup's own pixels, so it's soft on 2× displays. A full-resolution
  render of the same scenes would sharpen it, and only the files would change.
- Light mode is gone by design: the page is always dark.
- Not verified: Safari or Firefox, human accessibility review, or the production
  deployment.
