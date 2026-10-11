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
    const FTransform Initial(FQuat::Identity, FVector::ZeroVector, FVector(ScaleX, ScaleY, ScaleZ));
    int32 InstanceIndex;
    if (FreeInstances.IsEmpty()) InstanceIndex = Instances->AddInstance(Initial, true);
    else
    {
        InstanceIndex = FreeInstances.Pop(EAllowShrinking::No);
        if (!Instances->UpdateInstanceTransform(InstanceIndex, Initial, true, false, true)) return INDEX_NONE;
    }
    // Refuse before taking a ledger handle. A live handle backed by no instance would be reported
    // to the host as a created human and then silently swallow every pose sent to it.
    if (InstanceIndex == INDEX_NONE) return INDEX_NONE;
    const int32 Handle = PoseLedger.Create();
    if (Handle == INDEX_NONE)
    {
        Instances->UpdateInstanceTransform(InstanceIndex,
            FTransform(FQuat::Identity, FVector::ZeroVector, FVector::ZeroVector), true, false, true);
        FreeInstances.Add(InstanceIndex);
        bDirty = true;
        return INDEX_NONE;
    }
    InstanceOfHandle.Add(Handle, InstanceIndex);
    bDirty = true;
    return Handle;
}

void FRiverMarkerBackend::DestroyHuman(int32 Handle)
{
    if (!PoseLedger.Destroy(Handle)) return;
    // Preserve other live indices, but reuse the collapsed slot under a fresh handle.
    int32 InstanceIndex;
    if (InstanceOfHandle.RemoveAndCopyValue(Handle, InstanceIndex) && Instances.IsValid())
    {
        Instances->UpdateInstanceTransform(InstanceIndex,
            FTransform(FQuat::Identity, FVector::ZeroVector, FVector::ZeroVector), true, false, true);
        FreeInstances.Add(InstanceIndex);
    }
    bDirty = true;
}

bool FRiverMarkerBackend::ApplyPose(int32 Handle, const FRiverHumanPose& Pose)
{
    if (!PoseLedger.Accept(Handle, Pose.Sequence)) return false;
    const int32* InstanceIndex = InstanceOfHandle.Find(Handle);
    if (!Instances.IsValid() || !InstanceIndex) return false;
    Instances->UpdateInstanceTransform(*InstanceIndex,
        FTransform(Pose.Root.GetRotation(), Pose.Root.GetLocation(), FVector(ScaleX, ScaleY, ScaleZ)), true, false, true);
    bDirty = true;
    return true;
}

void FRiverMarkerBackend::Tick(float DeltaSeconds)
{
    if (bDirty && Instances.IsValid()) Instances->MarkRenderStateDirty();
    bDirty = false;
}
