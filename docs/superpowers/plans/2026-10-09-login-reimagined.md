# Sign-in gate: "TypeSafe, reimagined"

## Objective and authority

The user asked for the login page to match `~/Downloads/typesafe-reimagined.png`
(1586 × 992), using the characters from `Jev and Jevica at Golden Hour-1.png`
(1024 × 1536), and for it to fit all screens. The page is the `/play` access gate
(`preview/index.html` and `preview/src/access-gate.css`), which the desktop thin
client also shows. Branch `feat/login-reimagined` from `origin/main` `ab914a6`,
worktree `.worktrees/river-oaks/login-reimagined`.

**Overlap:** Codex has two undelivered sign-in redesigns of the same files, both
uncommitted and idle since 07:09:
- `codex/typesafe-login-aesthetic-20261009` in `river-oaks-realism-20261008`
- `codex/signin-typesafe-coven-20261009` in `river-oaks-signin-review-20261009`

This branch leaves them untouched. Delivering either alongside this one conflicts
in `index.html`, `access-gate.css` and `email-access.test.js`.

## Design

The mockup is a 1440 × 900 page rendered at 1.1×, so its pixel measurements ÷ 1.1
give the CSS sizes.
- **Split layout:**
  - On the left, the art, with the brand at the top and the headline at the foot over a dark scrim.
  - On the right, a `#151517` sign-in column (`clamp(360px, 33vw, 560px)`).
  - The form keeps every ID, field and admission behaviour.
- **Art:** the Jev and Jevica poster with its lettering removed by OpenCV inpainting.
  - Removed: the name blocks, the banner text, the side tagline, the script signature and the footer line.
  - Saved as `preview/public/assets/login/jev-jevica-golden-hour.jpg` (1024 × 1536, 341 KB).
- **Type:** self-hosted Latin subsets of Fraunces 500 (headline, 35 KB) and Outfit
  400–700 (UI, 32 KB), with their OFL licences, in `preview/public/fonts/typesafe/`.
  There's no third-party request on `/play` or in the desktop app.
- **Copy from the mockup:**
  - The scene kicker reads "River Oaks · Houston, reimagined".
  - The invite help reads "Sign in first, then redeem your invite."
  - The status message breaks after "GitHub." (`white-space: pre-line`).
- **Colour:** tokens sampled from the mockup. The grey help, divider and placeholder
  text is lifted to `#8e9094` for 4.5:1, and the field borders are `#6a6d70` for 3:1.
- **Fits all screens:**
  - **Side by side** at ≥ 860 px, and on landscape phones ≥ 600 px wide and ≤ 560 px tall.
    The column's top and bottom space are flex spacers that shrink first, so it fits
    without scrolling from 1024 × 768 to 2560 × 1440. Only a column that still can't
    fit, such as on a landscape phone, scrolls inside itself while the art stays put.
  - **Stacked** below 860 px: an art band (`clamp(300px, 58svh, 560px)`) with the
    brand and headline, then the form, scrolling as a page. Short phones drop the
    copy line.
- **Unchanged:** the admin review, invitations dialog and tools keep their previous
  light styling, with form rules scoped to `.access-gate`. The `.access-orbit` used
  by the multiplayer welcome card is unchanged.

## Checks

- [x] A render at 1440 × 900 at 1.1× against the mockup:
      - form rows within 0–6 px of the mockup from "Step inside" to "Redeem"
      - heading 1112–1536 px against the mockup's 1110–1532 px
      - subtitle and scene copy widths within 1%
- [x] 13 viewports, from 320 × 568 to 2560 × 1440, plus 820 × 1180, 844 × 390 and
      667 × 375. None has horizontal overflow, the brand never overlaps the headline,
      and the form never overlaps the footer. Side-by-side sizes don't scroll.
- [x] WCAG contrast of every gate token ≥ 4.5:1 for text and ≥ 3:1 for borders and the focus ring.
- [x] `npm run build`.
- [x] `node --test preview/e2e/email-access.test.js`: 1 pass. It covers the real
      server and browser flows: email verification, waitlist, invite redemption,
      member controls and revocation, and CSP. The layout assertion now states the
      split layout's invariants, and the run adds 1280 × 720 and a no-scroll check
      beside the art.
- [x] `npm run verify` (core) passed, with receipt `.runtime/agent/core.json`:
      - preview: 2504 pass, 1 skipped
      - server: 276 pass, 102 Redis-only skips
      - desktop: 9 pass
      - Python: 141 pass

## Limits

- The art is 1024 × 1536, so it's soft on large 2× displays.
- Not verified: Safari or Firefox, the packaged desktop app against production,
  and a human accessibility review.
