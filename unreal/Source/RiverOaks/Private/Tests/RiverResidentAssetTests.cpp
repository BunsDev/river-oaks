#include "Misc/AutomationTest.h"
#include "RiverAppearanceCatalogue.h"
#include "RiverProceduralAnimInstance.h"
#include "RiverSkeletalBackend.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#if WITH_EDITOR
#include "Rendering/SkeletalMeshModel.h"
#include "Rendering/SkeletalMeshLODModel.h"
#endif

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
        TestTrue(Id + TEXT(" upright head above feet"), Head.Z - Foot.Z > Mesh->GetImportedBounds().BoxExtent.Z);

#if WITH_EDITOR
        // The rendered eyes must face the same direction as the toe bones.
        // Eye material names retain the source catalogue's brown prefix.
        FVector Eyes = FVector::ZeroVector;
        int32 EyeVertices = 0;
        for (const auto& Section : Mesh->GetImportedModel()->LODModels[0].Sections)
        {
            const auto& Slot = Mesh->GetMaterials()[Section.MaterialIndex];
            if (!Slot.ImportedMaterialSlotName.ToString().StartsWith(TEXT("brown"))) continue;
            for (const auto& Vertex : Section.SoftVertices)
            {
                Eyes += FVector(Vertex.Position);
                ++EyeVertices;
            }
        }
        TestTrue(Id + TEXT(" eye geometry exists"), EyeVertices > 0);
        if (EyeVertices > 0)
        {
            Eyes /= EyeVertices;
        }
#endif

        // Check the rendered surface as well as the rig, in authoritative world
        // space. A correct bone heading alone previously hid a sideways mesh.
        for (const double Yaw : {0., 90., -135.})
        {
            ++Pose.Sequence;
            Pose.Root.SetRotation(FRotator(0, Yaw, 0).Quaternion());
            Backend.ApplyPose(Handle, Pose);
            Component->TickAnimation(.033f, false);
            Component->RefreshBoneTransforms();
            const FVector Forward = Pose.Root.GetUnitAxis(EAxis::X);
            const FVector Right = Pose.Root.GetUnitAxis(EAxis::Y);
            const FVector ToeDirection = Component->GetSocketLocation(TEXT("ball_l"))
                - Component->GetSocketLocation(TEXT("foot_l"));
            const FString Case = FString::Printf(TEXT("%s at yaw %.0f"), *Id, Yaw);
            TestTrue(Case + TEXT(" toes follow root heading"),
                FVector::DotProduct(ToeDirection, Forward) > 1. &&
                FMath::Abs(FVector::DotProduct(ToeDirection, Right)) < 1.);
#if WITH_EDITOR
            const FVector EyeDirection = Component->GetComponentTransform().TransformPosition(Eyes)
                - Component->GetSocketLocation(TEXT("head"));
            TestTrue(Case + TEXT(" eye geometry follows root heading"), EyeVertices > 0 &&
                FVector::DotProduct(EyeDirection, Forward) > 1. &&
                FMath::Abs(FVector::DotProduct(EyeDirection, Right)) < 1.);
#endif
        }

        ++Pose.Sequence;
        Pose.SimTimeSeconds = 1.25;
        Pose.Root.SetRotation(FQuat::Identity);
        Pose.Root.SetLocation(FVector(27.5, 0, 90));
        Pose.Locomotion = TEXT("walk");
        Backend.ApplyPose(Handle, Pose);
        const FTransform Authoritative = Component->GetComponentTransform();
        Component->TickAnimation(.033f, false);
        Component->RefreshBoneTransforms();
        const FQuat Walking = Component->GetSocketTransform(TEXT("thigh_l"), RTS_Component).GetRotation();
        TestFalse(Id + TEXT(" walking evaluates a leg pose"), Rest.Equals(Walking, .01));
        const FVector FootSwing = Component->GetComponentTransform().TransformVector(
            Component->GetSocketTransform(TEXT("foot_l"), RTS_Component).GetLocation() - Foot);
        TestTrue(Id + TEXT(" foot swings along the heading, not sideways"),
            FMath::Abs(FootSwing.X) > 1. && FMath::Abs(FootSwing.Y) < 1.);
        TestTrue(Id + TEXT(" animation cannot move the component"), Authoritative.Equals(Component->GetComponentTransform()));

        ++Pose.Sequence;
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
