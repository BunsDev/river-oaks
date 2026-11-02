# HTTPS origin control implementation plan

> For agentic workers: use superpowers:executing-plans for inline implementation with behavioral red/green checks.

Goal: compare hosted HTTPS with the bundled custom scheme using the existing fixture identity and unchanged server Origin/CSRF/socket enforcement. No production scaffold, permissive CORS, trust challenge override or external service is authorized.

Design: allow an explicitly configured HTTPS origin only for 127.0.0.1 with an explicit valid port, root path and no credentials/query/fragment in the test fixture. The default HTTP origin stays unchanged. An experiment-only TLS front server forwards Origin and CSRF headers verbatim to the existing town/Vite fixture and handles WebSocket upgrades without rewriting their Origin. Its cookie bootstrap endpoint sets only the existing synthetic fixture identity with Secure, HttpOnly and SameSite=Lax; no real account participates. A disposable simulator trusts a generated test CA through simctl, leaving the app on normal WebKit certificate validation. A separate temporary WebView can prime the shared nonpersistent cookie store at the exact bootstrap document before loading the measured document; neither WebView registers message handlers. Reports retain cookie attributes/names and status categories, never cookie or ticket values.

Files: server/tests/browser-fixture-origin.js and its behavioral test own strict fixture-origin configuration; server/tests/browser-fixture.js consumes it. experiments/ios-bundled-origin/https-fixture.mjs owns the bounded TLS forwarding/bootstrap fixture; scripts/tests/ios-https-fixture.test.js verifies real TLS and WebSocket behavior. ExperimentPolicy and its Swift tests accept explicit HTTPS loopback while preserving exact-document confinement. App/BundledOriginApp.swift owns opt-in bootstrap only; https-origin.mjs owns build, disposable CA/simulator, actual trial evidence and cleanup.

- [x] Write failing strict-origin tests and HTTPS-loopback Swift tests; implement minimal validated configuration without changing defaults.
- [x] Write real TLS/HTTP/WebSocket proxy tests, including unchanged Origin and negative CSRF/origin controls; implement the bounded fixture.
- [ ] Add exact-document bootstrap state and bounded cookie provenance/result collection; run Swift tests and unsigned build.
- [ ] Run hosted/custom-scheme transport trials with normal TLS validation and real cookie receipt; keep worker qualification in its separate existing comparison and retain the HTTPS-worker gap; retain raw results and cleanup evidence. Fail closed on unqualified controls.
- [ ] Review security/result integrity, run focused and canonical gates, update decision evidence and draft PR. Preserve initial failures and actual exclusions.

The existing PR852 core pass belongs to cdf95378. New behavior requires new verification before committing. Actual Capacitor, production sign-in, Turnstile, real assets/decoders, physical-device isolation/focus, loading/update recovery and host selection remain open.


## Source checkpoint

Thirteen focused JavaScript tests pass, including real TLS/WSS through the existing game fixture, strict public-origin configuration, default HTTP witness behavior and prior page-poll/context regressions. Seven Swift policy tests pass. Eight existing phone-fixture regressions pass. All native simulator Swift sources typecheck with the iOS 16.4 deployment target and installed simulator SDK (exit 0). Logs: `/tmp/river-oaks-https-focused-final-20261101.log`, `/tmp/river-oaks-https-bootstrap-policy-green-20261101.log`, `/tmp/river-oaks-https-existing-fixture-regression-20261101.log`, `/tmp/river-oaks-https-native-typecheck-20261101.log`.

Red evidence is retained: missing strict-origin module, initial HTTPS policy rejection, missing bootstrap policy API and initial witness ignoring its TLS option. These are implementation red checks, not successful native trials. Source review found no critical security issue. Its important result-qualification finding was fixed: unreadable bundled transport is reported as an observation, never asserted as cookie isolation or server authentication denial. Server metadata now retains response/upgrade status and cookie names only. Disk key removal precedes potentially blocking cleanup operations and failures are recorded while independent cleanup continues.

The runner deliberately observes the same native PID until its explicit native capture deadline produces a terminal result; it does not restart or call a live trial stopped at an outer observation deadline. Explicit SIGTERM cancellation is handled, but synchronous commands can delay it. Native nontermination and forced-kill cleanup remain unqualified. The new runner has not yet been executed.

Unsigned native build session 8481 is still queued behind browser-lock owner PID 7092, confirmed live; its log is `/tmp/river-oaks-https-native-build-20261101.log`. No queue bypass or replacement build was started. After its actual terminal result, execute the current-source HTTPS runner through browser-lock, retain the same trial process until terminal and inspect the recorded outcomes. No generated private key or simulator has yet been created by this runner. The new patch is uncommitted and has no new canonical core pass. PR852 hosted verification run 41299430616 remains queued at cdf95378.


## Canonical core result for the HTTPS source increment

`pnpm run verify` session88165 completed with exit 0 at cdf953787ca69f68a693870dea581a665de3ebe1 plus the uncommitted HTTPS patch, 11:11:20–11:19:18 UTC. Tooling306/306; preview4824 total (4788 pass,1skip,35todo); server1396 total (1111pass,285Redis skips); desktop132 total (127pass,5skips); Python215passed with66warnings; build/lint/format/secrets passed. Demo verification returned the expected profile exit2. Receipt `.runtime/host-https-core-cdf95378-dirty-pass.json`; log `/tmp/river-oaks-host-https-core-20261101.log`. The secrets stage scanned253.70MB with no leaks and exited0. Earlier receipts remain preserved separately.

This is a selected core-check pass for the source patch, not a linked native build, simulator HTTPS result, full/Redis/browser pass or physical-device acceptance. Native build session8481 is still live in the queue; owner PID7092 and next queued owner7238 were both confirmed live. Registry evidence says the first owner is waiting for load below8. Repository workflow also covers other heavy commands, so the queued compiler was not bypassed or restarted. Observe the same handle to terminal, then execute the actual comparison.

Published cdf95378 CodeQL run41299428631 completed successfully. Hosted verification run41299430616 remains queued. Those jobs do not include the new uncommitted HTTPS patch. Main remains6a789759 after fetch; no upstream host/policy/fixture change invalidated the source basis. The new patch remains uncommitted pending the required unsigned build and trial.


The native build handle8481 actually completed with exit0 after the two earlier owners finished. While preparing a deliberate compilation-only exception, the exact-PID guard found the old wrapper absent and stopped before any signal or plan/queue mutation. Re-polling8481 confirmed terminal success. No cancellation, queue exception, override or replacement compiler was applied. Proceed with the actual HTTPS comparison through the common browser lock; retain its first terminal result.


Final actual HTTPS comparison60334 exited0. The null-stdout first driver failure was retained; corrected execution confirmed untrusted TLS rejection, network cookie bootstrap with secure attributes, hosted ticket/socket success, custom-scheme cookie omission on observed requests, and complete key/simulator cleanup. The remote CORS autofix was integrated with explicit bounded fixture origins rather than restoring blanket credentialed reflection;14focused tests passed. Evidence is copied byte-for-byte into `docs/acceptance/ios-host-followup-20261101/`. Final core48238 passed at51c28e2a plus the final code; remaining physical/selected-host/real-package requirements stay open.
