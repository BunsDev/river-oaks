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
    const int32 Handle = PoseLedger.Create();
    const int32 InstanceIndex = Instances->AddInstance(
        FTransform(FQuat::Identity, FVector::ZeroVector, FVector(ScaleX, ScaleY, ScaleZ)), true);
    InstanceOfHandle.SetNum(Handle + 1);
    InstanceOfHandle[Handle] = InstanceIndex;
    bDirty = true;
    return Handle;
}

void FRiverMarkerBackend::DestroyHuman(int32 Handle)
{
    if (!PoseLedger.Destroy(Handle)) return;
    // Indices of other instances must stay stable, so a destroyed marker is collapsed, not removed.
    if (Instances.IsValid() && InstanceOfHandle.IsValidIndex(Handle))
        Instances->UpdateInstanceTransform(InstanceOfHandle[Handle],
            FTransform(FQuat::Identity, FVector::ZeroVector, FVector::ZeroVector), true, false, true);
    bDirty = true;
}

bool FRiverMarkerBackend::ApplyPose(int32 Handle, const FRiverHumanPose& Pose)
{
    if (!PoseLedger.Accept(Handle, Pose.Sequence)) return false;
    if (!Instances.IsValid() || !InstanceOfHandle.IsValidIndex(Handle)) return false;
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
