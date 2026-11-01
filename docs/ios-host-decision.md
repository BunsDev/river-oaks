# iOS host decision package for #286

Decision pending. This source recovery does not select a production host or authorize a new native bridge. The archived 27 October package recommended hosted custom WKWebView; #285 remains revise, and #286 prohibits committing a production scaffold before Val chooses the host. The original package remains in the verified recovery archive recorded in the [audit ledger](superpowers/plans/2026-11-01-host-isolation-286-audit.md).

## Evidence available

The [27 October simulator receipt](acceptance/ios-bundled-origin-20261027.json) records 15 observations in each of three modes using a loopback HTTP fixture and synthetic identity, with source `62f5d3228b1eb90cf6b5dce6c34cafcd4bf3f3f6` plus dirty experiment files. Hosted mode obtained a fixture session and opened a town socket. Bundled modes used `capacitor://localhost`; their town fetches failed and no town socket attempt followed. The permissive header witness observed the custom origin and no fixture cookie. The CSP mode recorded connect-src violations. These are historical fixture observations, not 45 passing production acceptance checks.

The receipt's module-worker result means no error occurred within three seconds, without a worker reply. It does not prove successful worker initialization. The experiment used a custom WKURLSchemeHandler, not an installed Capacitor implementation. It did not exercise production HTTPS, live sign-in, Turnstile, real private-resource denial, physical-device packaging or lifecycle focus. See the [experiment README](../experiments/ios-bundled-origin/README.md) and [current audit](superpowers/plans/2026-11-01-host-isolation-286-audit.md).

## Proposed choice

Retain the archived recommendation to investigate hosted custom WKWebView as the first production-host candidate, subject to Val's explicit selection and the existing #285 decision boundary. It keeps the page on the intended HTTPS origin and avoids introducing a bundled-origin server contract simply for packaging. This is a reason to prefer the candidate, not proof that authentication, resource isolation, app updates or recovery already pass in a package.

| Candidate | Work required before qualification |
| --- | --- |
| Hosted custom WKWebView | Select production identity and host; implement reproducible native scaffold, strict entry/navigation policy, bounded unavailable-service UI, lifecycle/focus recovery, content compatibility/update behavior and archive inspection. Verify live origin/auth integration through #287 and actual packaged-device isolation. |
| Bundled play client | Complete play-only prep, current asset classification and actual Capacitor-origin experiment; specify API/asset/worker resolution, cookie/CSRF/CORS/socket/CSP integration without weakening protections, integrity/cache/version/update rules and download behavior. Qualify the same device and accessibility cases. |

The experiment does not justify blanket CORS, relaxed CSRF, changed session-cookie policy or allowlisting arbitrary origins. Any selected bundled-origin contract needs its own security review and behavioral evidence. Neither host choice resolves the outstanding device rendering/performance evidence in #285/#289. No App Review or distribution acceptance is established here.

## Native capabilities

Current main's diagnostic probe has no JavaScript-to-native message handler. The recovered origin experiment now also registers none: native code polls bounded page-world results with document/generation/capture checks. A controlled simulator comparison found that an isolated-world fetch reached the witness despite source CSP rejecting the page fetch, so isolated diagnostics cannot qualify page-level CSP behavior. See the [measured comparison](acceptance/ios-csp-context-20261101/README.md). No production capability was added.

The archived package proposed signIn, openExternal, share and hostInfo messages. Those proposals are not approved by #738/#746 or this recovery. The production bridge remains unspecified pending the selected-host design and explicit capability decisions. Preserve existing native auth/navigation constraints; visual communicator, lift, chrome and loading treatments grant no external capabilities.

## Decisions and acceptance still required

1. Select hosted custom WKWebView or a bundled client, and explicitly state whether a production scaffold may proceed while #285's remaining physical evidence is open.
2. Approve production bundle identity/team and minimum supported iOS version through the owning release/device work.
3. Approve the smallest necessary native capability surface and its method/payload/frame/origin/lifecycle rules separately from visual treatment.
4. Establish the selected content-version, cache, corruption and update/rollback contract before claiming package compatibility.
5. Collect simulator and physical packaged-device evidence for navigation/redirects/popups, untrusted bridge messages, private-resource denial, unavailable service/offline loading, failure recovery and focus after lifecycle transitions. Keep human accessibility review separate.

No production scaffold, server-policy change, signing, merge, deployment, distribution or expanded capability is authorized by this document. The paired iPhone was unavailable at the current audit; final acceptance remains open.
