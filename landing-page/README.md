# TypeSafe Place landing page

Dedicated static source for https://typesafe.place/. `npm run build` copies these public files into `dist/preview/landing-page`. Preview with `python3 -m http.server 5180` from the repository and open `/landing-page/`.

Vercel serves the landing page at the root and the game at `/play` on hosted aliases. The build places physical index files at both paths so Vercel's filesystem routing serves them without an HTML rewrite. Local Vite and acceptance hosts keep their game entry at `/`. Shared legacy root query links forward to `/play`. Production uses `PUBLIC_ORIGIN=https://typesafe.place` and `AUTH_RETURN_PATH=/play`; the Redis namespace and cookie name stay stable.

The postcard is an original illustration, not a game screenshot. Fonts are loaded from Google Fonts; the page remains usable with system fallbacks. No analytics or marketing form is included.
