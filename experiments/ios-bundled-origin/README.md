# Bundled-origin experiment (#286)

Simulator-only comparison of the two origins an iOS host could give the play client: the deployed site's own origin (here the loopback browser fixture) and a bundled custom scheme, `capacitor://localhost`, served from the play-only build by a `WKURLSchemeHandler` the way a packaged Capacitor app serves its bundle. It is not a production host, a Capacitor project, a device run or a signed build, and it changes no server behaviour. Historical fixture results: `docs/acceptance/ios-bundled-origin-20261027.json`; current qualification limits and decision status: `docs/ios-host-decision.md` and `docs/superpowers/plans/2026-11-01-host-isolation-286-audit.md`.

## Run

```sh
pnpm run build:play
node experiments/ios-bundled-origin/run.mjs            # builds the app, creates and deletes its own simulator
node experiments/ios-bundled-origin/run.mjs --skip-build --keep --modes hosted
```

Needs Xcode with an iOS simulator runtime that supports the device type (default `iPhone 17`; `--device-type` chooses another) and `xcodegen`. The runner starts the fixture town (`preview/e2e/fixture-server.js`, test identity `bob`) and the header witness (`witness.mjs`), builds `BundledOrigin.app` unsigned, creates a simulator device, installs the app, launches it once per mode, waits for `Documents/results.json`, and writes `.runtime/ios-bundled-origin/report.json` plus a comparison table. The witness answers every request and WebSocket upgrade with the headers it received (cookies by name), to any origin, so the results show exactly what the WebView sent; the fixture town gives the real verdicts.

Modes:

- `hosted`: the fixture's play page on its own origin.
- `bundled`: `dist/play` on `capacitor://localhost`; `/api`, `/auth` and `/multiplayer` are answered 404, as there is no server at a bundled origin, and every request to the origin is recorded.
- `bundled-csp`: `bundled`, with the archived 27 October Content-Security-Policy snapshot delivered as a response header by the scheme handler.

`App/BundledOriginApp.swift` has the host, the scheme handler and the results writer; `Web/harness.js` runs the checks (injected at document start in every mode). `scripts/tests/ios-bundled-origin.test.js` covers the witness and the summary; `swift test --package-path experiments/ios-bundled-origin` covers the Foundation launch/message boundary policy. Synthetic simulator integration is recorded in `docs/acceptance/ios-csp-context-20261101/`; real client, actual Capacitor and physical-device qualification remain open.

## Limits

- The fixture cookie is set natively without `HttpOnly`, `Secure` or `SameSite`, so the observation does not establish production session-cookie behavior. Production HTTPS and the actual cookie attributes need separate validation.
- Turnstile is not exercised (the fixture has no challenge); the hostname rule is read from `server/turnstile.js`.
- The scheme handler does not implement `Range` requests, so the gate's background video is re-requested many times; a production bundle host must serve ranges.
- Simulator WebKit behavior does not establish physical-device behavior; a device run (#285) remains separate evidence.

## Recovered experiment boundary

Recovered from the hash-verified 27 October archive. Current code restricts API/witness configuration to explicit loopback HTTP origins and restricts document navigation. All measurements now use bounded native polling with document/generation/capture guards; no JavaScript-to-native handler is registered. Ordinary measurements execute in the page world. The historical receipt predates these corrections.

The play-only build prerequisite is draft #709, which remains unmerged. Current main does not provide `build:play`; do not claim this runner works from main alone. Do not point the fixture experiment at a production origin. The archived worker observation only checks the absence of an error for three seconds and is not successful worker-handshake evidence. Do not count observation totals as acceptance passes.

The bundled-csp mode retains the archived policy snapshot, which differs from current source (the Computer frame origin was added later). It is not current deployed-policy qualification. The measured context comparison found that an isolated-world canary reached the witness while current source CSP rejected the page-world canary. Ordinary origin measurements were therefore restored to the page world and their results-only native handler removed. Document CSP events can be observed by both worlds, so an event alone does not establish which request was rejected.

## Current-source content-world comparison

Run `node scripts/browser-lock.mjs 'CSP context comparison' -- node experiments/ios-bundled-origin/context-parity.mjs`. It always builds its current source inputs, verifies bundled probe scripts, creates a synthetic bundle with an explicit bounded CSP file generated from `server/security-headers.js`, and compares both content worlds with CSP disabled/enabled. Native code polls main-frame results; no message handler or fixture cookie is registered in this mode. Canary rejection requires matching connect-src evidence, a non-timeout error and consistent witness traffic. Worker startup requires a nonce-matched reply; a failed baseline is inconclusive.

`node scripts/browser-lock.mjs 'CSP cancellation regression' -- node experiments/ios-bundled-origin/context-cancellation.mjs` sends SIGTERM only to its own child after that child creates its own simulator, then verifies removal. Synchronous commands can delay signal processing until control returns; forced-kill cleanup is not established.

The actual comparison, ordinary page-poll control/CSP results and interruption evidence are retained in `docs/acceptance/ios-csp-context-20261101/`. They qualify these controlled measurements, not HTTPS cookies, actual Capacitor, real asset/decoder/worker resolution, production/private resources, physical-device behavior or accessibility focus.
