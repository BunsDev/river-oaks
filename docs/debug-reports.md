# Problem reports

Players open **Report a problem** from any of these:
- the account tools in the rail
- the sign-in screen's footer
- the loading-error panel
- the Commands palette ("report")
- the F3 debug panel

They describe what happened, can preview the whole report, and then **Copy** (Markdown summary plus JSON), **Download** (JSON) or, when signed in, **Send**. Nothing leaves the browser until one of those is chosen.

## What a report contains

`preview/src/debug-report.js` starts collecting with the sign-in page, so a failure before the game loads is included. The schema is `river-oaks.debug-report`, version 1.

| Section | Contents |
| --- | --- |
| `app` | Version and git commit (`__RIVER_OAKS_BUILD__`, set at build time from `VERCEL_GIT_COMMIT_SHA` or git), dev or production mode, host and path |
| `environment` | Browser, platform, desktop app or not, languages, time zone, cores, memory, connection, screen, viewport, device pixel ratio, zoom, motion, transparency, contrast and colour-scheme preferences, theme |
| `performance` | Uptime, navigation and paint timing, JS heap. Frame times over the last 600 frames (fps, median, p90, p99, max, frames over 33 and 50 ms, last 120 values), long tasks, slowest resources |
| `renderer` | WebGL version, GPU vendor and model, limits, key extensions, pixel ratio, drawing buffer, shadows, last frame's draw calls and triangles, GPU memory counts, context loss, graphics quality and pipeline |
| `scene` | Objects, meshes, instanced meshes and instances, skinned meshes, lights by type, materials, textures |
| `game` | World, loaded state, walking, flying or riding, position and yaw (10 cm), room, camera, place, multiplayer state, open panels, loading or error text |
| `access` | Sign-in screen state, signed in or not, admin or not (no account id) |
| `errors` | Page errors with stacks, unhandled rejections, failed resource loads, WebGL context loss (last 50, repeats counted) |
| `console` | `console.error` and `console.warn` (last 80) |
| `network` | Failed or slower-than-3-second `fetch` requests: method, path, status, duration (last 40) |
| `breadcrumbs` | Controls clicked (label only), function keys and Escape, visibility and online changes (last 40). Never typed text |
| `storage` | Names and sizes of `river-oaks*` local storage keys, storage quota |
| `screenshot` | Optional JPEG of the game view, at most 960 px wide and 140,000 characters |

## Privacy

Every string passes `redact`, which removes:
- email addresses and account ids (`user_…`)
- bearer and JWT tokens
- `code`, `token`, `ticket`, `state`, `invite`, `csrf`, `session`, `key`, `secret`, `password` and `auth` values
- any run of 32 or more token-like characters (except a 40-character commit hash)

URLs keep their path plus only `world`, `debug`, `motion-debug`, `place`, `at`, `quality`, `occlusion`, `theme` and `view` values. Messages, typed text, cookies and storage values are never read. The server adds the sender's account id and name to a sent report, for admins only.

The collector and dialog chunks (`debug-report*`) load on the sign-in page before approval, because they hold no game code (`server/game-assets.js`).

## Receiving reports

`POST /api/debug-reports` accepts a report from any signed-in account, waitlisted ones included. It is checked for origin and CSRF, limited to 3 per account per 10 minutes and 192 KB, and validated at the envelope.

Storage keeps the newest 50 reports for 30 days:
- **Production:** one Redis list per namespace (`createRedisDebugReports`)
- **Local town:** in memory

Waitlist admins see **Problem reports** in the account tools. It lists summaries newest first (sender, description, build, path, browser, error count and first error), each with **Download**. The API equivalents are:
- `GET /api/debug-reports`
- `GET /api/debug-reports/get?id=…`

## Fixing from a report

Start from `app.commit` and the latest `errors` and their stacks. Then use:
- `breadcrumbs`: the steps that led there
- `performance.frames` and `renderer.lastFrame`: stutter
- `game.position` and `room`: where to look, in the facade fixture or with F3 overlays

A Copy pasted into an issue or chat is enough for a first look; the downloaded JSON includes the picture.
