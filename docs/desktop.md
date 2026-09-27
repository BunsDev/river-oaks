# River Oaks desktop

The desktop application runs the existing Three.js game in Electron. The packaged game includes the district, characters, textures, and navigation workers and plays standalone without a browser tab, Vite, Python, or a network connection.

## Live development

```sh
npm ci
npm run desktop:dev
```

The command starts a loopback Vite server (port 5174, or the next available port), the existing local shared town, and the native game window. Renderer edits hot reload; changes to `desktop/main.js` or `desktop/runtime.js` restart the desktop shell. Closing the game or pressing Ctrl+C stops its owned server. An independently running town is left alone.

For standalone development, use `VITE_SINGLE_PLAYER=true npm run desktop:dev`. The optional Python bridge still runs separately with `uv run river-oaks serve`; Vite proxies its requests. The packaged game uses authored dialogue and local simulation fallbacks, with no Python bridge, WorkOS sign-in, or hosted multiplayer included.

Use **View → Toggle Developer Tools** to inspect the renderer. **Game → Reload game** (⌘R / Ctrl+R) rebuilds the scene. **View → Toggle Full Screen** gives the game the display; **Help → Game controls** lists movement and interaction keys. **View → Debug tools** (F3) shows colliders, the walkable grid, ground triangles, the source map and a polygon inspector; see [debug tools](debug-tools.md).

Appearance and graphics preferences persist locally. Development and packaged play use separate profiles. Window size, location, maximized state, and fullscreen restore when reopening; a removed display falls back to visible bounds. Closing the window quits the application.

## Local desktop build

```sh
npm run desktop:package
```

On Apple Silicon macOS the application is:

```text
dist/desktop/River Oaks-darwin-arm64/River Oaks.app
```

Open it in Finder. For a quick bundled run without packaging, use `npm run build && npm run desktop:start`.

Packaging stages only the desktop runtime and built game. Repository files, `.env`, server code, and development dependencies are excluded. This is a local development build, not a signed/notarized distribution release. Only macOS arm64 has been exercised; the packaging command targets its host platform and architecture.

## Rendering and recovery

Hardware acceleration remains enabled. Auto graphics reduces internal scene resolution under sustained load; if minimum resolution still misses the frame budget, it disables the additional ambient-occlusion geometry pass. Detail returns only after sustained headroom. Sharpest and Smoothest remain explicit overrides. The UI stays at native resolution. Hidden/minimized windows stop rendering and reset frame timing before resuming.

A renderer crash reloads the district once automatically. Repeated crashes within a minute show a recovery choice, preventing a crash loop. Reloading preserves preferences, not the current visit or transient standalone world state.

The renderer has no Node access or privileged preload API. Sandbox, context isolation, navigation restrictions, denied device permissions, and a local content policy follow [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security). External HTTPS references ask before opening in the default browser. Bundled assets are served from `app://game`; path traversal and symlinks outside the bundle are rejected.

## Verification

```sh
npm test
npm run test:server
npm run test:desktop
npm run build
npm run test:desktop:e2e
npm run test:desktop:e2e -- --dev
RIVER_OAKS_DESKTOP_EXECUTABLE="$PWD/dist/desktop/River Oaks-darwin-arm64/River Oaks.app/Contents/MacOS/River Oaks" npm run test:desktop:e2e
```

Electron tests exercise real assets, keyboard movement, shops, dialogue, preference persistence, fullscreen, isolation, blocked external navigation, and deliberate renderer-crash recovery. Each run uses a temporary profile and records frame timing, GPU feature status, and asset failures in `data/reports/desktop-*.json`; screenshots go to `output/playwright/desktop-*.png`. Frame measurements describe this machine, scene, window, and workload, not a universal 60 fps guarantee.
