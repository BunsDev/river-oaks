# Interactive development showcase

Start `uv run river-oaks serve` and `npm run dev` in separate terminals, then open http://127.0.0.1:5173/. Both servers bind to loopback. They serve the generated local manifest; missing or stale verification stays visible.

## Play an economic scenario

Choose a preset in **Scenario lab**, then **Run scenario**. The four starting conditions are a normal afternoon, a demand surge, a thunderstorm, and higher wages. Open **Adjust the economy** to change demand, service fees, wages, or the 20–300 workers on shift. Policies change the current run; **Reset** clears its results. **Save comparison** retains a result with its simulated duration, so compare runs at matching durations.

Workers move along observed road polylines and complete synthetic deliveries or landscaping jobs. They do not model actual businesses, households, lane navigation, or surveyed demand. The challenge is to keep the queue manageable while covering operating costs.

The model uses these explicit demonstration assumptions:

- A fixed one-second simulation step, with 60 simulated seconds per real second. Pausing or hiding the tab stops advancement; long frame gaps are capped.
- Baseline demand of 1,620 requests per simulated hour at demand 1 and an $18 service fee. Demand scales by the demand control and `exp(-0.045 × (fee - 18))`.
- Two delivery requests per landscaping request. A landscaping fee is 1.6 times the selected base fee. Each job keeps the fee quoted when it entered the queue.
- Revenue appears only at completion. Delivery service takes 45 seconds and costs $2; landscaping takes 120 seconds and costs $5, in addition to travel and wages.
- Wages accrue for every worker on shift, including during storms or idle time. Operating result equals revenue minus wages and completed-service costs.
- At most 2,000 outstanding jobs and eight recent internal events. Excess requests count as unserved. Inactive workers return unfinished jobs to the queue.

The scheduler assigns jobs. Jev chooses only immediate movement/service reactions using each worker's current activity, position, nearby workers, and weather. Up to four actual neighbors within 30 m enter each packet. Storm protection remains authoritative and pauses outdoor work even if an old answer says to continue. This preview pauses workers in place; it does not yet route them to real shelters.

## Read Jev evidence

The browser submits one snapshot every two seconds with no overlapping requests. The bridge batches up to 32 questions per remote request, with bounded concurrency and a 750 ms budget. The browser has a separate 1.8-second deadline. Reset, policy changes, pause, and hidden tabs invalidate old responses. Expired agent actions return to local fallback.

The HUD shows current worker counts by decision source: **Jev**, **Local**, and **Safety**. These are source counts, not an estimate of AI activity. `Jev configured` means the bridge has credentials; only accepted `source: jev` responses increment live counts. Without credentials, the current demo displays **Local rules** and zero Jev decisions. Keep the key in the ignored server-side `.env`, as described in the README; it never enters browser assets or packets.

## Ride the hovering moped

Choose **Hover moped** to enter the cockpit. Its assisted tour is a local scenic camera path, separate from Jev. **Take control** switches to manual flight. WASD or arrow keys steer and control speed; Q/E descend/climb, Space boosts, H pauses, and Escape exits. On-screen controls support touch. The flight envelope stays within the source extent and above the roof/terrain envelope. Reduced-motion mode starts stationary and removes camera bob and banking.

System/Light/Dark appearance follows the OS by default and remembers an explicit selection. Appearance does not change the simulation's time of day.

## Validation and remaining scope

Local validation covers 34 JavaScript tests and 35 Python tests, production browser build, formatting/lint, and clean Gitleaks worktree/history scans. Browser checks exercised OS-following and persistent themes, manual flight, hover, Escape, reduced motion, economic storm/recovery/pause, a 300-worker view, and a narrow mobile viewport. A delayed-response reset check verifies that an old batch cannot repopulate a reset run. Review caught and removed the decorative-marker pause control once scenario workers take over.

The original procedural homes use 17 instanced batches for 2,605 buildings. A short local browser measurement observed a 16.7 ms median animation-frame interval and 17.5 ms p95; this is not a GPU benchmark, a 4K result, or evidence for the UE5 performance target. The full architecture currently draws about 4.49 million triangles before shadows; spatial LOD remains future work.

The final UE5 photorealistic environment is incomplete. Unreal compilation, terrain rendering in UE, observed 3D canopy, production assets/audio, lane topology, actual Jev throughput, and target-hardware profiling remain outstanding. The browser's canopy overlay is a historical footprint; it does not supply trees. Overall GIS acceptance continues to fail its generated-canopy comparison.
