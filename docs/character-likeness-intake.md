# Character likeness intake: decision package and fixture contract

Status: **NO-GO for real-user intake.** Issue #518 is optional and outside the Character Studio release path. This package authorizes neither biometric collection nor a provider integration. The proposed implementation has no route, UI, account linkage, public asset serving, or production enablement. Human-only scope applies; existing nonhuman content is untouched.

## Threat model

Protect reference images, derived meshes/textures, consent receipts, account ownership, signing authority and world identity. Treat client metadata, model files, provider outputs and delayed callbacks as untrusted. A synthetic fixture marker alone is not proof of origin. Only a deterministic locally generated GLB's exact digest is admissible; callers cannot supply an allowlist, receipt, signing key or reviewer approval to the public operation interface.

| Threat / boundary | Required control and evidence |
| --- | --- |
| Another account guesses a quarantine ID | Owner-scoped reads and writes return the same unavailable result for unknown and foreign records; test read, moderation, publication, deletion and revocation. |
| Oversized or hostile GLB exhausts or exploits a parser | Check byte cap before parsing; restrict chunks/schema/extensions and geometry budgets; reuse pinned rig audit and compatibility requirements; reject URLs, scripts, shaders, cyclic/disconnected/duplicated scene references and unsupported fields. No texture decoding or runtime GLTFLoader for untrusted bytes. |
| A caller labels real data synthetic | Compare bytes against the locally authored fixture digest before quarantine admission; forged manifests and changed payloads fail. No real images, scans, face embeddings or existing likeness assets as fixtures. |
| Delayed validation publishes after deletion/revocation | Capture a generation, then recheck record existence, state and generation after asynchronous work and immediately before publication. Tombstones prevent ID reuse and replay. |
| Duplicate publish creates multiple revisions | One immutable signed revision per quarantine record; retries return the same revision, and invalidated revisions cannot be revived. |
| Private content leaks into public state | No world/store imports of the intake service, no routes, no account mutation. Explicitly test existing character definition/public snapshot boundaries with injected private fields. |
| Missing, tampered or revoked asset is rendered | Verify signature, digest, allowlist and active record on resolution; fail to the existing safe authored appearance, with no arbitrary URL fallback. |
| Signing or moderator privilege is abused | Separate server-side reviewer capability from owner operations; private signing key remains in process and signatures cover revision, fixture digest and policy version. Prototype keys are ephemeral, never a production trust root. |

## Consent, age, impersonation and rights

Proposed pilot policy, pending Val and qualified privacy/legal review: adults 18+ only, self-likeness only, no third-party or celebrity likeness, no deceptive impersonation and no minors even with guardian permission. Do not infer age or identity from a face model. Define a proportionate age/authority verification method before collecting anything; do not add identity-document collection to this prototype.

Consent must be affirmative, separate from account terms, versioned and revocable, with separate choices for processing references and displaying an approved derivative. Explain purpose, processing location, reviewer/provider access, retention periods, deletion limits and how to revoke. No training, advertising, face identification or authentication use. Refusal leaves ordinary Studio use available. Changed purpose or provider requires renewed consent. Capture the policy version, scope and timestamp privately; do not put legal names or consent records in avatar definitions.

The submitter must hold rights to the reference, depiction, clothing, textures and generated derivatives, including redistribution in the intended game. A provider's output license does not establish the subject's permission or remove third-party rights. Preserve a private provenance chain of source hashes, authorizations, tools/versions, license text/version, transformations, review decisions and signed revision. Rights disputes immediately suspend publication pending review.

## Private storage, retention, deletion and revocation

The fixture prototype uses bounded process-private memory, no disk/object-store uploads, no Redis, no backups and no telemetry carrying content. Synthetic buffers are copied on admission, released on rejection/deletion/revocation and expire after one hour. Process restart loses all prototype records and keys. This is deliberately unsuitable for real-user durability or deletion guarantees; releasing a JavaScript buffer is not certified memory erasure.

Proposed real pilot targets require explicit approval and implementation: encrypted private object storage with least-privilege service identities, regional placement, no public bucket/CDN, authenticated owner access and separately audited reviewer access. Originals expire within 24 hours of processing and rejected/pending derivatives within seven days. Approved derivatives remain only while consent is active. Revocation immediately denies new reads/publication, cancels jobs, invalidates signatures/allowlist entries and switches active selections to an authored fallback; online copies purge within 24 hours and backup copies within 30 days. Tombstones must survive restore to prevent resurrection. Keep minimal non-content deletion/audit receipts for 90 days, then expire them unless a documented legal obligation requires otherwise. These are proposed service targets, not implemented claims or legal retention advice.

A future deletion inventory must cover originals, derivatives, thumbnails, queues, temporary files, provider copies, object versions, CDN caches, analytics, logs and backups. Verify deletion with receipts, restore tests and provider confirmation. Explain that screenshots or copies already made by other players cannot be remotely recalled. Never promise retroactive secrecy after publication.

## Moderation before publication

All valid submissions remain quarantined until a distinct authorized reviewer approves rights, consent scope, age eligibility, impersonation risk, prohibited content and technical compatibility. The fixture reviewer is a local test capability and proves ordering only; it is not a real consent check, human moderation or malware scanner. Reject unknown fields and extensions instead of executing them. A real pilot additionally needs sandboxed decoding, malware scanning, decompression/resource budgets and independent security review before any arbitrary file reaches a renderer.

Moderation approval binds the exact digest and consent generation. Replacing bytes, expiring consent or revoking a record invalidates approval. Only the current approved allowlisted signed revision may leave quarantine. No private metadata accompanies it. Publication here means returning a fixture revision to the harness, not adding an asset to the game's catalog or deploying it.

## Public-terms vendor comparison

Public pages reviewed 2026-10-22 (local date); no sign-ups, contacts, uploads, paid calls or generation tests. Prices are indicative public listings, not quotes. Rig quality, facial fidelity, motion compatibility and operational deletion are **unverified for every vendor**. Do not select a vendor solely from this table.

| Candidate | Data use and rights | Public cost / compatibility / provenance | Pilot disposition |
| --- | --- | --- | --- |
| Local MakeHuman / MPFB workflow | Core assets are CC0; application code has separate AGPL/GPL terms. Third-party assets need individual license checks. [License](https://static.makehumancommunity.org/about/license.html). | No core-asset license fee; local hardware and artist time remain costs. Repository rig requirements provide a measurable compatibility target; no new export tested here. Pin tool versions, source license and export hashes. | Preferred investigation path for synthetic work: no upload needed. A local workflow still needs consent, access controls and deletion for actual likeness references. |
| Meshy | September 19, 2026 terms allow training on non-enterprise inputs/outputs absent a different order. Free outputs use CC BY 4.0; paid users may keep content private and own outputs to the extent legally possible. [Terms §§2.9, 3.2](https://www.meshy.ai/terms-of-use). Retention is purpose-dependent, not a fixed deletion SLA. [Privacy §8](https://www.meshy.ai/privacy-policy). | Live pricing rendered GBP: Free £0, Pro £16/month, Premium £32/month, Ultra £80/month before introductory discounts; verify billing currency and order-specific credits. [Pricing](https://www.meshy.ai/pricing). Rigging is advertised, but no River Oaks compatibility evidence exists. Require job/model version, exact output hash and contract/license receipt. | No real-user pilot under assumed consumer privacy. Need an approved agreement covering no training, review access, region, subprocessors and deletion. Resolve any marketing/terms differences in writing. |
| Tripo | Public pricing says paid private models are user-owned and paid data is not used for training; free outputs remain Tripo IP with attribution-based use. [Pricing/licensing](https://www.tripo3d.ai/product-doc/getting-started/pricing-credits). Terms distinguish free and paid rights. [Terms §5.2](https://www.tripo3d.ai/terms). Privacy permits operational human review and anonymized product/model improvement, and discourages personal information in inputs. [Privacy](https://www.tripo3d.ai/privacy). | Public Professional price $20/month or $13/month annual billing; HD generation 15 credits, rigging and animation 20 credits each. Same pricing page. No rig/facial-quality test performed. Require private setting evidence, job/version, output hash and license receipt. | No pilot until agreement reconciles personal-input guidance, review/improvement use, private settings, retention/deletion and intended likeness use. |

## Fixture implementation contract

A server-only factory defaults off and refuses enablement in production (including hosted production configuration). There is no environment change to an existing application factory and no public route. Enabling the local harness requires explicit test/development configuration. The fixture is procedurally authored geometry, a 53-bone compatible skeleton and a tiny embedded test texture; it represents no person. The existing `scripts/character-assets-audit.mjs` and `preview/src/character-compatibility.js` remain shared sources of technical checks.

The proposed bounds are 64 KiB per GLB, 64 live/tombstoned records per process, 128 triangles, 64 nodes, one mesh, one primitive, one material, one 1×1 texture, exactly the required 53 joints, one scene and no animation or morphs. The stricter fixture envelope supplements the existing asset audit's broader catalog limits. The sole accepted extension is `EXT_texture_webp`, declared required because the 1×1 WebP has no fallback; the generated fixture also supplies UVs and POSITION bounds. Unknown fields, extensions, resource references and receipt overrides fail closed. See the [Khronos WebP extension contract](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Vendor/EXT_texture_webp). Deletion or revocation during quarantine must defeat a late validation result; duplicate publication must be idempotent; missing bytes must resolve to a safe authored fallback. These checks do not prove that general uploads are safe.

## Decisions for Val

| Decision | Proposed position | Evidence needed to unblock a real-user pilot |
| --- | --- | --- |
| Scope and launch authority | Adults, self-likeness, limited invited cohort; optional feature | Explicit written go decision naming cohort, regions, accountable privacy/security/product owners and separate deployment authorization. |
| Consent and legal basis | Separate processing/display consent; no training or recognition | Approved jurisdiction-specific privacy notice, rights workflow, age/authority checks and withdrawal experience reviewed by qualified counsel. |
| Vendor or offline processing | Prefer local processing first; no vendor authorized | Approved data-flow map, contracts/DPA, subprocessors, residency, no-training terms, cost ceiling and deletion tests. |
| Storage and retention | Adopt or revise targets above | Threat-reviewed private infrastructure, access audit, timed purge, backup restore/tombstone proof and incident process. |
| Moderation operations | Human review before each exact revision | Named reviewers, escalation/takedown process, prohibited-content rules, response targets and reviewer-access controls. |
| Asset and runtime safety | Signed allowlist; stable authored fallback | Sandboxed scanner/decoder, realistic quality/performance tests, signing-key lifecycle, revocation across sessions and full transport isolation tests. |
| User acceptance | No pilot inferred from fixture success | Consent/revoke/delete usability and accessibility review, hosted auth/isolation acceptance, physical target-device performance and recovery evidence. |

Until all rows have approved decisions and implemented evidence, the answer is **NO-GO for real-user uploads**. Completing the three fixture-only PR increments is useful prep and does not close these pilot gates or issue #518's broader production acceptance.
