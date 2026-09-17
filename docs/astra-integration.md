# Tafi Astra humans in the River Oaks UE5 simulator

**Status:** proposed integration plan, rebased onto the repository as of
`feat/river-oaks-foundation` @ `1fe85a3` (2026-09-17). Nothing in this document
is implemented. It replaces an earlier draft that assumed the repository was an
empty scaffold with no engine choice; that assumption is false and the earlier
architecture (a standalone C++20/CMake renderer sidecar) is withdrawn.

**Decision requested:** approve the UE5-hosted backend design and the gates
below so an Astra feasibility spike can begin once vendor SDK access exists.
Do not approve any Astra code, asset, or license commitment yet.

## 1. Summary

- River Oaks already has a host for human rendering: the `RiverOaks` UE5.6 C++
  module. Astra is integrated as a **character backend inside that module**,
  replacing the instanced sphere NPC markers. No second native build system.
- The repository already owns the two contracts the earlier draft proposed to
  invent: a metric manifest coordinate system with a tested UE conversion, and
  a bounded NPC decision protocol in which local rules stay authoritative over
  inference. Astra receives poses; it never owns position, collision, schedule,
  or weather limits.
- The public Astra material describes capabilities (customization, clothing
  autofit, morphs, streamed assets, desktop and mobile OS support) but not a
  current SDK contract. Every vendor-specific fact below is a **probe gate**,
  not a known value. Nothing here invents Tafi API symbols.
- Three prerequisites are outside the codebase: a current Astra SDK and EULA,
  an Unreal Engine 5.6 toolchain on a build host (the module has never been
  compiled; see `docs/unreal.md`), and a repository license (none exists).
- The showcase's four fictional portrayals of real Houston public figures rely
  on a "generic meshes do not reproduce their likenesses" disclaimer
  (`docs/showcase.md`). Ultra-realistic humans remove that margin; a likeness
  policy (section 9) is a gate, not a footnote.

## 2. Verified baseline

Facts below were read from the working tree at `1fe85a3`, not inferred.

| Area | Repository state | Evidence |
|---|---|---|
| Engine | Unreal Engine 5.6 C++ project; module depends on Core, CoreUObject, Engine, InputCore, HTTP, Json | `unreal/RiverOaks.uproject` (`EngineAssociation: 5.6`), `unreal/Source/RiverOaks/RiverOaks.Build.cs` |
| Engine execution | Never compiled or run on the development host; automation tests authored but unexecuted | `docs/unreal.md` |
| World coordinates | Manifest: EPSG:32615 local east/north/up **meters**, origin `[-95.425, 29.755]`. UE: X=east, Y=south, Z=up **centimeters** via `RiverOaksRules::ToUnreal` (`X*100, -Y*100, Z*100`) | `unreal/Source/RiverOaks/Public/RiverOaksRules.h`, `docs/superpowers/plans/2026-09-17-river-oaks.md` |
| Coordinate test | `RiverOaks.Contracts.Coordinates` round-trips `ToUnreal`/`ToMeters` | `unreal/Source/RiverOaks/Private/Tests/RiverOaksRulesTests.cpp` |
| NPC representation (UE) | `FRiverAgent` (id, kind, action, position, route, speed, `ActionUntil`, blocked). Rendered as one `UInstancedStaticMeshComponent` (`People`) of engine `Sphere` instances scaled `(.6, .6, 1.8)`; transforms updated per tick in `MoveAgents` | `unreal/Source/RiverOaks/Public/RiverOaksWorld.h`, `unreal/Source/RiverOaks/Private/RiverOaksWorld.cpp` (`SpawnAgents`, `MoveAgents`) |
| NPC decisions | `POST /v1/decisions` on loopback `127.0.0.1:8765`; one request outstanding; snapshot at most every 2 s; 1.25 s HTTP timeout; responses older than 1.5 s rejected; actions `continue, pause, greet, redirect, seek_shelter, slow, stop`; local collision/schedule/weather limits authoritative | `src/river_oaks/service.py`, `src/river_oaks/agents.py`, `docs/unreal.md` |
| Movement | Local step cap 50 ms, static-collision sphere sweep, route-edge offsets; "not skeletal animation, crowd navigation, surveyed sidewalks" | `RiverOaksWorld.cpp` `MoveAgents`, `docs/unreal.md` |
| Asset slots | `BuildingStyleMeshes`, `CanopyMesh`, `BlockoutMaterial`; meshes must use centered 100 cm nominal bounds | `RiverOaksWorld.h`, `docs/unreal.md` |
| Browser showcase | Vite 8 + three 0.186 development view; "not the final UE5 renderer". At `1fe85a3` people are generic meshes. **In flight, uncommitted in the primary checkout at time of writing:** six CC0 MakeHuman/MPFB skeletal GLB profiles (`preview/src/avatars.js`, `preview/public/assets/characters/`, `scripts/build_characters.py`, `scripts/fetch_character_assets.py`, `docs/visual-fidelity.md`), 27–36 k triangles each, ~9.5 MiB total, 120 m distance gate, hash/skeleton/budget tests in `preview/tests/avatars.test.js` | `package.json`, `preview/src/`, `docs/showcase.md`; in-flight files as listed |
| Personas | 20 fictional residents plus 4 portrayals of real public figures with linked public biographies and authored dialogue | `preview/src/personas.js`, `docs/showcase.md` |
| Python side | `river-oaks` CLI, FastAPI bridge, optional Kokoro voice; Python ≥3.11, uv lockfile, ruff, pytest | `pyproject.toml` |
| License | No `LICENSE` or `COPYING` file at HEAD | repository root listing |
| Astra references | None in live source (`astra`, `tafi`, `metahuman`, `avatar`, `skeletal`, `retarget`, `gltf` grep) | repository grep excluding `node_modules`, `.venv`, `dist` |

## 3. What is and is not known about Astra

The earlier draft's Astra facts came from two public sources: Tafi's September
2022 public-launch announcement and a Tafi-authored AWS GameTech article. They
were not re-fetched for this revision; treat them as historical capability
claims, not current SDK documentation.

| Publicly described (2021–2022) | Not publicly specified | Consequence for River Oaks |
|---|---|---|
| Full-body avatar creation and customization | Object model, class names, language bindings | No Tafi symbols outside one adapter translation unit |
| Morphable body shapes | Channel identifiers, ranges, neutral values | Semantic morph names in River Oaks; adapter resolves vendor IDs |
| Clothing with automatic fit and hidden-skin removal | Cloth solver API, garment topology | Garments are opaque `AssetId`s |
| Hair, decals, thousands of content assets | Hair representation, decal API, content license terms | Capability flags, EULA gate |
| User-authored assets via Max, Maya, Blender, Substance, ZBrush | Accepted file formats and export presets | Keep a repository-owned master source; add a vendor conversion step |
| Streamed, on-demand assets processed client-side | CDN endpoints, auth, cache and offline rights | Async prefetch; never on the spawn path |
| Windows, macOS, Linux, iOS, Android | 2026 OS, compiler, GPU minimums | `astra_probe` before selecting targets |
| Historical Amazon Lumberyard association | Any Unreal Engine plugin or sample | UE5 hosting is a River Oaks decision to validate, not a vendor claim |

Not established anywhere public: skeleton hierarchy, bone names, bind pose,
coordinate basis, whether arbitrary runtime joint poses can be applied, facial
channel set, material and shader model, LOD API, export rights, or any
performance figure. Section 10 turns each into a probe.

## 4. Architecture

```
Jev (TypeSafe)  ──HTTP──▶  river-oaks bridge (Python, loopback :8765)
                                  │  /v1/decisions  (unchanged)
                                  ▼
                     ARiverOaksWorld  (UE5 RiverOaks module)
                        │ MoveAgents: local rules, collision, schedule, weather
                        │ FRiverAgent → FRiverHumanState (new, section 5)
                        ▼
                  IRiverHumanBackend  (UE interface, River Oaks-owned)
                  ┌──────────────┼──────────────────┐
                  ▼              ▼                   ▼
          MarkerBackend    SkeletalBackend     AstraBackend
          (today's ISM     (UE skeletal mesh   (optional plugin,
           spheres; keep)   + anim blueprint;   RIVER_OAKS_ASTRA=1,
                            fallback, crowds)   vendor SDK linked)
```

Rules:

1. **UE5 hosts Astra.** The backend is a UE plugin (`unreal/Plugins/RiverOaksAstra`)
   compiled only when `RIVER_OAKS_ASTRA` is defined and `ASTRA_SDK_ROOT` is
   supplied to UnrealBuildTool. The public repository builds with it off.
2. **The out-of-process sidecar is a contingency only**, used if the probe
   proves Astra cannot be linked into a UE module (incompatible runtime, its
   own renderer with no host-render path). It would still speak the same
   `FRiverHumanState` contract, marshalled over loopback like the decision
   service already is.
3. **The browser showcase does not get Astra.** It is a development view. Its
   people are already moving to skeletal GLB characters (the in-flight CC0
   MakeHuman/MPFB work noted in section 2). That path is the showcase's
   permanent renderer; the only coupling to this plan is the semantic
   appearance recipe in section 5, so `avatarProfile(index)` and a UE recipe
   can be derived from one record. Do not add a second GLB pipeline.
4. **Simulation authority does not move.** `MoveAgents` keeps computing
   position, heading, blocking, and action expiry. Backends receive a pose and
   appearance; they return nothing that changes simulation state.

### Backend strategy trade-off

| Strategy | Isolation | Coupling to Astra ABI | Fits repository | Use |
|---|---|---|---|---|
| Astra as UE plugin in `RiverOaks` process | Medium | Plugin only | Yes: one engine, one build | **Primary** |
| Astra sidecar over loopback | High | Sidecar only | Adds a second native runtime | Contingency |
| Offline Astra export to UE skeletal assets | Highest | Build-time only | Yes, if EULA and tooling allow | Preferred for crowds if legal |
| UE skeletal mesh fallback (no Astra) | High | None | Yes | **Mandatory** |
| Instanced marker (current) | High | None | Already shipped | Debug and CI |

## 5. Contracts

### 5.1 Coordinates

Canonical space is the **existing manifest space**: local east/north/up meters,
EPSG:32615, origin `[-95.425, 29.755]`. UE space is X=east, Y=south, Z=up
centimeters via `RiverOaksRules::ToUnreal`. This is already tested; do not
introduce a third convention. Astra's basis (handedness, up axis, forward,
unit, quaternion order) is an unknown recorded by the probe and applied only
inside `AstraBackend`.

```
manifest (E,N,U m) ─ToUnreal─▶ UE (X,-Y,Z cm) ─adapter─▶ Astra basis (probe-defined)
```

### 5.2 Human state (extends, does not replace, `FRiverAgent`)

```cpp
// unreal/Source/RiverOaks/Public/RiverOaksHumans.h  (proposed)
struct FRiverHumanPose
{
    uint64  Sequence = 0;          // monotonic per agent
    double  SimTimeSeconds = 0.;   // FPlatformTime-based, not frame index
    FTransform Root;               // UE space, cm; authoritative from MoveAgents
    TArray<FTransform> Joints;     // indexed by ERiverJoint, local space
    TMap<FName, float> Morphs;     // semantic channel → 0..1
    FName Locomotion;              // idle | walk | jog | pause | shelter ...
};

struct FRiverAppearanceRecipe
{
    FName BodyPreset;
    FName HairAsset;
    TArray<FName> Garments;
    TMap<FName, float> BodyMorphs;
    bool bPortrayalLocked = false; // section 9: never likeness-derived
};

enum class ERiverJoint : uint8
{
    Root, Pelvis, Spine01, Spine02, Spine03, Neck01, Head,
    ClavicleL, UpperArmL, LowerArmL, HandL,
    ClavicleR, UpperArmR, LowerArmR, HandR,
    ThighL, CalfL, FootL, BallL,
    ThighR, CalfR, FootR, BallR,
    Count
};
```

`FRiverAgent` gains `FRiverAppearanceRecipe Appearance` and a backend handle.
Nothing in the decision protocol changes; `schema_version: 1` stays.

### 5.3 Backend interface

```cpp
// River Oaks-owned. None of these are Tafi names.
class IRiverHumanBackend
{
public:
    virtual ~IRiverHumanBackend() = default;
    virtual FRiverHumanCapabilities Probe() = 0;
    virtual int32 CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe) = 0;
    virtual void   DestroyHuman(int32 Handle) = 0;
    virtual void   ApplyPose(int32 Handle, const FRiverHumanPose& Pose) = 0;
    virtual void   SetLod(int32 Handle, ERiverHumanLod Lod) = 0;
    virtual void   Tick(float DeltaSeconds) = 0;   // game thread, after MoveAgents
};
```

`ARiverOaksWorld::SpawnAgents` selects the backend (`MarkerBackend` when no
other is configured) and `MoveAgents` ends by calling `ApplyPose` instead of
`People->UpdateInstanceTransform`. The instanced-sphere path becomes
`MarkerBackend` so nothing regresses when Astra is absent.

### 5.4 Authority

| Concern | Owner | Today's code |
|---|---|---|
| Position, heading, blocked | `MoveAgents` | unchanged |
| Action selection and expiry | decision bridge + `FallbackAction` | unchanged |
| Collision, bounds, schedule, weather limits | `RiverOaksRules` | unchanged |
| Root motion | `MoveAgents` only; backends never integrate root deltas | new rule |
| Locomotion clip choice | River Oaks animation layer (new) | new |
| Skeleton retarget, foot/hand/look IK | River Oaks adapter, UE anim graph | new |
| Body mesh, clothing fit, morphs, skin/hair/eyes | backend (Astra where available) | new |
| Secondary cloth/hair motion | backend if exposed, else UE | new |

Update order per tick: bridge decisions → `MoveAgents` (physics-lite, rules)
→ locomotion state → skeleton sampling → retarget → IK → `ApplyPose` → render.

### 5.5 Skeleton mapping

Astra's bone names are never River Oaks' bone names. A per-backend JSON map
(`unreal/Config/HumanSkeletonMaps/astra.json`, produced by the probe) binds
`ERiverJoint` to vendor joints and records the vendor bind pose. Retargeting is
computed in bind space (`R_vendor_bind · inverse(R_canonical_bind) · R_anim`),
not by string renaming, and must handle parent-order and limb-length
differences. The map file fails validation when any required joint is missing
or two canonical joints map to one vendor joint.

## 6. Build and packaging

- Plugin: `unreal/Plugins/RiverOaksAstra/` with `RiverOaksAstra.uplugin` and a
  `RiverOaksAstra.Build.cs` that reads `ASTRA_SDK_ROOT` from the environment,
  fails with a clear message if unset, and adds the vendor include and library
  paths. Vendor binaries are never committed.
- `RiverOaks.Build.cs` gains an optional dependency on `RiverOaksAstra` guarded
  by `RIVER_OAKS_ASTRA`. The Editor and Game targets build with it off in CI.
- Runtime delivery: the plugin binary and any EULA-permitted Astra runtime files
  ship under `Plugins/RiverOaksAstra/Binaries` and `ThirdParty/Astra` only in
  builds produced on a licensed host. Fallback skeletal assets ship always.
- The existing GitHub workflow keeps running Python tests, secret scans, and the
  preview build; an Astra-enabled job runs only on a self-hosted runner that is
  permitted to hold the SDK, pulling binaries from an approved artifact store.
- No CMake. The earlier draft's `CMakeLists.txt`, `include/river_oaks/`, and
  Protobuf schema are dropped; UE types and UBT replace them.

## 7. Asset pipeline

```
master character source (OpenUSD or DCC scene; repository-owned)
   ├─▶ Astra authoring route   → vendor processing → streamed assets   [EULA gate]
   ├─▶ UE skeletal route       → .uasset skeletal mesh + anim BP       [fallback]
   └─▶ GLB route               → preview/public/assets/characters/*.glb [showcase; exists in flight via scripts/build_characters.py]
```

- A `humans.manifest.json` sidecar (not a change to `world.json` schema 1)
  records per-recipe: source hash, backend variants, vendor asset IDs, SDK
  build, and the skeleton profile. `uv run river-oaks verify` can validate it
  offline without the engine.
- Python does preprocessing and validation only (`scripts/validate_rig.py`),
  never per-frame work. It uses the repository's uv environment and ruff rules.
- Asset acceptance for UE keeps the existing slot convention: centered meshes,
  documented nominal bounds, simple collision where required.

## 8. Streaming, fallback, and synchronization

Astra's public description is runtime and streaming oriented. Spawn must never
block on human assets: `SpawnAgents` creates the fallback representation first
and swaps at a safe point when Astra assets arrive.

```
UNRESOLVED → PREFETCHING → ASTRA_READY → ACTIVE_ASTRA
                 │ timeout/error/offline        │ vendor fault
                 └────────▶ ACTIVE_FALLBACK ◀───┘
```

| Failure | Response | Simulation impact |
|---|---|---|
| CDN slow or offline | keep fallback; retry with backoff; use cache only if EULA allows | none |
| Asset missing | nearest fallback recipe | none |
| Plugin init fails | disable backend for session, log once | none |
| Skeleton map invalid | reject asset, fallback | none |
| VRAM pressure | drop LOD tier, then swap distant humans to fallback | none |
| Unknown SDK build | fail probe, refuse to load | none |

Poses carry `Sequence` and `SimTimeSeconds`; a backend drops out-of-order
frames and interpolates between the two newest for render. This mirrors the
existing stale-tick rejection in the decision bridge.

## 9. Likeness, privacy, and content policy

The showcase portrays Ima Hogg, Barbara Jordan, Hakeem Olajuwon, and Beyoncé as
fictional encounters and states that generic meshes and preset voices do not
reproduce their likenesses (`docs/showcase.md`). An ultra-realistic pipeline
must keep that true by construction:

1. `bPortrayalLocked` recipes use catalogue presets only; no morphs derived
   from photographs, scans, or measurements of the portrayed person. The
   in-flight showcase already does this at code level: `avatarProfile(index)`
   in `preview/src/avatars.js` maps the four portrayals to generic profiles
   with the comment "never scans or likenesses of them". The UE recipe must
   preserve that mapping, not reopen it.
2. No face geometry, scan, or biometric capture of any real person enters the
   pipeline. Texas CUBI treats face geometry records as biometric identifiers
   requiring notice and consent for commercial capture; other jurisdictions
   (for example Illinois BIPA) differ. Avoiding capture avoids the question.
3. Every face, hair, and garment asset carries provenance in the manifest.
4. Voice presets remain generic; no voice cloning of portrayed people.
5. Privacy review is a listed delivery gate in the execution ledger and stays
   one here.

This is an engineering control, not legal advice.

## 10. Probe gates (before any vendor code)

`astra_probe` is a throwaway UE commandlet or console program built on a
licensed host. It must produce a written record of:

| Probe | Pass condition |
|---|---|
| SDK identity | exact version, package hashes, EULA copy archived internally |
| Toolchain | compiles with the UE5.6 supported compiler; runtime dependencies listed |
| Hosting | can be linked into a UE module, or needs its own process/renderer |
| Basis | handedness, up, forward, unit, quaternion order verified experimentally |
| Skeleton | joint hierarchy, names, bind pose dumped to `astra.json` |
| Pose input | arbitrary per-joint runtime poses accepted, or clip-only |
| Morphs | body and facial channels enumerated with ranges |
| Materials | skin, eye, hair, cloth representation; host-lighting compatibility |
| LOD | native tiers, if any |
| Streaming | auth model, cache location, offline behavior, retry semantics |
| Export | whether meshes/textures may be extracted technically and legally |
| Performance | one hero character and a 50-agent crowd on the target GPU class |

## 11. Testing

Extend `RiverOaksRulesTests.cpp` (still unexecuted until an engine exists):

- `RiverOaks.Contracts.HumanRig`: required `ERiverJoint` coverage, duplicate
  vendor-joint rejection, bind-pose round trip.
- `RiverOaks.Contracts.HumanPose`: +1 m root translation, 90° yaw/pitch/roll,
  left/right hand raise, sequence ordering and stale-pose drop.
- `RiverOaks.Contracts.HumanAuthority`: a backend cannot alter `FRiverAgent`
  position or action; `MoveAgents` output equals pre-backend output.

Python (runs today): `tests/test_humans_manifest.py` for manifest validation
and skeleton-map rules. Visual fidelity uses fixed cameras, lighting, and
exposure with human review as the release gate; pixel metrics catch
regressions only. Performance uses the existing 500-agent benchmark shape with
`stat unit`, Unreal Insights, and (NVIDIA) Nsight captures, sweeping 1 → 500
agents until the stated p95 frame-time or VRAM budget breaks. No Astra
performance number is quoted here because none has been measured.

## 12. Licensing

- Repository: no license file exists. Public visibility grants no reuse
  rights. Add a license before external contributors or vendor adapter code.
- Astra: the public announcements are not the operative agreement. Determine
  from the current EULA and content license whether SDK headers, runtime
  libraries, catalogue content, cached streams, generated avatars, exported
  meshes, screenshots, and commercial deployment are permitted. Until then
  assume no redistribution.
- Package boundaries: `river-oaks` core under the chosen project license;
  `RiverOaksAstra` adapter source under the project license where possible;
  Astra SDK, runtime, and assets under Tafi terms and never in Git.

## 13. Roadmap

1. **Foundation (no vendor needed).** Introduce `IRiverHumanBackend`, move the
   sphere path into `MarkerBackend`, add `FRiverHumanPose`, the skeleton-map
   validator, manifest sidecar, and the three contract tests. Requires a UE5.6
   host to compile; author now, execute when available.
2. **Skeletal fallback.** One licensed or original UE skeletal mesh with a
   locomotion anim blueprint driven by `Locomotion`; this is the permanent
   crowd and offline path.
3. **Astra probe.** Section 10, on a licensed host, with EULA in hand.
4. **Single-human vertical slice.** Bridge decision → `MoveAgents` → pose →
   Astra render, switchable to fallback at runtime.
5. **Appearance pipeline.** Recipes, prefetch, clothing fit validation across
   the required body range, portrayal locks.
6. **Fidelity.** Foot IK, look-at, facial channels, hero-lighting review.
7. **Crowd scale.** Importance-based LOD, Astra for foreground, skeletal
   fallback beyond a measured threshold.
8. **Hardening.** Cache bounds, SBOM, SDK pinning, fault injection, privacy
   review, deterministic replay from recorded decision packets.

## 14. Risks

| Risk | Now | Impact | Mitigation |
|---|---|---|---|
| Current Astra SDK unavailable or changed since 2022 | high/unknown | critical | probe first; backend interface keeps the project viable without it |
| Astra cannot link into UE | unknown | high | sidecar contingency over loopback |
| No arbitrary pose API | unknown | critical | confirm in probe; otherwise clip-only or a different vendor |
| UE never compiled here | certain | high | engine host is a listed delivery dependency |
| Skeleton incompatible with animation corpus | medium | high | bind-space retarget, semantic joints |
| Crowd cost | high | high | skeletal fallback beyond threshold; measure, do not assume |
| Likeness escalation for the four portrayals | certain if ignored | high | section 9 locks |
| No repository license | certain | high | add before adapter work |
| Vendor lock-in | medium | high | repository-owned master sources, GLB and UE fallbacks |

## 15. References

Repository (read at `1fe85a3`): `unreal/RiverOaks.uproject`,
`unreal/Source/RiverOaks/RiverOaks.Build.cs`,
`unreal/Source/RiverOaks/Public/RiverOaksWorld.h`,
`unreal/Source/RiverOaks/Public/RiverOaksRules.h`,
`unreal/Source/RiverOaks/Private/RiverOaksWorld.cpp`,
`unreal/Source/RiverOaks/Private/Tests/RiverOaksRulesTests.cpp`,
`src/river_oaks/service.py`, `src/river_oaks/agents.py`, `docs/unreal.md`,
`docs/showcase.md`, `preview/src/personas.js`,
`docs/superpowers/plans/2026-09-17-river-oaks.md`, `pyproject.toml`,
`package.json`.

External sources carried over from the earlier draft and **not re-verified in
this revision**: Tafi Astra public-launch announcement (PR Newswire,
2022-09-01); "How Tafi is democratizing avatar and character solutions" (AWS
GameTech blog); Khronos glTF 2.0 specification; OpenUSD UsdSkel, `metersPerUnit`
and up-axis documentation; GitHub "Licensing a repository"; Texas Attorney
General, Biometric Identifier Act page; NVIDIA Nsight Graphics.
