#include "RiverMarkerBackend.h"
#include "Components/InstancedStaticMeshComponent.h"

FRiverMarkerBackend::FRiverMarkerBackend(UInstancedStaticMeshComponent* InInstances)
    : Instances(InInstances)
{
}

FRiverHumanCapabilities FRiverMarkerBackend::Probe() const
{
    FRiverHumanCapabilities Caps;
    Caps.BackendName = FName(TEXT("Marker"));
    Caps.BackendVersion = TEXT("1");
    Caps.Priority = 0;
    Caps.bRuntimePoseInput = true;
    return Caps;
}

int32 FRiverMarkerBackend::CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe)
{
    if (!Instances.IsValid()) return INDEX_NONE;
    const int32 InstanceIndex = Instances->AddInstance(
        FTransform(FQuat::Identity, FVector::ZeroVector, FVector(ScaleX, ScaleY, ScaleZ)), true);
    // Refuse before taking a ledger handle. A live handle backed by no instance would be reported
    // to the host as a created human and then silently swallow every pose sent to it.
    if (InstanceIndex == INDEX_NONE) return INDEX_NONE;
    const int32 Handle = PoseLedger.Create();
    while (InstanceOfHandle.Num() <= Handle) InstanceOfHandle.Add(INDEX_NONE);
    InstanceOfHandle[Handle] = InstanceIndex;
    bDirty = true;
    return Handle;
}

void FRiverMarkerBackend::DestroyHuman(int32 Handle)
{
    if (!PoseLedger.Destroy(Handle)) return;
    // Indices of other instances must stay stable, so a destroyed marker is collapsed, not removed.
    if (Instances.IsValid() && InstanceOfHandle.IsValidIndex(Handle) && InstanceOfHandle[Handle] != INDEX_NONE)
        Instances->UpdateInstanceTransform(InstanceOfHandle[Handle],
            FTransform(FQuat::Identity, FVector::ZeroVector, FVector::ZeroVector), true, false, true);
    bDirty = true;
}

bool FRiverMarkerBackend::ApplyPose(int32 Handle, const FRiverHumanPose& Pose)
{
    if (!PoseLedger.Accept(Handle, Pose.Sequence)) return false;
    if (!Instances.IsValid() || !InstanceOfHandle.IsValidIndex(Handle)) return false;
    if (InstanceOfHandle[Handle] == INDEX_NONE) return false;
    Instances->UpdateInstanceTransform(InstanceOfHandle[Handle],
        FTransform(Pose.Root.GetRotation(), Pose.Root.GetLocation(), FVector(ScaleX, ScaleY, ScaleZ)), true, false, true);
    bDirty = true;
    return true;
}

void FRiverMarkerBackend::Tick(float DeltaSeconds)
{
    if (bDirty && Instances.IsValid()) Instances->MarkRenderStateDirty();
    bDirty = false;
}
