#include "Misc/AutomationTest.h"
#include "RiverAppearanceCatalogue.h"
#include "RiverProceduralAnimInstance.h"
#include "RiverSkeletalBackend.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"

#if WITH_DEV_AUTOMATION_TESTS
// Opt-in asset suite: run after import_residents.py. Contracts remain runnable on a source-only checkout.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverResidentAssetsTest, "RiverOaks.NativeAssets.Residents",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverResidentAssetsTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    AActor* Owner = World->SpawnActor<AActor>();
    auto* Root = NewObject<USceneComponent>(Owner);
    Owner->SetRootComponent(Root);
    Root->RegisterComponent();
    for (int32 Profile = 0; Profile < URiverAppearanceCatalogue::NumProfiles(); ++Profile)
    {
        const auto Recipe = URiverAppearanceCatalogue::Resolve(Profile);
        const FString Id = Recipe.CatalogueId.ToString();
        const FString Folder = Id.Replace(TEXT("-"), TEXT("_"));
        const FString Path = FString::Printf(TEXT("/Game/Generated/Residents/%s/%s.%s"), *Folder, *Id, *Id);
        auto* Mesh = LoadObject<USkeletalMesh>(nullptr, *Path);
        if (!TestNotNull(Id + TEXT(" imported mesh"), Mesh)) continue;
        TestEqual(Id + TEXT(" complete body/hair/clothes/eyes/shoes"), Mesh->GetMaterials().Num(), 5);
        for (const auto& Slot : Mesh->GetMaterials())
            TestNotNull(Id + TEXT(" material assigned"), Slot.MaterialInterface.Get());
        TestTrue(Id + TEXT(" supported gait skeleton"), Mesh->GetRefSkeleton().FindBoneIndex(TEXT("thigh_l")) != INDEX_NONE);

        FRiverSkeletalAppearance Appearance;
        Appearance.Mesh = Mesh;
        Appearance.AnimClass = URiverProceduralAnimInstance::StaticClass();
        TMap<FName, FRiverSkeletalAppearance> Appearances;
        Appearances.Add(Recipe.CatalogueId, Appearance);
        FRiverSkeletalBackend Backend(Owner, Appearances);
        const int32 Handle = Backend.CreateHuman(Id, Recipe);
        TestTrue(Id + TEXT(" accepted"), Handle != INDEX_NONE);
        TArray<USkeletalMeshComponent*> Components;
        Owner->GetComponents(Components);
        if (Components.Num() != 1)
        {
            AddError(Id + TEXT(" expected one live component"));
            continue;
        }
        auto* Component = Components[0];
        Backend.SetLod(Handle, ERiverHumanLod::Hero);
        FRiverHumanPose Pose;
        Pose.Sequence = 1;
        Pose.SimTimeSeconds = 1.;
        Pose.Root = FTransform(FVector(0, 0, 90));
        Pose.Locomotion = TEXT("idle");
        Backend.ApplyPose(Handle, Pose);
        Component->TickAnimation(.033f, false);
        Component->RefreshBoneTransforms();
        const FQuat Rest = Component->GetSocketTransform(TEXT("thigh_l"), RTS_Component).GetRotation();
        const FVector Head = Component->GetSocketTransform(TEXT("head"), RTS_Component).GetLocation();
        const FVector Foot = Component->GetSocketTransform(TEXT("foot_l"), RTS_Component).GetLocation();
        const FVector Toe = Component->GetSocketTransform(TEXT("ball_l"), RTS_Component).GetLocation();
        TestTrue(Id + TEXT(" upright head above feet"), Head.Z - Foot.Z > Mesh->GetImportedBounds().BoxExtent.Z);
        TestTrue(Id + TEXT(" toes face positive X"), Toe.X > Foot.X && FMath::Abs(Toe.Y - Foot.Y) < 1.);
        AddInfo(FString::Printf(TEXT("%s head=%s foot=%s toe=%s"), *Id, *Head.ToString(), *Foot.ToString(), *Toe.ToString()));

        Pose.Sequence = 2;
        Pose.SimTimeSeconds = 1.25;
        Pose.Root.SetLocation(FVector(27.5, 0, 90));
        Pose.Locomotion = TEXT("walk");
        Backend.ApplyPose(Handle, Pose);
        const FTransform Authoritative = Component->GetComponentTransform();
        Component->TickAnimation(.033f, false);
        Component->RefreshBoneTransforms();
        const FQuat Walking = Component->GetSocketTransform(TEXT("thigh_l"), RTS_Component).GetRotation();
        TestFalse(Id + TEXT(" walking evaluates a leg pose"), Rest.Equals(Walking, .01));
        TestTrue(Id + TEXT(" animation cannot move the component"), Authoritative.Equals(Component->GetComponentTransform()));

        Pose.Sequence = 3;
        Pose.SimTimeSeconds = 2.;
        Pose.Locomotion = TEXT("shelter");
        Backend.ApplyPose(Handle, Pose);
        Component->TickAnimation(.033f, false);
        Component->RefreshBoneTransforms();
        TestTrue(Id + TEXT(" shelter returns to stationary pose"),
            Rest.Equals(Component->GetSocketTransform(TEXT("thigh_l"), RTS_Component).GetRotation(), .01));
        Backend.DestroyComponents();
    }
    World->DestroyWorld(false);
    return true;
}
#endif
