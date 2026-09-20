#pragma once
#include "CoreMinimal.h"
#include "Containers/ArrayView.h"
#include "Features/IModularFeature.h"

// River Oaks-owned human-rendering contract. See docs/astra-integration.md sections 4-5.
// Backends receive poses and appearance; they never own or alter simulation state.

enum class ERiverJoint : uint8
{
    Root, Pelvis, Spine01, Spine02, Spine03, Neck01, Head,
    ClavicleL, UpperArmL, LowerArmL, HandL,
    ClavicleR, UpperArmR, LowerArmR, HandR,
    ThighL, CalfL, FootL, BallL,
    ThighR, CalfR, FootR, BallR,
    Count
};

enum class ERiverHumanLod : uint8 { Hero, High, Medium, Crowd, Impostor };

struct FRiverHumanPose
{
    uint64 Sequence = 0;            // strictly increasing per human; stale poses are dropped
    double SimTimeSeconds = 0.;     // FPlatformTime-based, never a frame index
    FTransform Root;                // UE cm, anchor 90 cm above route ground; authoritative from MoveAgents
    TArray<FTransform> Joints;      // indexed by ERiverJoint, local space; empty for marker/crowd tiers
    TMap<FName, float> Morphs;      // semantic channel -> 0..1
    FName Locomotion;               // idle | walk | walk_slow | jog | shelter
};

// Never hand-built by callers in production: resolved from the River Oaks catalogue and
// validated before any backend sees it.
struct FRiverAppearanceRecipe
{
    FName CatalogueId;
    FName BodyPreset;
    FName HairAsset;
    TArray<FName> Garments;
    TMap<FName, float> BodyMorphs;
};

struct FRiverHumanCapabilities
{
    FName BackendName;
    FString BackendVersion;
    int32 Priority = 0;             // Select() prefers the highest; the marker fallback is 0
    bool bRuntimePoseInput = false;
    bool bBodyMorphs = false;
    bool bFacialMorphs = false;
    bool bStreamedAssets = false;
    bool bNativeLod = false;
};

// Handle bookkeeping shared by backends: allocates handles and enforces the
// strictly-increasing pose sequence rule. UObject-free so it is testable with no engine world.
class RIVEROAKS_API FRiverHumanPoseLedger
{
public:
    int32 Create();
    bool Destroy(int32 Handle);
    bool IsLive(int32 Handle) const;
    // Accepts only a live handle with a sequence greater than the last accepted one.
    bool Accept(int32 Handle, uint64 Sequence);
    uint64 LastSequence(int32 Handle) const;
    int32 Num() const { return Entries.Num(); }
private:
    struct FEntry { uint64 LastSequence = 0; bool bLive = false; };
    TArray<FEntry> Entries;
};

// Backend discovery gate. Discovery is enabled: URiverAppearanceCatalogue resolves every recipe
// and FRiverRecipeValidator checks it before ARiverOaksWorld calls CreateHuman, so a discovered
// plugin can no longer receive an unvalidated or altered appearance (docs/astra-integration.md
// sections 5.2 and 9). Setting this to false pins the host to FRiverMarkerBackend, which stays
// the documented way to run without any plugin.
inline constexpr bool bRiverHumanBackendDiscoveryEnabled = true;

// Backends are discovered, not linked: a plugin registers an implementation under
// GetModularFeatureName() at module startup; the host never depends on the plugin.
class RIVEROAKS_API IRiverHumanBackend : public IModularFeature
{
public:
    virtual ~IRiverHumanBackend() = default;

    static FName GetModularFeatureName() { return FName(TEXT("RiverHumanBackend")); }

    // Highest-priority registered backend, or Fallback when none beats it (ties keep Fallback).
    // Reads the process-wide modular-feature registry.
    static IRiverHumanBackend* Select(IRiverHumanBackend* Fallback);
    // The same rule over an explicit candidate set, bypassing the registry. The host never calls
    // this; it exists so contract tests do not depend on what a loaded plugin has registered.
    static IRiverHumanBackend* SelectFrom(IRiverHumanBackend* Fallback,
                                          TArrayView<IRiverHumanBackend* const> Candidates);

    virtual FRiverHumanCapabilities Probe() const = 0;
    // Returns a handle owned by this backend, or INDEX_NONE to refuse the human.
    // INDEX_NONE is the ONLY refusal value: the host treats every other return as a live handle
    // and will send it poses. A backend that cannot render an agent MUST return INDEX_NONE so the
    // host can fall back to the marker backend -- returning 0 or any other sentinel on failure
    // silently defeats that fallback and strands the agent with no visible representation.
    virtual int32 CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe) = 0;
    virtual void DestroyHuman(int32 Handle) = 0;
    // Returns false when the handle is unknown or the pose is stale; the pose is then ignored.
    virtual bool ApplyPose(int32 Handle, const FRiverHumanPose& Pose) = 0;
    virtual void SetLod(int32 Handle, ERiverHumanLod Lod) = 0;
    // Game thread, after ARiverOaksWorld::MoveAgents has applied every pose for the tick.
    virtual void Tick(float DeltaSeconds) = 0;
};
