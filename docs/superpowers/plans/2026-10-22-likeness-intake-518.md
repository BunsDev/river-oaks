# Likeness intake #518 implementation ledger

**Goal:** Deliver the decision package, fixture-only quarantine, and adversarial/production-gate proof in three PR increments; no merge, deployment, real data or provider calls.

**Architecture:** A server-only in-memory harness admits only a deterministic synthetic GLB digest. Strict envelope validation reuses character-assets-audit and character-compatibility; moderation, generation fencing and signed allowlisted revisions control release. Existing routes and shared identity stay unchanged.

**Spec:** User's attached execution brief and [decision package](../../character-likeness-intake.md). **Tech stack:** Node ESM, node:crypto, node:test, existing Three.js audit.

## Ownership and baseline

Owner `codex:likeness-intake-518-20261022`; task `likeness-intake-518`. Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-likeness-518`, first branch `docs/likeness-intake-518-20261022`, forked from `origin/main` `52379be69efd395d624fedd57eeee8e283850a62`. Root/scoped instructions, workflow, live register, issue #518 and ListAgents inspected. No existing likeness task or open PR found; adjacent character tasks preserved. GitHub-backed project status completed with unrelated ownership/archive/retirement gaps; no cleanup authorized.

Owned files: `docs/character-likeness-intake.md`, this ledger, new `server/character-likeness-*.js` and `server/tests/character-likeness-*.test.js`. Do not edit shared audit/compatibility modules unless a proven blocker requires an explicit ownership update.

## Increments and checks

- [ ] 1. Decision package: threat model, consent/age/rights, storage lifecycle, moderation, public vendor terms and Decisions for Val. Review exact Markdown and links, run baseline focused checks and core gate, signed commit, push, open docs PR and one evidence comment.
- [ ] 2. Quarantine plus tests: deterministic synthetic fixture builder; strict bounded GLB validator; server factory with owner operations, reviewer capability and signed allowlist. Test admission and byte/size/polygon/texture/bone/URL/script/shader/scene rejection before implementation, then focused and core checks. Signed commit, push, separate stacked PR and one evidence comment.
- [ ] 3. Adversarial plus gate: foreign owner, revoke/delete during async validation, duplicate publication, tampered signature, missing-asset fallback and existing public identity/peer boundary tests. Explicit default-off and production refusal tests. Focused, core, then full with isolated Redis under shared browser lock. Signed commit, push, separate stacked PR and one evidence comment.

The prototype uses no real likeness assets, routes or providers. Public terms browsing is documentation research only. No skip counts as evidence. Full local checks do not prove hosted, physical-device, moderation or legal acceptance.

## Review focus

- Caller changes buffers after submission: copy before asynchronous boundary; test mutation.
- Reviewer results arrive after revoke/delete: generation/state recheck; test paused validation.
- Retry or signature tampering: immutable publication, current allowlist and exact signed payload; test both.
- Host config differs from Node mode: reject production hosting as well as NODE_ENV; test matrix.
- Private metadata injection: existing definition validation and peer snapshot output must exclude it; test actual public boundaries.

## Evidence and next step

2026-10-22: fetched origin, reconciled ownership and created clean sibling worktree. Locked pnpm installation completed. Locked uv setup and agent:doctor passed. Baseline `node --test scripts/tests/character-assets-audit.test.js preview/tests/character-compatibility.test.js`: 6 passed, zero skips. Core process 38595 is running; log `/tmp/likeness-518-core-doc.log`. Public Meshy, Tripo and MakeHuman terms read without sign-up. Decision package authored; all implementation and delivery gates remain open.

Ruling: execute the supplied three-increment brief directly and record unresolved pilot choices under Decisions for Val, as requested; no additional design approval is needed. Prepare increments 2/3 while the first core run is live, but stage only the files belonging to each separate PR. Consequently the running gate may include the new server tests when that phase starts; its receipt is evidence of its recorded working tree, not an exact committed docs-only head.

Implementation checkpoint: 17 quarantine checks passed, then 32 focused/adversarial checks passed. An additional idle-expiry test failed because expiry was only swept on access; added an unref'd per-record expiry timer, cleared on erase. Final focused checkpoint: 33 passed, zero skips (`.runtime/likeness-518/focused-expiry.log`). Initial missing-module and idle-expiry failures retained. Independent read-only review requested through the code-review skill; findings pending. No commits, PRs or evidence comments yet.

Independent review completed: no blocking findings; reviewer independently ran both new suites, 33 passed with no skips. Docs increment is eligible for a draft PR based on the passing baseline checks and document review; core/full remain pending and will be reported as such. Ruling: draft delivery may precede the broad gate because it does not claim acceptance; no merge is authorized.
