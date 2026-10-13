# iOS feasibility: device gate in progress

Issue [#285](https://github.com/BunsDev/river-oaks/issues/285), under
[#284](https://github.com/BunsDev/river-oaks/issues/284). Source inspected:
`3db6a5f0e381d3e9257bff42c63ac785d08e2ba4`, 2026-10-13. This is a working
experiment and proposed decision criteria, not approval of a production host.

## Hard requirements before choosing

- Ordinary approved users can reach the same authoritative shared world; denied,
  revoked and wrong-world users cannot bypass HTTP, asset or socket checks.
- Retain sign-in, move/look, encounter/chat, interior entry/exit, settings and
  interruption recovery. Preserve browser/desktop behavior and visual identity.
- The minimum device sustains the agreed workload without crash, runaway memory,
  unacceptable fidelity loss or unbounded recovery. A simulator cannot prove this.
- Packaged code, downloadable content and privileged native functionality have
  explicit boundaries. A shipped bundle cannot retain server-cookie confidentiality.
- Distribution/signing and the retained login route must be viable. No workaround
  that disables provider checks or treats a phone as a durable agent worker.

## Candidate comparison — provisional engineering estimates

Scores 1–5 (higher is better); weights: client reuse 30%, launch parity 25%,
maintenance 20%, distribution fit 15%, operating cost 10%. These scores represent
source-based estimates, not measured acceptance. Hard failures override scores.
Effort assumes one engineer experienced in web and iOS plus part-time review/device
help; ranges exclude Apple review and waiting for accounts/devices.

| Route | Reuse | Parity | Maintenance | Distribution | Cost | Weighted /5 | Engineering range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Shared client + bundled Capacitor/WKWebView | 5 | 4 | 4 | 4 | 5 | 4.40 | 4–8 weeks; auth/assets are high uncertainty |
| Small hosted custom WKWebView | 5 | 4 | 3 | 3 | 5 | 4.05 | 4–8 weeks; native auth/lifecycle owned here |
| Existing Unreal foundation | 2 | 1 | 2 | 4 | 3 | 2.15 | 12–24+ weeks; shared-client parity and iOS build unproven |
| Safari/PWA baseline | 5 | 4 | 5 | 1 | 5 | 4.15 | 2–4 weeks for mobile-web acceptance; does not deliver App Store binary |

Primary hypothesis: reuse Three.js with Capacitor's packaged runtime if origin,
assets and device gates pass. Fallback hypothesis: small custom WKWebView with
hosted HTTPS content, subject to native auth and review viability. The current
custom-host experiment tests WebKit and hosted-origin behavior; it is not a
Capacitor production scaffold and cannot prove bundled-origin behavior.

Switch when: a demonstrated renderer/device limitation prevents the agreed
quality floor; the supported auth/resource route cannot retain authority; or
required native capabilities impose more maintenance than the alternate route.
Escalate any engine change for scope review. A new-engine rewrite duplicates
existing client work; streaming introduces server GPU cost, latency and capacity
requirements. Neither is justified by current device evidence.

Capacitor uses WKWebView. Its configuration documents the custom iOS local scheme
and marks `server.url` as a development/live-reload option, not a production
packaging route: [iOS](https://capacitorjs.com/docs/ios),
[configuration](https://capacitorjs.com/docs/config). The hosted custom probe is
therefore deliberate; selecting Capacitor later requires its own bundled-origin
experiment. Unreal has an [iOS platform route](https://dev.epicgames.com/documentation/en-us/unreal-engine/ios-ipados-and-tvos-support-for-unreal-engine),
but this repository's `docs/engine-acceptance.md` only establishes historical Mac
build/automation, not iOS build or current web feature parity.

## Retained/adapted/deferred inventory

| Capability | Existing owner | Proposed first-release disposition / open work |
| --- | --- | --- |
| Shared world and presence | `server/app.js`, `world-gateway.js`, `preview/src/multiplayer-client.js` | Retain service authority, admission and one-world/session rules |
| GitHub and email sign-in | `server/redis-auth.js`, `magic-auth.js`, `preview/src/access-entry.js` | Adapt supported native/system-browser route; live round trips remain #287 |
| Resource gate | `middleware.js`, `server/asset-gate.js`, `preview/vite.config.js` | Reconcile before bundling; never ship private data/cookies/provider keys |
| Touch, walking, picking, interiors | `preview/src/walking-ui.js`, `main.js`, existing touch journeys | Retain; prove simultaneous touch, keyboard and recovery on devices |
| Chat, profile, moderation | server social/profile/moderation modules and player UI | Retain; audit personal blocking, reports and full account deletion in #292 |
| Settings and graphics | `sidebar.js`, `render-quality.js`, `render-pipeline.js` | Adapt reachable safe-area UI; preserve characters and world view |
| Shared voice | `server/voice.js`, `preview/src/shared-voice-client.js` | Newer than original issue baseline. Explicit retention decision required; no live voice call in probe |
| Local decision/speech | `preview/vite-bridge.js`, Python bridge | No mobile loopback dependency; defer unsupported services or provide an approved hosted route |
| Photo sharing | `preview/src/photo-mode.js` | Candidate retained optional feature; verify actual Web Share support |
| Studio/creator CLI, desktop process APIs | `desktop/studio-*`, `preview/studio.html` | Defer from initial ordinary-player mobile slice |
| Workplace/agents | #214/#221, workplace operations | Remain default off; separate owner/device/retention enablement gate |
| Push/haptics/economy | No prerequisite for base gameplay | Deferred unless a selected launch capability requires them |

## Origin and auth investigation

The hosted probe loads only `https://typesafe.place/play` at top level and allows
same-origin navigation. Same-origin/Cloudflare HTTPS subframes and the required `about:blank` /
`about:srcdoc` child documents can load provider challenges, with no native
interface. Val reproduced a non-interactive Turnstile challenge; device records
showed blocked child navigations. After the child-frame correction, Val confirmed
the challenge works. [Cloudflare documents these WebView requirements](https://developers.cloudflare.com/turnstile/get-started/mobile-implementation/).

A user-clicked GitHub sign-in now opens ASWebAuthenticationSession using the
existing desktop WorkOS device-flow contract and public client ID. The app polls
with provider backoff, accepts GitHub only, then exchanges the transient refresh
credential at the existing same-origin server route. Redirects are refused in
native HTTP. Only the validated Secure/HttpOnly session cookie enters WebKit;
provider credentials are never logged or written to the evidence files. Other
external top-level navigation remains blocked. This is an experimental viability
adapter; #287 still owns full live auth, account changes/revocation and signed
production acceptance. Val reported that the world loaded after the GitHub retry.
The current recording contains no `github-auth-exchanged` event, so an isolated
GitHub round-trip with correlated native evidence remains unverified; an existing
web session may have admitted this load.

Current desktop auth uses WorkOS device authorization in a system browser, then a
server exchange to a sealed cookie. The web email flow uses same-origin state,
Turnstile action/hostname verification, expiry, single use and bounded sends.
Bundled `capacitor://localhost` cannot be assumed equivalent to the hosted HTTPS
origin: cookie access, resource authorization, CSP, relative assets/decoders,
WebSocket Origin and CSRF require a deliberate contract. No checks are relaxed by
this experiment. Live email costs money; do not send codes without a bounded live
acceptance authorization. The probe denies microphone/camera permission.

## Proposed device/workload budgets — not yet accepted

- Minimum candidate: iPhone 13 (A15), with oldest supported OS selected after SDK,
  dependency and security review. Mainstream candidate: iPhone 16. Available now:
  iPhone 16 Pro Max on iOS 27.0.1. That device does not stand in for either floor.
- Probe deployment target: iOS 16.4 for inspectable WebKit. SDK used: iOS 26.5,
  Xcode 26.6. Neither sets the final release support floor.
- iPhone portrait and landscape under test; iPad is deferred pending explicit
  support choice. The experimental toolbar changes usable viewport: record it.
- Fixed daytime plaza route, crowded interior, travel and five repeated interior
  entries; 1 and 8 representative players initially, then 16 as an exploratory
  stress case. Use ordinary fixture accounts only in existing isolated harnesses.
- Candidate sustained floor: 30 fps / p95 frame interval ≤33.4 ms, p99 ≤50 ms;
  preferred tier 60 fps. Measure 20–30 minutes per representative sustained route.
- Candidate cold ready ≤20 s and warm ready ≤8 s on a recorded Wi-Fi link. Keep
  navigation, download, decode and ready time separate; record server/content SHA.
- Candidate memory budget: ≤700 MiB combined app/WebContent footprint, no more
  than 10% growth between settled repeated-route windows, no OS memory termination.
  Obtain WebContent/GPU measurements with Instruments; JS heap is not that metric.
- No sustained serious/critical thermal state, uncontrolled quality oscillation,
  missing approved character features, stuck input or surprise audio restart.

Budget changes require a reviewed rationale. Raw RAF scheduling alone cannot
establish render-loop/GPU compliance. Thermal charging/ambient state and user
interaction must be recorded; an idle login screen is not a scene workload.

## First physical-device result: revise, not accepted

On 2026-10-13, the development-signed Release probe loaded the hosted scene on the
iPhone 16 Pro Max / iOS 27.0.1. Val then confirmed a frozen/blank view. Recording
`probe-087AB2FD-1148-4B8C-9BB2-312648C18E92.jsonl` contains WebContent termination
at 12:25:05 UTC and again at 12:25:32 UTC after a manual reload. The last ready
sample reported 931 calls, 3,377,648 triangles, 198 geometries, 104 textures,
Auto quality at scale 1 with occlusion enabled, and an 880×1624 canvas in a
440×812 CSS viewport. Native thermal state was nominal (0).

Those counters do not identify the termination cause. The scene had only three
ready samples; this is not a sustained frame-time, thermal or memory measurement.
The ready marker appeared around 145 seconds after navigation, without sufficient
separation of sign-in, foreground interruptions and asset work to call it a cold
load result. Raw records are retained privately under `.runtime/ios-probe/`.
The app was built from the stated baseline plus the uncommitted probe patch;
the hosted content revision is not established. Preserve source patch and app
hash with this run. No production renderer or quality setting was changed.

A control launch with `--probe-native-only` disables collector injection and
periodic JavaScript reads. Recording `probe-C5E6607B-94A1-4386-9C66-36910B1F1130.jsonl`
records terminations at 12:37:51 and 12:38:12 UTC after reload; Val independently
confirmed the repeat freeze. The collector is therefore not a necessary trigger.
A separate native process-exit watchdog at 12:32:03 occurred during profiling;
it does not explain the earlier WebContent terminations. The filtered console
capture yielded no termination reason. The exported Activity Monitor trace has
28 samples of the native host only (peak footprint 13.35 MiB). It excludes
WebContent/GPU and cannot establish combined memory or the termination cause.

The immediate next gate is a usable memory/termination trace and separate Safari
comparison. The probe's Browser button opens the user's default browser, not
necessarily Safari; explicitly verify the browser identity for this comparison. Do not begin production host selection or claim a 20-minute playable
run from this failure. Val reported that Apple Safari cannot reach the world; the blocking screen or
error is still being clarified. This is not yet a Safari rendering result.
Missing minimum-device, GPU and combined-memory evidence
remain explicit.

## #292 inventory that can begin before the device decision

| Data/control | Source evidence | Release gap to resolve |
| --- | --- | --- |
| Account identity, email/GitHub, sessions | WorkOS + `redis-auth.js`, `magic-auth.js` | Full in-app account deletion across provider and local records; retention mapping |
| Waitlist, invitation and grants | `waitlist.js`, Redis equivalents, email access docs | Deletion/revocation propagation and reviewer access without public bypass |
| Profile and shared chat/social | `profiles.js`, social stores and world service | Map retention and deletion; test report/block behavior across reconnect/worlds |
| Moderation reports and bans | `moderation.js`, distributed routes | Confirm user-facing reporting/blocking coverage and staffed response/support |
| Shared audio | `voice.js`, LiveKit integration | Retained scope, processor disclosure, permission and interruption behavior |
| Diagnostics/screenshots | `preview/src/debug-report.js`, `server/debug-reports.js` | Redaction, retention, consent and support access; no automatic upload in probe |
| Workplace private tasks | `docs/workplace-operations.md` | Existing erase is workplace-only, not account deletion; remains default off |

This is source inventory, not a privacy declaration or operational acceptance.
Review actual functionality against [Apple's current guidelines](https://developer.apple.com/app-store/review/guidelines/),
including UGC controls, login, account deletion, privacy and downloaded functionality.
Owner decisions and app/SDK archive inspection remain necessary before submission.

## #293 prerequisite evidence

Xcode, xcodegen and valid development identities are available. Val authorized
team `9LR8Z8UQ9X`, development bundle `ai.typesafe.place.ios-probe`, provisioning
and using the paired phone. The experimental Release build signs and installs.
This does not reserve/approve the production identity, establish App Store Connect
roles, authorize distribution or verify a reproducible credentialed CI pipeline.

See `experiments/ios-probe/README.md` for commands and evidence limitations, and
`docs/superpowers/plans/2026-10-13-ios-device-feasibility.md` for current results.
