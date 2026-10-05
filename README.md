# River Oaks District


An inhabited science-fantasy interpretation of Houston’s River Oaks District: mapped streets and real boutique destinations, lush gardens, and human residents with varied romantic, gothic, futuristic and artistic fashion. This is an intentional shift toward a fantastic world rendered with believable materials, anatomy and movement. Play as **Jevica**, explore in third person, and fly in her bubble. See [the creative direction and controls](docs/world-direction.md).
## Play in the desktop app

Run `npm ci` then `npm run desktop:dev` to open River Oaks in its dedicated desktop window with live reload. Use `npm run desktop:package` to build the desktop app; it requires online GitHub sign-in and waitlist approval, and opens the hosted game. Native fullscreen, window restoration, graphics preferences, and renderer recovery are included. See [desktop development and verification](docs/desktop.md).


Jev's garage offers a compact pink four-wheel glass-canopy car and rose motorcycle, with
gold spinners, fitted passenger clothing and optional **Jev smart drive** through
the API. Streets provide two 3.59 m clear lanes with Palo Alto-derived gutters,
curbs and ramps. See [vehicle controls](docs/character-forms.md#royal-vehicles-and-prince-jev)
and [street geometry](docs/street-standards.md).

Approved residents can find and host scheduled gatherings in **Places → Events**,
RSVP privately, and visit named meeting points across shared worlds.
See [world events](docs/world-events.md).

## Run the live showcase

Players can choose single player or the shared town from the play-mode control after signing in with GitHub through WorkOS and receiving waitlist approval. Signed-in players in the shared town see each other as their selected appearance, can use town chat, and share residents, wishes, consequences, and community resources. See [multiplayer setup and deployment](docs/multiplayer.md) for `https://sim.jev.works`, WorkOS callback settings, waitlist approval, and the Node server. Local development also requires WorkOS; isolated browser acceptance fixtures use temporary local identities.

For the standalone showcase described below, start Vite with `VITE_MULTIPLAYER=off npm run dev`. Solo play supports the optional Jev auto visit, invasion, and local inference tools; those local simulations are disabled in shared play. `VITE_SINGLE_PLAYER=true` also selects solo play when `VITE_MULTIPLAYER` is unset. District geometry and visual assets are bundled; no GIS download or bridge is required to explore. For optional character services, scenarios, and speech, run the bridge in a separate terminal:

```sh
uv sync --locked
uv run river-oaks serve
```

```sh
npm ci
VITE_MULTIPLAYER=off npm run dev
```

Open **http://127.0.0.1:5173/**. The default is a walkable retrofuturistic River Oaks District scene at 4444 Westheimer, with bundled OpenStreetMap geometry, 30 directory-matched storefront destinations, 24 outdoor residents and 169 indoor staff and guest encounters. It loads without downloading the full neighborhood; the bridge supplies reactions, economic scenarios, and optional speech. The larger neighborhood scene and its residential renderer have been removed.

Residents have consistent local identities, remember encounters, walk between public stops and pause to chat. Four labeled fictional encounters feature Ima Hogg, Barbara Jordan, Hakeem Olajuwon and Beyoncé. Resident route searches run in a Web Worker; immediate reactions are batched for Jev or local fallback. [Resident life and controls](docs/resident-life.md)

Community dispatches recruit a visible resident carrying supplies. Use **Find volunteer** to watch them reach the recipient and help on site; only then is the request resolved. Conversations and storms can delay the visit, while an inaccessible route returns unused capacity.

**Start Jev auto visit** lets Jev choose where the visitor walks, whom to meet, and how to help during a running community scenario. Movement and support follow the same physical and resource rules as manual play. Move, drag, or press Escape to take over. The left rail groups controls into **People**, **Places**, and **Settings**. [Auto controls, live model evaluation, and setup](docs/auto-mode.md)

**Cmd/Ctrl+B** toggles exploration; **Cmd/Ctrl+Shift+B** toggles play controls.
**Cmd/Ctrl+K** opens searchable commands, **?** shows contextual keyboard help,
**Alt+1/2/3** selects People/Places/Settings, and **/** searches destinations.
Escape returns from a rail to the world. Rail choices and the selected tab are
remembered; shortcuts leave text entry and modal dialogs alone.
[Rail layout and keyboard review](docs/rail-navigation.md)

The approved administrator starts as Jevica in third person; other approved accounts start as Sable. Jevica and her multiplayer Jev and vehicle controls belong to that administrator. Shared-town players can select from the other looks built on seven shipped rigs, including fox, wolf, lynx, and human styles. **Meet someone nearby** opens a conversation with a nearby resident; the People panel ranks encounters by distance. WASD walks, dragging looks around, Shift walks faster, and E talks to someone within reach. V switches the camera; B takes off or lands, Space rises and C descends. The scene covers the roughly 254 × 290 m River Oaks District footprint at Westheimer and Westcreek.

Every destination now has a walk-in interior: press **Step inside** (or F at a door) to enter a furnished boutique, salon, gallery, cinema lobby or dining room with sales associates, guests and mannequins, then F again to step back out. Rooms are planned from the mapped footprints and furnished with original procedural fixtures; see [visual evidence](docs/visual-fidelity.md#boutique-interiors). The side trigger collapses controls for a native UHD render surface. System/Light/Dark appearance keeps the controls readable around the district’s TypeSafe neutral and pink palette.

Residents have roles, interests, routines, and per-scene conversation memories. Ima Hogg, Barbara Jordan, Hakeem Olajuwon, and Beyoncé are explicitly fictional cultural encounters with linked public biographies. Their dialogue is authored; Jev receives bounded role context and chooses immediate reactions. Clothed CC0 human rigs retain their natural faces, skin and hair, with six coordinated fashion palettes inspired by the playable characters. Shop workers inspect, prepare, serve or present at their stations, pause to attend to conversations, and resume work afterward. Storefronts are deliberately imaginative interpretations; see [visual evidence and asset provenance](docs/visual-fidelity.md).

Workers support role-specific trays, samples and other props with their hands; reachable counter stations lift and return the load. You can talk across low counters, and selecting a person in the directory brings you within speaking range in their room. See [interaction and movement evidence](docs/people-interaction-progress.md) for tested coverage and remaining realism work.

Mature tree models retain stems outside the widened road clearance, with distance-based detail, clipped planter shrubs and ornamental grasses. These are artistic additions informed by the source vegetation record; the independent historical canopy comparison still fails. See [vegetation evidence and asset provenance](docs/vegetation.md).

### Optional free local speech

Install the optional CPU runtime and pinned model, then start the bridge with that extra:

```sh
uv sync --locked --extra voice
uv run --extra voice python scripts/fetch_voice_model.py
uv run --extra voice river-oaks serve
```

On macOS, install eSpeak NG once with `brew install espeak-ng`. After upgrading from an older voice setup, rerun the model fetch command above to install the duration-capable model.

In **People & place → Spoken dialogue**, choose **Kokoro · local neural voices**. It runs on the local CPU after the initial approximately 142 MB model download, without an inference account or API charge. The 24 encounter presets are distinct generic voices, not celebrity imitations. **Device voices · local only** uses installed English voices when available. Speech defaults off on reload unless an ElevenLabs key is configured for Jev; muting, changing person, hiding the tab, or closing the conversation cancels playback. Kokoro speech includes phoneme timings that drive the speaker’s mouth. Speech geometry loads on demand and is released from the figure after playback; device voices and older untimed audio retain neutral mouths. One job at a time and a bounded cache keep synthesis out of the render loop. See [showcase controls and limitations](docs/showcase.md).

The **Scenario lab** runs an illustrative neighborhood-service economy. Change demand, service fees, hourly wages, staffing, and storms; watch jobs, queues, revenue, and costs. Decisions travel through the same loopback Jev bridge, with visible live/local/safety provenance. Without a configured key, it runs local fallback and says so. Jev makes reactive micro-decisions; schedules and accounting follow deterministic rules. The browser is a development showcase, not the final UE5 renderer. See [controls and model assumptions](docs/showcase.md) and [local showcase evidence](data/reports/preview-smoke.json).


## Optional source-data tooling

```sh
uv sync --locked
brew install gitleaks                 # macOS; required for the commit guard
sh scripts/install-hooks.sh
uv run pytest -q
uv run river-oaks acquire
uv run river-oaks observe
uv run river-oaks build --terrain data/raw/terrain.tif \
  --terrain-source data/raw/terrain-source.json \
  --canopy-reference data/raw/canopy-reference.json \
  --output unreal/Content/Data/world.json
uv run river-oaks verify --world unreal/Content/Data/world.json \
  --terrain data/raw/terrain.tif --canopy data/raw/canopy-reference.json
uv run river-oaks serve
```

`verify` currently exits **1 (failed)** when supplied the observed canopy reference: generated tree coverage is still zero. Other production gates remain blocked. Exit 2 means blocked without a failing comparison; exit 0 is reserved for complete acceptance. The decision service runs at `http://127.0.0.1:8765` using local rules until you supply a Jev key.

Follow [the Unreal setup](docs/unreal.md) to compile `unreal/RiverOaks.uproject`, create the map, and explore it. Use UE5.8.2 and its native toolchain. Editor and Game targets compile on macOS; see [engine acceptance](docs/engine-acceptance.md) for runtime verification status. The project is not a finished photorealistic environment.

## Current evidence

- Live city/county acquisition on September 17, 2026: 10,420 parcel records and 1,026 road features. Clipping produces 9,981 parcel parts, 940 road parts, and 2,605 synthetic house masses. The bounding box includes adjacent areas; it is not an authoritative River Oaks boundary.
- Geometry retains meter coordinates in EPSG:32615 relative to `[-95.425, 29.755]`. Unreal converts east/north/up meters into east/south/up centimeters.
- Houses fit source parcel setbacks and use seeded Tudor, Georgian, French, or modern massing. Styles are representative choices, not surveyed labels. Owner names, addresses, and property values are not downloaded or included in NPC packets.
- The local world includes a USGS Houston DEM exported at about 8.82 m resolution and resampled to a 257×257 preview grid, with NAVD88 elevations. Its import fidelity passes; source-date and independent vertical accuracy remain unverified. UE terrain rendering is still pending.
- The H-GAC service labeled 2016 supplies a historical canopy footprint overlay. It provides no individual stems, heights, or species; the generated world still has **zero trees** and fails its canopy comparison. The export is about 4.32 m/pixel, not a claim about native imagery resolution.
- The 500-agent loopback smoke test covers local fallback reactions. The local benchmark measures Python decisions only; neither establishes Jev throughput nor UE frame rate.

See [verification results](data/reports/verification.md), [GIS layout](data/reports/layout.svg), [machine-readable checks](data/reports/verification.json), [HTTP evidence](data/reports/http-smoke.json), and [local benchmark](data/reports/local-benchmark.json).

## Use Jev

Copy `.env.example` to the ignored `.env` file and set `TYPESAFE_API_KEY` locally. Keep it out of Unreal assets and logs.

You can also open **Settings → Jev API key** in the preview and select **Use key**.
This manual override applies to resident reactions and auto visits in the running
local bridge. It stays in server memory until the bridge restarts. The browser
does not save it, and the bridge never returns the key. Select **Use server key**
to remove the override and restore the original server configuration. A configured
key is validated by Jev on the next inference request.

```sh
uv run --env-file .env river-oaks serve
```

The adapter uses the documented `POST /v1/systemone` choice interface with `jev-1.13.0`, at most 32 questions per batch, four concurrent requests, and a 750 ms overall deadline. It caps starts at 15 batches per second and falls back when overloaded, late, malformed, or low-confidence. Batch priority rotates each tick to avoid starving the last agents. No remote retry backlog accumulates. Each question names its target NPC explicitly. A provided key enables billable remote calls; tests use local transports and synthetic fixtures only.

Unreal sends a snapshot at most every two seconds and never blocks movement on HTTP. One request may be outstanding; old ticks and responses older than 1.5 seconds are rejected. Local collision, schedule, and weather limits remain authoritative. `seek_shelter` pauses a marker in this foundation; reachable shelter navigation and vehicle lane topology remain unimplemented.

A 60 fps frame is 16.67 ms. A 300 ms network classification cannot finish in that frame; inference runs asynchronously across frames. Full-population latency and fallback frequency require a live benchmark. [TypeSafe HTTP API](https://docs.typesafe.ai/api)

## Test and protect changes

```sh
uv run ruff check .
uv run ruff format --check .
uv run pytest -q
npm test
npm run build
python3 scripts/check_secrets.py --all
gitleaks git --log-opts=--all --redact --no-banner --ignore-gitleaks-allow
```

The installed Git hook scans the **staged index**, blocks credential filenames even when force-added, and fails closed if Gitleaks is missing. CI runs the same protection plus a full-history scan, lint, Python 3.11/3.13 tests, preview behavior tests/build on Node 24, and an offline pipeline smoke test. Actions and the scanner archive are pinned. New clones must run `scripts/install-hooks.sh`; require the `Verify` checks in repository branch protection before relying on CI as a merge gate.

Tests target observable failure modes: missing ArcGIS pages, coordinate/containment corruption, mismatched canopy placement, malformed Jev answers, bounded timeouts, overloaded HTTP requests, schedule preservation, and real secret-guard rejection in temporary Git repositories. They do not substitute for Unreal compilation, visual inspection, privacy review, or GPU profiling. [Testing approach](docs/testing.md)

For multiplayer capacity evidence, see the [performance audit](docs/multiplayer-performance-audit.md).
`npm run audit:multiplayer` probes local simulation and transport;
`npm run audit:multiplayer:render` measures a real hardware browser with up to
32 synthetic connected players. Local results do not establish global readiness.

## Work without downloads

```sh
uv run river-oaks demo
uv run river-oaks verify --config data/generated/demo/config.json \
  --raw data/generated/demo --world data/generated/demo/world.json \
  --output data/generated/demo/report.json
uv run river-oaks benchmark --agents 500 --iterations 1000
```

The demo is a labeled synthetic fixture and never counts as River Oaks accuracy evidence. To explore it in Unreal, copy its `world.json` into `unreal/Content/Data/`.

Raw GIS, generated neighborhood manifests, voice weights, review queues, and Unreal binary assets remain ignored. The bundled district derivative is attributed under [ODbL](preview/public/data/README.md); surface maps and HDR lighting have [CC0 source receipts](preview/public/assets/materials/sources.json). [Data contracts and source catalog](docs/data.md) explain observed canopy inputs and attribution. [Execution ledger](docs/superpowers/plans/2026-09-17-river-oaks.md) records what still needs delivery.

Jevica can also **Call carriage** and **Ride carriage** from her character
controls. W/S rides or reverses, A/D or arrow keys steer, and **Leave carriage**
steps onto clear ground. The ornate rose-and-gold coach, ceramic-and-teal district
palette and human residents are intentional; see [world direction](docs/world-direction.md)
and [character controls](docs/character-forms.md).

Street geometry retains the Houston map and applies [Palo Alto street details](docs/street-standards.md).

Prince Jev now follows Jevica into bubble flight with articulated angel wings and smooth obstacle-aware banking. Use **Walk with Prince Jev**, then **Take flight**. His ElevenLabs voice defaults to Adam (`s3TPKV1kjDlVtZbl4Ksh`); configure the key and optional voice ID in **Settings → ElevenLabs API key**. See [character controls](docs/character-forms.md).
