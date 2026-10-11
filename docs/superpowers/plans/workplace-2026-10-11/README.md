# Integrated workplace: review-first planning package

**Status:** Awaiting independent agent review; not approved for implementation.  
**Tracker:** [#214](https://github.com/BunsDev/river-oaks/issues/214).  
**Start here:** [Review and reconciliation #216](https://github.com/BunsDev/river-oaks/issues/216).  
**Publication branch:** `docs/workplace-review-package-20261011`.  
**Publication baseline:** `e561f9b7fdf071aa4bc95e38628264bb5b51c511` on October 11, 2026.

## Documents and authority

- [Design specification](typesafe-place-workplace-design.md): player experience, physical setting, story alignment and safety boundaries.
- [Implementation plan](typesafe-place-workplace-implementation-plan.md): proposed Tasks 0–8, integration seams and validation.

Both supplied documents are preserved byte-for-byte as the original planning snapshot. Their older baseline, pending-PR descriptions, suggested eventual paths and statements that publication had not occurred describe that earlier request. This directory is now the review location; this README records the publication context. Do not interpret old delivery notes as current repository state or old unchecked steps as a newly authorized implementation batch.

**The six issues below are a deliberately smaller proposed execution breakdown.** The first milestone is fixture-backed. Live remote agents mentioned in the source design are deferred until an explicit provider, privacy, isolation and spend review. The first milestone may stop at a draft artifact rather than event publication if review supports that boundary.

Dimensions, station counts, test occupancy, exact filenames/interfaces, numerical budgets, retention defaults, vendors and chronology are proposals. The reviewer may amend, combine, defer or close work with a short reason. Do not freeze them merely because the original plan uses imperative language. Preserve player control, server authority, privacy, revocation, exact-action approval and truthful execution evidence.

## Current integration notes

Main includes arrival/tooling PR #198 and the pnpm workflow. Follow the current branch's scripts; do not reintroduce npm or a second lockfile from historical commands. Task-lifecycle guidance is now in `docs/project-management/workflow.md`.

Recheck [storybook #200](https://github.com/BunsDev/river-oaks/pull/200) and [Places/World Studio #210](https://github.com/BunsDev/river-oaks/pull/210). The latter is the world-authoring interface, not this proposed agent-occupied workplace. Coordinate with its existing owners; do not duplicate or take over their work. Preserve the Driver and the Enchantress and Guest List facts. The Favor adaptation, exact site and the other gods' embodiment remain review decisions.

## Bounded work packages

| Issue | Outcome | Original tasks | Dependency |
| --- | --- | --- | --- |
| [#216](https://github.com/BunsDev/river-oaks/issues/216) | Review scope, canon, active work and necessary decisions | 0 | First action |
| [#217](https://github.com/BunsDev/river-oaks/issues/217) | Minimal contract and server-enforced owner permissions | 1, 3 | Reviewed scope from #216 |
| [#218](https://github.com/BunsDev/river-oaks/issues/218) | Measured room and truthful companion occupancy | 2, 4 | #216; integration uses #217 |
| [#219](https://github.com/BunsDev/river-oaks/issues/219) | One bounded fixture task, private artifact and notice | 5; notification part of 6 | #216, #217 |
| [#220](https://github.com/BunsDev/river-oaks/issues/220) | Accessible review and proposed Favor journey | 6, 7 | #217–#219 and reviewed story |
| [#221](https://github.com/BunsDev/river-oaks/issues/221) | Integrated evidence and continue/revise/stop decision | 8 | #220 |

Graybox exploration can proceed beside the contract after review; service integration consumes the agreed contract. The room and worker can then develop in parallel. Each issue carries checkbox subtasks, acceptance criteria, evidence expectations and exclusions. Keep related subtasks together; split only when a reviewer identifies an independently useful delivery boundary. No assignees, deadlines, sprints or new vendor commitments are imposed.

## Review handoff

Record **keep / amend / defer**, rationale, affected issue/document, evidence and the next action in #216. Update the tracker and affected documents rather than creating a second roadmap. A future implementer must reconcile current main and local changes, claim the task under the repository lifecycle workflow, and obtain the necessary design/implementation authorization before changing behavior. Agent review does not authorize new canon, spending, merge or deployment.

Deferred capabilities remain notes, not a pre-scheduled backlog: live imported-agent adapters, arbitrary research/code execution, shared-project authority, external push/SMS/calls, shared spatial voice, additional offices, new economies and Unreal parity. OpenCoven is a possible future adapter, not a selected or shipped integration.

## Publication ownership and verification limits

This publication owns only the three Markdown files in this directory and the newly created workplace issues. It does not claim the active Places/Studio, character, storybook or lifecycle tasks. The shared task register has existing owners; it is left untouched rather than replacing their records from a remote snapshot. The repository integrator should reconcile/register this documentation branch during review under the existing lifecycle workflow.

GitHub connector access was used for repository reads and publication. Container network resolution prevented a normal repository checkout; no other agent's local checkout, worktree or staged files was touched. Documentation checks cover original-file Git blob hashes and local companion/index links. Runtime tests, pnpm doctor/core/full, rendered checks, independent review, merge and production deployment are not established by these documentation checks.

Original Git blob hashes: design `e7fe0bd2432ac87dfec27bdf503ba4ca0e8babf9`; implementation plan `2027e5d1fafadbc5da5c3544d05871f3b0bda162`.
