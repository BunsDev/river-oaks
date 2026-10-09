# TypeSafe Place landing page

Dedicated static source for https://typesafe.place/. `pnpm run build` copies these public files into `dist/preview/landing-page`.

Run `pnpm run dev:landing` and open http://127.0.0.1:5181/landing-page/ for live editing. HTML, CSS, and asset changes reload automatically. Run `pnpm run dev` separately for the game on port 5173; local waitlist links redirect there and preserve shared-world queries. Both servers bind to localhost. The landing dev server does not change production routing.

Vercel serves the landing page at the root and the game at `/play` on hosted aliases. The build places physical index files at both paths so Vercel's filesystem routing serves them without an HTML rewrite. Local Vite and acceptance hosts keep their game entry at `/`. Shared legacy root query links forward to `/play`. Production uses `PUBLIC_ORIGIN=https://typesafe.place` and `AUTH_RETURN_PATH=/play`; the Redis namespace and cookie name stay stable.

The page is always dark, like its night-time artwork, and fills the viewport edge to edge. Navigation and cards open native modal dialogs rather than extending the page. Escape, the close button, and the backdrop dismiss details; browser focus returns to the opener. Section hashes also open the corresponding panel. The hero uses container queries to adjust to its remaining height, with a separate layout for short landscape screens.

There is no header. The official transparent logo and large app name live in the hero, with prominent waitlist, Explore, and Apple-branded Mac download actions. Access is waitlist-only and requires approval. The download points to the published v0.1.6 Apple silicon ZIP; update its URL and version label when publishing a newer Mac release. Events and Create remain accessible through footer overlays.

The layout, copy and artwork follow the supplied October 9 mockup; the illustrations are concept art cropped from it, not game screenshots. Provenance and crop coordinates are in [assets/README.md](assets/README.md). Fraunces, Outfit, and Space Mono load from Google Fonts, with local fallbacks. No analytics or marketing form is included.
