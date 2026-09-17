#pragma once
#include "CoreMinimal.h"
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
    FTransform Root;                // UE space (cm); authoritative from ARiverOaksWorld::MoveAgents
    TArray<FTransform> Joints;      // indexed by ERiverJoint, local space; empty for marker/crowd tiers
    TMap<FName, float> Morphs;      // semantic channel -> 0..1
    FName Locomotion;               // idle | walk | walk_slow | jog | shelter
};

// Never hand-built by callers in production: resolved from the River Oaks catalogue and
// validated before any backend sees it (catalogue/validator are the next Foundation step).
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

// Backends are discovered, not linked: a plugin registers an implementation under
// GetModularFeatureName() at module startup; the host never depends on the plugin.
class RIVEROAKS_API IRiverHumanBackend : public IModularFeature
{
public:
    virtual ~IRiverHumanBackend() = default;

    static FName GetModularFeatureName() { return FName(TEXT("RiverHumanBackend")); }

    // Highest-priority registered backend, or Fallback when none beats it (ties keep Fallback).
    static IRiverHumanBackend* Select(IRiverHumanBackend* Fallback);

    virtual FRiverHumanCapabilities Probe() const = 0;
    virtual int32 CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe) = 0;
    virtual void DestroyHuman(int32 Handle) = 0;
    // Returns false when the handle is unknown or the pose is stale; the pose is then ignored.
    virtual bool ApplyPose(int32 Handle, const FRiverHumanPose& Pose) = 0;
    virtual void SetLod(int32 Handle, ERiverHumanLod Lod) = 0;
    // Game thread, after ARiverOaksWorld::MoveAgents has applied every pose for the tick.
    virtual void Tick(float DeltaSeconds) = 0;
};
