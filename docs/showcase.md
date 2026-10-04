# Interactive development showcase

Start `uv run --extra voice river-oaks serve` and `npm run dev` in separate terminals, then open http://127.0.0.1:5173/. Both servers bind to loopback. The bundled shopping district is the only scene. It opens directly on foot, with nearby people and conversations as the main interaction. No neighborhood, aerial, orbit or flight view is available.

## Walk, meet residents, and play a community scenario

WASD moves at street level; drag to look, use arrow keys to turn, hold Shift for a brisk walk, and press E near a local to talk. Storefront destinations move the visitor to an inferred exterior arrival; **Step inside** or F walks through the door into a furnished interior with staff and guests, and F steps back out. Storefront destinations move the visitor to an inferred exterior arrival point. Building footprints block walking and the camera follows observed terrain.

**People nearby** offers 20 fictional River Oaks residents and four fictional portrayals: Ima Hogg and Barbara Jordan as historical cultural encounters, Hakeem Olajuwon and Beyoncé as contemporary guests. They have linked public biographies, original authored dialogue, distinct interests and routines, and bounded per-scene memory of encounters, topics, and support offered. Memory survives a scenario reset; reloading creates a fresh population. These roles do not assert that public figures live at a particular private address. Generic meshes and preset voices do not reproduce their likenesses or voices.

Each conversation reaction can send Jev at most 512 characters of role context alongside local weather and activity. The role stays in simulation state; Jev still classifies only an immediate action. Authored dialogue and local support rules remain labeled separately from inference provenance.

Choose **Heatwave support**, **Storm recovery**, or **Delivery disruption**, then **Begin scenario**. Ask about a need before spending supplies or dispatching a volunteer. Kits give immediate bounded relief. District visits reserve a finite visit budget, recruit an existing resident and require physical arrival followed by on-site work. **Find volunteer** lets you watch the journey. Resolve six of eight priority requests before the support window closes. Storms hold visits; support uses the scenario’s finite supplies and visit budget. Talking to a helper holds their work; closing a conversation does not pause the scenario clock.

The edge trigger collapses the side panel and keeps walking keyboard focus. It persists across reloads and expands again by click, Enter, or Space. At 3840×2160 the collapsed drawing buffer uses native UHD; this is a resolution check, not a 60 fps performance claim.

## Optional speech on this machine

Run the [README setup](../README.md#optional-free-local-speech), then select **Kokoro · local neural voices**. [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) uses Apache-2.0 model weights through the [MIT-licensed ONNX runtime wrapper](https://github.com/thewh1teagle/kokoro-onnx). The download is pinned by SHA-256 and weights stay in ignored `data/models/kokoro/`. No inference service or API key is used. First setup needs internet; inference runs locally afterward.

There are 24 distinct English presets. One foreground line can render at a time, using two CPU inference threads, a 480-character limit, a 20-second server wait budget, and a cache capped at 32 lines/16 MiB. A timed-out worker keeps the slot until it actually finishes; new calls receive 503 instead of building a backlog. An explicit busy response tells the browser to retry once per second within its original 22-second total budget, with at most 20 retries. Only the latest line waits; mute, person change, close, blur or hiding the tab cancels waiting and playback. Missing models do not trigger retries. This supports selective conversation playback, not 500 simultaneous speaking voices. The UI defaults off. Device fallback allows only installed local English voices; its variety depends on the host.

The local CPU sample generated 5.632 seconds of WAV audio in 4.651 seconds; cached replay generation took 0.00024 seconds. This single sample proves generation and caching, not universal latency or subjective voice quality. [Measured receipt](../data/reports/local-voice-benchmark.json).

## People before places

The primary **Meet someone nearby** action approaches the closest person within 40 metres and opens their conversation. Nearby cards show up to three people, their role and distance; the list follows the visitor without stealing keyboard focus. E talks within 4.5 metres. Closing a conversation restores walking focus. Escape releases movement focus and never changes camera mode.

Open **More people & community activities** for the full cast, optional voice controls, resident-walk controls and cooperative support scenarios. Residents [walk between district stops](resident-life.md), pause for conversations and seek the modeled awnings during a thunderstorm. The economic laboratory and hover-moped interface have been removed.

The **Places to visit** directory provides optional exterior arrivals. These keep the camera on foot. Reloading also returns to the same district at street level.

## Validation and remaining scope

Local regression checks cover 100 JavaScript tests and 50 Python tests, including walking collision, physical volunteer arrival, intervention accounting, stale reaction and route rejection, pedestrian passing, persona continuity, voice cancellation and contention recovery, bounded worker/cache behavior, and secret-hook enforcement. The production browser build and Python lint/format checks pass. Browser scripts in `preview/e2e/` exercise actual controls for volunteer dispatch and arrival, resident navigation, weather, district walking, store arrivals, mission completion, district reload, UHD panel behavior, persona disclosure, appearance, and local speech. The latest run receipts live in `data/reports/`; screenshots remain ignored in `output/playwright/`.

The district contains nine mapped buildings, 39 road/path parts, 30 directory-matched destinations, four OSM tree points, and 18,832 LiDAR-derived canopy voxels, with local CC0 PBR surfaces and HDR illumination. Facades, untagged heights, storefront arrivals, and vegetation shapes are interpreted. Exact shop interiors and photogrammetric storefronts are absent; people use clothed CC0 human meshes with independent skeletons. See [visual-fidelity evidence](visual-fidelity.md), the [storefront reference audit](storefront-reference-audit.md), and [observed vegetation](vegetation.md). The source map has no independent sub-5-meter survey proof.

The final UE5 photorealistic environment is incomplete. Production character motion, production character/assets/audio, lane topology, actual Jev throughput, and target-hardware profiling remain outstanding. The larger neighborhood's canopy overlay is a historical footprint; it does not supply trees. Its GIS acceptance continues to fail the generated-canopy comparison. District improvements do not convert that report into a pass.

The current [street-level acceptance](street-level-plan.md#verification) supersedes older view/flight receipts.
