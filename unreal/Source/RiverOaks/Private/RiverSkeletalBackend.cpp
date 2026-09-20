#include "RiverSkeletalBackend.h"
#include "RiverAppearanceCatalogue.h"
#include "RiverOaksRules.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "GameFramework/Actor.h"

FRiverSkeletalBackend::FRiverSkeletalBackend(AActor* InOwner,
    const TMap<FName, FRiverSkeletalAppearance>& InAppearances) : Owner(InOwner)
{
    for (const auto& Entry : InAppearances)
        Appearances.Add(Entry.Key, { Entry.Value.Mesh.Get(), Entry.Value.AnimClass.Get() });
}

FRiverSkeletalBackend::~FRiverSkeletalBackend() { DestroyComponents(); }

bool FRiverSkeletalBackend::FAssets::IsUsable() const
{
    const auto* Asset = Mesh.Get();
    const auto* Class = AnimClass.Get();
    if (!Asset || !Asset->GetSkeleton() || !Class ||
        !Class->IsChildOf(URiverLocomotionAnimInstance::StaticClass()) ||
        Class->HasAnyClassFlags(CLASS_Abstract)) return false;
    const FBox Bounds = Asset->GetImportedBounds().GetBox();
    return Bounds.IsValid && !Bounds.Min.ContainsNaN() && !Bounds.Max.ContainsNaN() &&
        FMath::IsFinite(Bounds.GetSize().Z) && Bounds.GetSize().Z > UE_SMALL_NUMBER;
}

bool FRiverSkeletalBackend::IsUsable() const
{
    if (!Owner.IsValid() || !Owner->GetWorld() || !Owner->GetRootComponent()) return false;
    for (const auto& Entry : Appearances)
        if (URiverAppearanceCatalogue::Find(Entry.Key) && Entry.Value.IsUsable()) return true;
    return false;
}

FRiverHumanCapabilities FRiverSkeletalBackend::Probe() const
{
    FRiverHumanCapabilities Caps;
    Caps.BackendName = FName(TEXT("Skeletal"));
    Caps.BackendVersion = TEXT("1");
    Caps.Priority = BackendPriority;
    Caps.bRuntimePoseInput = true;
    // Stature is uniform mesh scaling; arbitrary body/facial morph targets are not supported.
    Caps.bNativeLod = true;
    return Caps;
}

USkeletalMeshComponent* FRiverSkeletalBackend::ComponentFor(int32 Handle) const
{
    return PoseLedger.IsLive(Handle) && Humans.IsValidIndex(Handle)
        ? Humans[Handle].Component.Get() : nullptr;
}

int32 FRiverSkeletalBackend::NumLiveComponents() const
{
    int32 Live = 0;
    for (const FHuman& Human : Humans)
        if (Human.Component.IsValid()) ++Live;
    return Live;
}

int32 FRiverSkeletalBackend::CreateHuman(const FString& AgentId, const FRiverAppearanceRecipe& Recipe)
{
    FString Reason;
    const FAssets* Assets = Appearances.Find(Recipe.CatalogueId);
    const float* Stature = Recipe.BodyMorphs.Find(TEXT("Stature"));
    if (!IsUsable() || !Assets || !Assets->IsUsable() || !Stature ||
        !FRiverRecipeValidator::Validate(Recipe, Reason)) return INDEX_NONE;

    const FBox Bounds = Assets->Mesh->GetImportedBounds().GetBox();
    const double Scale = *Stature * 100. / Bounds.GetSize().Z;
    auto* Component = NewObject<USkeletalMeshComponent>(Owner.Get());
    if (!Component) return INDEX_NONE;
    Component->SetSkeletalMesh(Assets->Mesh.Get());
    Component->SetAnimInstanceClass(Assets->AnimClass.Get());
    Component->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    Component->SetVisibility(false, true); // the first accepted pose makes it visible
    Component->VisibilityBasedAnimTickOption = EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
    Component->SetupAttachment(Owner->GetRootComponent());
    Component->RegisterComponent();
    auto* Anim = Cast<URiverLocomotionAnimInstance>(Component->GetAnimInstance());
    if (!Component->IsRegistered() || !Anim)
    {
        Component->DestroyComponent();
        return INDEX_NONE;
    }
    Anim->SetRootMotionMode(ERootMotionMode::IgnoreRootMotion);
    Anim->ApplyLocomotion(NAME_None, 0.f);

    const int32 Handle = PoseLedger.Create();
    while (Humans.Num() <= Handle) Humans.AddDefaulted();
    FHuman& Human = Humans[Handle];
    Human.Component = Component;
    Human.MeshToRoot = FTransform(FQuat::Identity,
        FVector(0, 0, -RiverOaksRules::HumanRootHeightCm - Bounds.Min.Z * Scale), FVector(Scale));
    return Handle;
}

void FRiverSkeletalBackend::DestroyHuman(int32 Handle)
{
    auto* Component = ComponentFor(Handle);
    if (!PoseLedger.Destroy(Handle)) return;
    if (Component) Component->DestroyComponent();
    if (Humans.IsValidIndex(Handle)) Humans[Handle] = FHuman();
}

bool FRiverSkeletalBackend::ApplyPose(int32 Handle, const FRiverHumanPose& Pose)
{
    auto* Component = ComponentFor(Handle);
    auto* Anim = Component ? Cast<URiverLocomotionAnimInstance>(Component->GetAnimInstance()) : nullptr;
    if (!Component || !Anim || !Pose.Root.IsValid() || !FMath::IsFinite(Pose.SimTimeSeconds) ||
        !PoseLedger.Accept(Handle, Pose.Sequence)) return false;
    FHuman& Human = Humans[Handle];
    Component->SetWorldTransform(Human.MeshToRoot * Pose.Root, false, nullptr, ETeleportType::TeleportPhysics);
    if (!Human.bHasPose) Component->SetVisibility(true, true);
    const double Elapsed = Pose.SimTimeSeconds - Human.LastTime;
    const float GroundSpeed = Human.bHasPose && Elapsed > 0.
        ? static_cast<float>(FVector::Dist2D(Pose.Root.GetLocation(), Human.LastRoot) / Elapsed) : 0.f;
    Anim->ApplyLocomotion(Pose.Locomotion, GroundSpeed);
    Human.LastTime = Pose.SimTimeSeconds;
    Human.LastRoot = Pose.Root.GetLocation();
    Human.bHasPose = true;
    return true;
}

void FRiverSkeletalBackend::SetLod(int32 Handle, ERiverHumanLod Lod)
{
    auto* Component = ComponentFor(Handle);
    if (!Component) return;
    // Keep a visible mesh at every tier; no separate impostor asset is provided by this backend.
    Component->VisibilityBasedAnimTickOption =
        (Lod == ERiverHumanLod::Hero || Lod == ERiverHumanLod::High)
            ? EVisibilityBasedAnimTickOption::AlwaysTickPoseAndRefreshBones
            : EVisibilityBasedAnimTickOption::OnlyTickPoseWhenRendered;
}

void FRiverSkeletalBackend::Tick(float DeltaSeconds) {}

void FRiverSkeletalBackend::DestroyComponents()
{
    for (int32 Handle = 0; Handle < Humans.Num(); ++Handle) DestroyHuman(Handle);
    Humans.Reset();
}
