# Landing artwork

The page artwork comes from the user-supplied landing mockup
`ChatGPT Image Oct 9, 2026, 07_26_13 AM.png` (1625 × 968). It is concept art, not
captured gameplay. No full-resolution export of these scenes exists, so each file is
a crop of the mockup at its native pixel size. Replace them with higher-resolution
renders of the same scenes when they exist; the page lays them out with `object-fit`.

| File | Mockup crop (x, y, width, height) | Used for |
| --- | --- | --- |
| `pantheon-hero.jpg` | 4, 0, 1621, 591 | Hero, and every detail dialog at its own `--focus` |
| `pantheon-avatars.jpg` | 32, 694, 514, 172 | "From street style to starlight." card |
| `district-fountain.jpg` | 560, 694, 514, 172 | "Places made for belonging." card |
| `pantheon-supper.jpg` | 1088, 694, 514, 172 | "A hello can go a long way." card |

The hero crop starts at x 4 to leave out the mockup's window edge. The mockup's
own headline, buttons and card labels were removed with OpenCV inpainting
(Telea). Lettering was masked by its own pixels, and buttons by their full
rectangles. The page sets the same text in HTML, at the same places. The hero keeps
the mockup's left and bottom shading, so the CSS shade only guards wider screens.
Files are progressive JPEG at quality 90 with no chroma subsampling.

The official logo, `typesafe-place-logo.png`, is the exact user-supplied
`typesafe-place-logo-bg-transparent.png`, with transparency preserved. It is used in
the hero and favicon. The Apple symbol used in the Mac download button comes from
[Simple Icons](https://github.com/simple-icons/simple-icons/blob/develop/icons/apple.svg).

The earlier streetwear artwork (`social-hero.jpg`, `district-evening.jpg`,
`community-evening.jpg`) was retired with this design. It remains in git history.
