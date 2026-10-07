# River Oaks desktop

The desktop application runs River Oaks in Electron. Playing requires an online connection, WorkOS sign-in through GitHub in the system browser, and waitlist approval. The packaged app opens the hosted game at `https://typesafe.place/play`; its browser profile retains the approved session until sign-out or expiry.

## Live development

```sh
npm ci
npm run desktop:dev
```

The command starts a loopback Vite server (port 5174, or the next available port), WorkOS development authentication, the shared town, and the native game window. Configure the Staging WorkOS credentials and enable device authorization for its River Oaks application. Renderer edits hot reload; changes to `desktop/main.js`, `desktop/auth.js`, or `desktop/runtime.js` restart the desktop shell. Closing the game or pressing Ctrl+C stops its owned server. An independently running town is left alone.

For shared-town development, use `npm run desktop:dev`; sign-in, approval, and a town connection are required. To run a second development window beside one that is already open, give it its own profile: `RIVER_OAKS_PROFILE=/tmp/river-oaks-second npm run desktop:dev` (Electron allows one window per profile). The development command starts the optional Python bridge for Jev decisions and voices. The packaged app uses the hosted service and its features.

Use **View → Toggle Developer Tools** to inspect the renderer. **Game → Reload game** (⌘R / Ctrl+R) rebuilds the scene. **View → Toggle Full Screen** gives the game the display; **Help → Game controls** lists movement and interaction keys. **View → Debug tools** (F3) shows colliders, the walkable grid, ground triangles, the source map and a polygon inspector; see [debug tools](debug-tools.md).

Use **Commands → Photo mode** to compose and save clean PNG images. The native Save dialog lets you choose a destination; other downloads remain blocked. See [photo controls and sharing](photo-mode.md).

Appearance and graphics preferences persist locally. Development and packaged play use separate profiles. Window size, location, maximized state, and fullscreen restore when reopening; a removed display falls back to visible bounds. Closing the window quits the application.

The **Play & rides** dock groups flight, Jev, vehicles, and optional scenarios. **Explore** opens people, places, and settings. See [play controls and rendering evidence](experience-polish.md) for keyboard behavior and the browser acceptance suite.

## Local desktop build

```sh
npm run desktop:package
```

On Apple Silicon macOS the application is:

```text
dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app
```

Open it in Finder. For a quick bundled run without packaging, use `npm run build && npm run desktop:start`.

Packaging stages the desktop runtime; the packaged window loads the hosted game after device sign-in. Repository files, `.env`, server code, development dependencies, and game assets are excluded. This is a local development build, not a signed/notarized distribution release. Only macOS arm64 has been exercised; the packaging command targets its host platform and architecture.

## Rendering and recovery

Hardware acceleration remains enabled. Auto graphics reduces internal scene resolution under sustained load; if minimum resolution still misses the frame budget, it disables the additional ambient-occlusion geometry pass. Detail returns only after sustained headroom. Sharpest and Smoothest remain explicit overrides. The UI stays at native resolution. Hidden/minimized windows stop rendering and reset frame timing before resuming.

A renderer crash reloads the district once automatically. Repeated crashes within a minute show a recovery choice, preventing a crash loop. Reloading preserves preferences, not the current visit or transient standalone world state.

The renderer has no Node access or privileged preload API. Sandbox, context isolation, navigation restrictions, and denied device permissions follow [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). WorkOS device sign-in opens in the system browser, and external HTTPS references ask before opening there. The packaged window stays on the exact River Oaks origin.

Packaging also sets the app's [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses) (`desktop/fuses.js`). `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` are ignored, so another local program cannot run code as River Oaks or inherit its macOS permissions, and the app runs only from its integrity-checked `app.asar`. Check a build with `npx electron-fuses read --app "dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app"`. Because the inspector is off, Playwright cannot drive a packaged build; `desktop/e2e.js` runs against the development Electron.

## Verification

```sh
npm test
npm run test:server
npm run test:desktop
npm run build
RIVER_OAKS_ACCEPTANCE_FIXTURE=1 RIVER_OAKS_DEV_TOWN_PORT=8797 npm run test:desktop:e2e -- --dev
```

The end-to-end command uses a loopback-only acceptance identity and its own town port; it leaves a running development preview alone. A live packaged-app check requires signing in with an approved WorkOS GitHub account after the Production provider is configured. Electron tests exercise real assets, keyboard movement, shops, dialogue, preference persistence, fullscreen, isolation, blocked external navigation, and deliberate renderer-crash recovery. macOS can drop a fullscreen request made during a Space switch or another app's transition; the fullscreen check then asks once more and records it under `fullscreenRetries` in the report, so a real fullscreen failure still fails. Each run uses a temporary profile and records frame timing, GPU feature status, and asset failures in `data/reports/desktop-*.json`; screenshots go to `output/playwright/desktop-*.png`. Frame measurements describe this machine, scene, window, and workload, not a universal 60 fps guarantee.

Current vehicle and angel-flight integration: `node desktop/vehicles-e2e.js` against the live development URL on port 5174. Provider decisions are mocked in that test; real ElevenLabs playback requires an account key with access to the selected voice.
