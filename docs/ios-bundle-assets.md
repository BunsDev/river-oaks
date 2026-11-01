# Packaged play-client asset classification for #286

This recovered classification is a source review, not an inspected release archive. The archived measurements came from draft #709 at `62f5d3228b1eb90cf6b5dce6c34cafcd4bf3f3f6` plus local work on 27 October: 145 files totaling 234,978,885 bytes (224.1 MiB). The current main revision `decb4e9ac8ee86ab0ed04fb97600550f96e502d5` does not include that draft's `build:play` command or manifest generator. Do not present those sizes as a current production package. Original details remain in the verified archive identified by the [audit ledger](superpowers/plans/2026-11-01-host-isolation-286-audit.md).

## Current source classification

Reviewed `server/game-assets.js`, `server/asset-gate.js`, `middleware.js`, the static-serving path in `server/app.js` and `vercel.json` at the current audit revision. These files define source policy; no deployed response or binary archive was inspected here.

| Class | Source rule | Packaging consequence |
| --- | --- | --- |
| Public boot entry | Exact first-paint script and named access/preload/debug-report JS/CSS exceptions in `protectedGameAsset` load before approval. | Include only the intended play entry and its actual dependencies. Public bootstrap does not authorize game APIs. |
| Gated game code and world data | Other executable/style assets, `/data/` and Studio paths require approval. Ambiguous paths are gated after canonicalization. | Bundled bytes become readable to installers. Session/approval checks cannot revoke copies already distributed. Do not bundle account/private/dynamic world data merely because static committed world files exist. |
| Public media | Vercel source rules cache listed GLB/HDR/image formats and screening MP4/WebM/VTT publicly; other asset paths receive private/no-store headers. | Distribution rights and provenance still require asset-specific review. Public serving does not authorize large downloads, optional media redistribution or new download capabilities. |
| Live authenticated services | The asset pass is session-bound and lasts at most 30 minutes; tickets, sockets and APIs check access independently. | Preserve live authorization. A bundled gate screen or locally stored approval marker must never substitute for server checks. |
| Credentials and machine state | `.env`, provider keys, private runtime state, caches, server/Python/Electron code and fixture bypasses are outside a play package. | Inspect the actual archive and effective build configuration. Filename exclusions alone do not establish that emitted chunks contain no sensitive material. |

Vercel and local Node static cache rules differ; do not infer one from the other. The deployed server still owns authentication and resource authority regardless of the chosen host.

## Selected-host work still required

A hosted shell ships no prebundled world by default unless a separately reviewed design chooses it. It still needs archive/configuration inspection, an explicit entry allowlist, private-resource denial, unavailable-service recovery and a supported content-version/update contract.

A bundled client needs explicit API/asset/worker/decoder resolution, a reviewed origin/authentication contract, a content inventory with hashes and provenance, bounded storage/eviction, corruption handling and update/rollback behavior. The [historical simulator receipt](acceptance/ios-bundled-origin-20261027.json) demonstrates fixture-origin differences; it does not establish production cookie, CSRF, CORS, CSP, socket or Turnstile integration. Do not weaken these controls to make a bundle load.

No current play bundle, signed archive, app-update compatibility, offline shared-world play or clean physical-device install is qualified by this document. Host choice remains pending in the [decision package](ios-host-decision.md). Rebuild the selected package and inspect its real contents before making release claims.
