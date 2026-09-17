#pragma once
#include "CoreMinimal.h"
#include "UObject/WeakObjectPtrTemplates.h"
#include "RiverOaksHumans.h"

class UInstancedStaticMeshComponent;

// The built-in fallback: today's instanced sphere markers behind the backend contract.
// Priority 0; never registered as a modular feature, so any plugin backend with a
// positive priority replaces it and nothing regresses when no plugin is present.
class RIVEROAKS_API FRiverMarkerBackend final : public IRiverHumanBackend
{
public:
    static constexpr float ScaleX = .6f;
    static constexpr float ScaleY = .6f;
    static constexpr float ScaleZ = 1.8f;

    explicit FRiverMarkerBackend(UInstancedStaticMeshComponent* InInstances);

    virtual FRiverHumanCapabilities Probe() const override;
    virtual int32 CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe) override;
    virtual void DestroyHuman(int32 Handle) override;
    virtual bool ApplyPose(int32 Handle, const FRiverHumanPose& Pose) override;
    virtual void SetLod(int32 Handle, ERiverHumanLod Lod) override {}
    virtual void Tick(float DeltaSeconds) override;

    const FRiverHumanPoseLedger& Ledger() const { return PoseLedger; }

private:
    TWeakObjectPtr<UInstancedStaticMeshComponent> Instances;
    FRiverHumanPoseLedger PoseLedger;
    TArray<int32> InstanceOfHandle;
    bool bDirty = false;
};
