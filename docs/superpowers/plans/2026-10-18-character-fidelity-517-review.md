# #517 supporting review

Objective: support the active #517 implementation with verified vendor/licensing
facts and downstream integration requirements, without duplicating its fixture,
measurement harness or executable contract. Full #517 goal remains incomplete
until runtime, variants, tiers and handoff evidence pass.

Owner: codex-517-review-20261018. Branch:
`docs/character-fidelity-517-review-20261018`, based on f897c1d6.
Files: this ledger and `docs/acceptance/character-fidelity-options.md` only.
Main implementation: task `character-fidelity-517-20261018`, owner
`claude:river-oaks (015e1f43)`. Coordination posted on #517 before edits.

## Acceptance

- [x] Bounded official-source licensing/cost/interoperability matrix.
- [x] Current-code integration requirements linked to actual owning seams.
- [ ] Supporting review handed to implementation owner in reviewable PR.
- [ ] Reconcile against measured fixture evidence before final route decision.

## Evidence and next action

2026-10-18: inspected live task register, active dirty fixture worktree, its ledger,
#517 claim comment, current definition/asset pins and avatar instantiation path.
Official MakeHuman, Epic and Unity sources inspected. No external assets acquired;
no application source modified. Physical target question asked once in this thread;
the implementation owner had also asked separately. Do not repeat it.

Next: finish matrix and verify exact platform/export limitations, inspect current
loader/callers and validator coverage, then deliver concrete integration risks to
#517. Keep source research bounded; actual fixture success remains unproven.

Verification: re-read avatar instantiation and resident-face morph retention,
server character-store validation, immutable asset pins and definition generation.
Official HDRP platform list and Unity embedded-distribution/UGC terms checked.
`git diff --check` passes. Documentation-only; no runtime test or fidelity claim.
