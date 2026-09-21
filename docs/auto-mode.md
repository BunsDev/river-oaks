# Jev auto mode

Objective: an autonomous district visitor controlled by a comprehensively prepared and evaluated Jev model. Existing resident/store interaction work is preserved.

## Contract and acceptance ledger

- [ ] An explicit Auto button starts/stops an autonomous visitor. Manual movement, look, dialogue, world reload, scenario reset, tab hiding, and focus loss cancel pending actions.
- [ ] Jev selects bounded next actions: visit public destinations, approach residents, ask about needs, supply or dispatch eligible help, shelter, or wait. Movement uses collision-checked pedestrian routes and walking physics; interactions require physical proximity. No teleporting or remote resource spending.
- [ ] Only current, valid, confident model decisions execute. Keys stay in the bridge. Request deadlines, no backlog, rate bounds, stale-response fences, current eligibility checks, and visible model/action provenance apply.
- [ ] Domain policy covers exploration, fictional identities, consent/needs, resource conservation, completion, weather, navigation failure and recovery. A reproducible curriculum and independent held-out cases exercise these boundaries.
- [ ] Offline transport/controller tests and browser journeys prove integration, interruption, navigation and support. Evaluation records raw model decisions separately from local overrides, model/policy/data hashes, coverage, errors, latency and confidence.
- [ ] Live Jev evaluation and multi-step browser journeys establish decision quality. Until then model quality is unverified and the goal remains active.

## Provider constraint

Verified 2026-09-21: [TypeSafe models](https://docs.typesafe.ai/models) explicitly excludes customer fine-tuning/LoRA. All accounts use the same weights. Supported customization uses state, instructions, criteria and atomic decisions. This implementation will use a versioned domain policy and examples with a pinned Jev version, never claim that examples changed the weights. [Known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) put arithmetic, constraints and exact comparisons in code. [HTTP contract](https://docs.typesafe.ai/api) defines choice probabilities and confidence.

The bridge currently reports `local_rules`, and this shell has no `TYPESAFE_API_KEY`. Live evaluation requires server-side credentials. Offline fixtures cannot prove Jev quality. Literal custom weight training would require a provider capability that does not currently exist.

## Design

The browser constructs bounded candidates from the live world/community state. The bridge validates eligibility, sends one next-action Choice with explicit candidate descriptions and domain examples, and returns only a candidate ID from that request. The browser revalidates that candidate against the latest scene and follows it using the route worker and existing walking physics. It checks progress and blacklists temporarily unreachable destinations. Jev owns destination and support choices; local code owns geometry, costs, physical arrivals and cancellation. Unavailable, uncertain or invalid inference stops and retries slowly with visible status rather than pretending local decisions came from Jev.

Auto is opt-in and never persists as enabled. Scenario clocks remain user-controlled. Auto can help during a running scenario, but does not start/reset scenarios or alter environmental controls. A human-opened dialogue interrupts auto; automatic conversations use the same domain interactions without opening a modal or stealing focus. An accessible status exposes the current action, inference provenance and failure reason.

## Progress

2026-09-21: inspected current state, confirmed provider contract and absent live credentials. No previous auto-mode implementation or training artifact exists in the current tree. Historical camera-tour documentation is not the current street-level implementation. This turn is progress through new authoritative provider evidence and implementation work.
