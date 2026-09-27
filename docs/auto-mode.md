# Jev auto mode

User objective: “thoroughly implement an auto mode controlled by a comprehensively well-trained jev model.” Scope confirmed: an autonomous player visit. Existing resident/store interaction work is preserved.

## Contract and acceptance ledger

- [x] An explicit Auto button starts/stops an autonomous visitor. Manual movement, look, dialogue, world reload, scenario reset, tab hiding, and focus loss cancel pending actions.
- [x] Jev selects bounded next actions: visit public destinations, approach residents, ask about needs, supply or dispatch eligible help, shelter, or wait. Movement uses collision-checked pedestrian routes and walking physics; interactions require physical proximity. No teleporting or remote resource spending.
- [x] Only current, valid, confident model decisions execute. Keys stay in the bridge. Request deadlines, no backlog, rate bounds, stale-response fences, current eligibility checks, and visible model/action provenance apply.
- [x] Domain policy covers exploration, fictional identities, consent/needs, resource conservation, completion, weather, navigation failure and recovery. A reproducible curriculum and held-out presentation variants exercise these boundaries.
- [x] Offline transport/controller tests and browser journeys prove integration, interruption, navigation and support. Evaluation records raw model decisions separately from local overrides, model/policy/data hashes, coverage, errors, latency and confidence.
- [x] Live Jev evaluation and a multi-step browser journey establish decision quality within the tested fictional district scenarios. These checks do not establish custom-trained weights or general real-world reliability.

## Provider constraint

Verified 2026-09-21: [TypeSafe models](https://docs.typesafe.ai/models) explicitly excludes customer fine-tuning/LoRA. All accounts use the same weights. Supported customization uses state, instructions, criteria and atomic decisions. This implementation uses a versioned domain policy and examples with pinned `jev-1.13.0`; examples do not change its weights. [Known limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13) put arithmetic, constraints and exact comparisons in code. [HTTP contract](https://docs.typesafe.ai/api) defines choice probabilities and confidence.

The running bridge now authenticates using Val's 1Password Jev credential, injected into the server environment without writing its value to disk. Literal custom weight training would require a provider capability that does not currently exist.

## Design

The browser constructs bounded candidates from the live world/community state. The bridge validates eligibility, sends one next-action Choice with explicit candidate descriptions and domain examples, and returns only a candidate ID from that request. The browser revalidates that candidate against the latest scene and follows it using the route worker and existing walking physics. It checks progress and blacklists temporarily unreachable destinations. Jev owns destination and support choices; local code owns geometry, costs, physical arrivals and cancellation. Unavailable, uncertain or invalid inference stops and retries slowly with visible status rather than pretending local decisions came from Jev.

Auto is opt-in and never persists as enabled. Scenario clocks remain user-controlled. Auto can help during a running scenario, but does not start/reset scenarios or alter environmental controls. A human-opened dialogue interrupts auto; automatic conversations use the same domain interactions without opening a modal or stealing focus. An accessible status exposes the current action, inference provenance and failure reason.

The bridge offers wait only when no other eligible action exists. Uncertainty still causes abstention. Confidence floors, selected on development data, are 0.30 for reversible visits/wait, 0.50 for asking about needs, and 0.75 for supply/dispatch/shelter. The model receives explicit nearest-option flags computed in code. Actual support cost and request eligibility are rechecked immediately before spending. Every model output remains subject to routing and walking physics.

The visitor route worker includes boutique interiors. A bounded visibility graph around furniture corners complements the exterior grid. The controller turns in place before moving at corners; tests physically walk from all 30 boutique spawn points to their exits. Unreachable destinations are excluded for 60 seconds and stalled walking is interrupted after four seconds.

The left rail has three labeled, keyboard-accessible tabs: teal **People**, pink **Places**, amber **Settings**. Only one panel is exposed at a time. Voice, layer and source details stay collapsed; the rail remains readable in dark mode and on mobile. Reading it does not cancel auto. Unsupported floating promenade ornaments were removed; facade-mounted details remain.

## Running and evaluating

Start the bridge with `TYPESAFE_API_KEY` in its environment and a pinned `JEV_AUTO_MODEL` (default `jev-1.13.0`). With 1Password CLI, a secret reference can be resolved without storing the key:

```sh
TYPESAFE_API_KEY='op://Development/Jev API Key/password' op run -- uv run river-oaks serve
npm run dev
```

Choose **Start Jev auto visit** in the viewport. For neighborhood support, first begin a scenario under **People → Help neighbors**. WASD, dragging, Escape, or **Stop auto visit** returns control. Offline or uncertain inference is visibly waiting; no local rule is presented as a Jev decision. Server-provided API keys are never returned to the browser. To supply your own key, open **Settings → Jev API key** and select **Use key**. The bridge keeps this override in memory for both auto visits and resident reactions. **Use server key** restores the original configuration; restarting the bridge also clears the override.

### Prince Jev companion

With the carriage parked, choose **Walk with Prince Jev** (or press **J**). Every 2.5 seconds the browser sends `POST /v1/companion` a bounded snapshot (Jevica's speed, their gap, conversation, flight, riding, indoor, crowded and narrow flags) with six fixed stances: `beside`, `lead`, `trail`, `pause`, `greet` and `return`. The bridge filters ineligible stances (only `return` while riding; `lead` needs steady walking; a greeting needs a recent stop and no greeting in the last 45 seconds) and asks Jev under the `prince-companion-v1` policy with its own thresholds. Jev picks the stance; the browser keeps every coordinate, collision check and step height. The same **Settings → Jev API key** override reaches this engine. Without a confident Jev answer the prince keeps walking with a local stand-in stance and the panel reads "Local follow" with the reason. This is policy conditioning, not trained weights, and live companion quality has not yet been evaluated.

```sh
uv run python -m river_oaks.auto_eval --output data/reports/jev-auto-curriculum.json
uv run python -m river_oaks.auto_eval --live --split development --output data/reports/jev-auto-development.json
uv run python -m river_oaks.auto_eval --live --split holdout --output data/reports/jev-auto-eval.json
```

Use `--bridge http://127.0.0.1:8766` with an isolated bridge when interactive auto is running. Evaluation spaces calls from response completion and never retries failed examples to hide them. API calls are billable. The 224-case corpus has 32 development cases, 96 previous holdout cases retained as regression, and 96 fresh held-out variants across 32 scenario families. This tests structured simulation states; the cases are not independent real-world observations and no custom weight training occurs.

Acceptance requires ≥90% coverage, ≥95% raw and accepted accuracy, zero ineligible accepted actions, and separate ≥90% coverage / ≥95% accuracy for cases with multiple eligible choices. Single-option cases check the integration but are not counted as model choice quality. `/v1/auto` reports evaluated status only for a passing live holdout report matching the current policy hash and pinned model.

## Verified evidence (2026-09-21)

- [Live held-out evaluation](../data/reports/jev-auto-eval.json): 96/96 correct and accepted; 30/30 multiple-choice cases correct; zero invalid accepted actions; p95 336 ms. Model and policy/data hashes are recorded.
- [Development evaluation](../data/reports/jev-auto-development.json): 32/32 correct and accepted. [Earlier failed evaluation](../data/reports/jev-auto-eval-v1.json) remains available: excessive exploration/wait abstentions and shared-service contention prompted candidate-policy and evaluator-spacing fixes. Fresh variants were reserved for final evaluation.
- [Live browser journey](../data/reports/auto-mode-live.json): actual Jev asked Maya about her needs, dispatched a volunteer (budget 4 → 3), selected subsequent destinations and drove physical walking; Escape stopped it. Resident micro-reactions were mocked separately; visitor inference was live.
- [Browser integration](../data/reports/auto-mode-e2e.json): modeled responses drive real walking and supply spending (12 → 10 kits); tests cover UI tabs, keyboard navigation, dark/mobile layouts, manual takeover, stale answers, world reload, visibility/focus events and unavailability. Visibility and blur are event-level tests; the CLI browser keeps its tabs visible, so native hidden-tab scheduling is not verified.
- `npm test`: 114 passing tests, including physical exits from every boutique, stale/cancelled model and route results, weather changes, scenario reset, support eligibility and stuck-route recovery.
- `uv run pytest -q`: 87 passing tests, including authenticated mock transport, malformed/uncertain probabilities, deadline cancellation, concurrent admission, strict input validation and curriculum isolation.
- Production build, Ruff and secret scan passed. The existing Three.js bundle-size advisory remains. No human screen-reader acceptance or custom Jev training is claimed.

## Progress

2026-09-21: implemented the autonomous visitor, authenticated live Jev through 1Password, evaluated domain conditioning, verified production browser behavior, removed sky ornaments and simplified the left rail. Concurrent work committed snapshots as `db2254e` and `f21e888`. This session did not create those commits or alter unrelated landscape work; follow-up tests and evidence remain in the shared worktree.
