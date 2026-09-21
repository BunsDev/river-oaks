# Interactive development showcase

Start `uv run --extra voice river-oaks serve` and `npm run dev` in separate terminals, then open http://127.0.0.1:5173/. Both servers bind to loopback. The bundled district scene is the default; the original neighborhood remains selectable and uses its generated local manifest. Missing or stale verification stays visible.

## Walk, meet residents, and play a community scenario

WASD moves at street level; drag to look, use arrow keys to turn, hold Shift for a brisk walk, and press E near a local to talk. Storefront destinations move the visitor to an inferred exterior arrival; **Step inside** or F walks through the door into a furnished interior with staff and guests, and F steps back out. Storefront destinations move the visitor to an inferred exterior arrival point. Building footprints block walking and the camera follows observed terrain.

**People & place** offers 20 fictional River Oaks residents and four fictional portrayals: Ima Hogg and Barbara Jordan as historical cultural encounters, Hakeem Olajuwon and Beyoncé as contemporary guests. They have linked public biographies, original authored dialogue, distinct interests and routines, and bounded per-scene memory of encounters, topics, and support offered. Memory survives a scenario reset; reloading creates a fresh population. These roles do not assert that public figures live at a particular private address. Generic meshes and preset voices do not reproduce their likenesses or voices.

Each conversation reaction can send Jev at most 512 characters of role context alongside local weather and activity. The role stays in simulation state; Jev still classifies only an immediate action. Authored dialogue and local support rules remain labeled separately from inference provenance.

Choose **Heatwave support**, **Storm recovery**, or **Delivery disruption**, then **Begin scenario**. Ask about a need before spending supplies or dispatching a volunteer. Kits give immediate bounded relief. District visits reserve a finite visit budget, recruit an existing resident and require physical arrival followed by on-site work. **Find volunteer** lets you watch the journey. Resolve six of eight priority requests before the support window closes. Storms hold visits; staffing affects on-site progress; new economy completions can replenish delivery supplies. Talking to a helper holds their work; closing a conversation does not pause the scenario clock.

The edge trigger collapses the side panel and keeps walking/flight keyboard focus. It persists across reloads and expands again by click, Enter, or Space. At 3840×2160 the collapsed drawing buffer uses native UHD; this is a resolution check, not a 60 fps performance claim.

## Optional speech on this machine

Run the [README setup](../README.md#optional-free-local-speech), then select **Kokoro · local neural voices**. [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) uses Apache-2.0 model weights through the [MIT-licensed ONNX runtime wrapper](https://github.com/thewh1teagle/kokoro-onnx). The download is pinned by SHA-256 and weights stay in ignored `data/models/kokoro/`. No inference service or API key is used. First setup needs internet; inference runs locally afterward.

There are 24 distinct English presets. One foreground line can render at a time, using two CPU inference threads, a 480-character limit, a 20-second server wait budget, and a cache capped at 32 lines/16 MiB. A timed-out worker keeps the slot until it actually finishes; new calls receive 503 instead of building a backlog. An explicit busy response tells the browser to retry once per second within its original 22-second total budget, with at most 20 retries. Only the latest line waits; mute, person change, close, blur or hiding the tab cancels waiting and playback. Missing models do not trigger retries. This supports selective conversation playback, not 500 simultaneous speaking voices. The UI defaults off. Device fallback allows only installed local English voices; its variety depends on the host.

The local CPU sample generated 5.632 seconds of WAV audio in 4.651 seconds; cached replay generation took 0.00024 seconds. This single sample proves generation and caching, not universal latency or subjective voice quality. [Measured receipt](../data/reports/local-voice-benchmark.json).

## Play an economic scenario

Residents now [walk between district stops](resident-life.md), pause for conversations and seek the modeled awnings during a thunderstorm. **Pause resident walks** freezes their movement independently of the economic and community clocks. Their short routes run in a Web Worker; Jev receives batched immediate-reaction context. These are 24 fictional encounters, including the four labeled Houston cultural portrayals.

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

Choose **Hover moped** to enter the cockpit. Its assisted tour is a local scenic camera path, separate from Jev. **Take control** switches to manual flight. WASD or arrow keys steer and control speed; Q/E descend/climb, Space boosts, H pauses, and Escape exits. F finds an accessible street approach and descends; R rises clear of nearby roofs. Local terrain/building collision bounds manual movement. On-screen controls support touch. Reduced-motion mode starts stationary and removes camera bob and banking.

System/Light/Dark appearance follows the OS by default and remembers an explicit selection. The palette and system typography match `BunsDev/typesafe-ai-playground`'s `app/dashboard.css` at `fcd1773`: neutral panels and pink interaction accents. Appearance does not change the simulation's time of day or physical material colors.

## Validation and remaining scope

Local regression checks cover 100 JavaScript tests and 50 Python tests, including walking collision, physical volunteer arrival, intervention accounting, stale reaction and route rejection, pedestrian passing, persona continuity, voice cancellation and contention recovery, bounded worker/cache behavior, and secret-hook enforcement. The production browser build and Python lint/format checks pass. Browser scripts in `preview/e2e/` exercise actual controls for volunteer dispatch and arrival, resident navigation, weather, district walking, store arrivals, mission completion, district reload, UHD panel behavior, persona disclosure, appearance, and local speech. The latest run receipts live in `data/reports/`; screenshots remain ignored in `output/playwright/`.

The original procedural homes use 17 instanced batches for 2,605 buildings. A short local browser measurement observed a 16.7 ms median animation-frame interval and 17.5 ms p95; this is not a GPU benchmark, a 4K result, or evidence for the UE5 performance target. The full architecture currently draws about 4.49 million triangles before shadows; spatial LOD remains future work.

The district contains nine mapped buildings, 39 road/path parts, 30 directory-matched destinations, four OSM tree points, and 18,832 LiDAR-derived canopy voxels, with local CC0 PBR surfaces and HDR illumination. Facades, untagged heights, storefront arrivals, and vegetation shapes are interpreted. Exact shop interiors and photogrammetric storefronts are absent; people use clothed CC0 human meshes with independent skeletons. See [visual-fidelity evidence](visual-fidelity.md), the [storefront reference audit](storefront-reference-audit.md), and [observed vegetation](vegetation.md). The source map has no independent sub-5-meter survey proof.

The final UE5 photorealistic environment is incomplete. Unreal compilation, full-neighborhood observed 3D canopy, production character/assets/audio, lane topology, actual Jev throughput, and target-hardware profiling remain outstanding. The larger neighborhood's canopy overlay is a historical footprint; it does not supply trees. Its GIS acceptance continues to fail the generated-canopy comparison. District improvements do not convert that report into a pass.
