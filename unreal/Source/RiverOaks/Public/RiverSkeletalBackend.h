#pragma once
#include "CoreMinimal.h"
#include "RiverLocomotionAnimInstance.h"
#include "RiverOaksHumans.h"
#include "RiverSkeletalBackend.generated.h"

class AActor;
class USkeletalMesh;
class USkeletalMeshComponent;

// One imported, fully dressed catalogue preset. Assets must be upright (Z up, Y forward).
// ARiverOaksWorld owns these references through a UPROPERTY map keyed by CatalogueId.
USTRUCT()
struct RIVEROAKS_API FRiverSkeletalAppearance
{
    GENERATED_BODY()

    UPROPERTY(EditAnywhere, Category="River Oaks|Assets")
    TObjectPtr<USkeletalMesh> Mesh;
    UPROPERTY(EditAnywhere, Category="River Oaks|Assets")
    TSubclassOf<URiverLocomotionAnimInstance> AnimClass;
};

// Offline skeletal path. Refuses unsupported recipes/configurations so the host can retain
// its marker fallback. The simulation owns movement; mesh scale/origin only adapt the visuals.
class RIVEROAKS_API FRiverSkeletalBackend final : public IRiverHumanBackend
{
public:
    static constexpr int32 BackendPriority = 10;

    FRiverSkeletalBackend(AActor* InOwner, const TMap<FName, FRiverSkeletalAppearance>& InAppearances);
    ~FRiverSkeletalBackend() override;

    bool IsUsable() const;
    virtual FRiverHumanCapabilities Probe() const override;
    virtual int32 CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe) override;
    virtual void DestroyHuman(int32 Handle) override;
    virtual bool ApplyPose(int32 Handle, const FRiverHumanPose& Pose) override;
    virtual void SetLod(int32 Handle, ERiverHumanLod Lod) override;
    virtual void Tick(float DeltaSeconds) override;
    void DestroyComponents();

    const FRiverHumanPoseLedger& Ledger() const { return PoseLedger; }
    int32 NumLiveComponents() const;

private:
    struct FAssets
    {
        TWeakObjectPtr<USkeletalMesh> Mesh;
        TWeakObjectPtr<UClass> AnimClass;
        bool IsUsable() const;
    };
    struct FHuman
    {
        TWeakObjectPtr<USkeletalMeshComponent> Component;
        FTransform MeshToRoot;
        FVector LastRoot = FVector::ZeroVector;
        double LastTime = 0.;
        bool bHasPose = false;
    };
    USkeletalMeshComponent* ComponentFor(int32 Handle) const;

    TWeakObjectPtr<AActor> Owner;
    // The owning actor's reflected map retains assets; this snapshot does not outlive them.
    TMap<FName, FAssets> Appearances;
    FRiverHumanPoseLedger PoseLedger;
    TArray<FHuman> Humans; // indexed by monotonically allocated handle
};
