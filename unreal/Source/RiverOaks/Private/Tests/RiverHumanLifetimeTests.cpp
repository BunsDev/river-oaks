#include "Misc/AutomationTest.h"
#include "RiverOaksHumans.h"
#include "RiverMarkerBackend.h"
#include "RiverSkeletalBackend.h"
#include "RiverAppearanceCatalogue.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include "UObject/GarbageCollection.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverPoseLedgerLifetimeTest, "RiverOaks.Contracts.Lifetime.PoseLedger",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverPoseLedgerLifetimeTest::RunTest(const FString& Parameters)
{
    FRiverHumanPoseLedger Ledger;
    const int32 Held = Ledger.Create();
    TestTrue(TEXT("held resident accepts its pose"), Ledger.Accept(Held, 7));
    Ledger.Destroy(Ledger.Create());
    const SIZE_T WarmBytes = Ledger.GetAllocatedSize();
    int32 Previous = INDEX_NONE;
    for (int32 Cycle = 0; Cycle < 4096; ++Cycle)
    {
        const int32 Handle = Ledger.Create();
        TestTrue(TEXT("new handles never alias a retired resident"), Handle > Previous);
        TestTrue(TEXT("new resident accepts a first pose"), Ledger.Accept(Handle, 1));
        TestTrue(TEXT("resident is destroyed"), Ledger.Destroy(Handle));
        TestFalse(TEXT("retired handle rejects even a newer pose"), Ledger.Accept(Handle, 100));
        Previous = Handle;
    }
    TestTrue(TEXT("retired sequence records do not grow with lifetime churn"), Ledger.GetAllocatedSize() <= WarmBytes + 1024);
    TestEqual(TEXT("unrelated live resident keeps its sequence"), Ledger.LastSequence(Held), uint64(7));
    TestTrue(TEXT("held resident still advances"), Ledger.Accept(Held, 8));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverMarkerLifetimeTest, "RiverOaks.Contracts.Lifetime.Marker",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverMarkerLifetimeTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    auto* Owner = World->SpawnActor<AActor>();
    auto* Instances = NewObject<UInstancedStaticMeshComponent>(Owner);
    Owner->SetRootComponent(Instances);
    Instances->SetStaticMesh(LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Sphere.Sphere")));
    Instances->RegisterComponent();
    {
        FRiverMarkerBackend Backend(Instances);
        const auto Recipe = URiverAppearanceCatalogue::Resolve(0);
        const int32 Held = Backend.CreateHuman(TEXT("held"), Recipe);
        FRiverHumanPose Pose; Pose.Sequence = 1; Pose.Root.SetLocation(FVector(100, 200, 300));
        FRiverHumanPose StalePose = Pose; StalePose.Sequence = 100000;
        TestTrue(TEXT("held marker accepts its pose"), Backend.ApplyPose(Held, Pose));
        int32 Previous = Held;
        for (int32 Cycle = 0; Cycle < 1024; ++Cycle)
        {
            const int32 Handle = Backend.CreateHuman(TEXT("churn"), Recipe);
            TestTrue(TEXT("pooled instances still have fresh handles"), Handle > Previous);
            if (Cycle > 0) TestFalse(TEXT("retired handle cannot move its reused instance"), Backend.ApplyPose(Previous, StalePose));
            TestTrue(TEXT("current marker accepts its own pose"), Backend.ApplyPose(Handle, Pose));
            Backend.DestroyHuman(Handle);
            Previous = Handle;
        }
        TestEqual(TEXT("instance storage stays at peak concurrent population"), Instances->GetInstanceCount(), 2);
        FTransform HeldTransform; Instances->GetInstanceTransform(0, HeldTransform, true);
        TestTrue(TEXT("recycling another marker preserves the held marker"), HeldTransform.GetLocation().Equals(Pose.Root.GetLocation()));
        TestTrue(TEXT("held marker remains live"), Backend.Ledger().IsLive(Held));
        Backend.DestroyHuman(Held);
    }
    World->DestroyWorld(false);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverSkeletalLifetimeTest, "RiverOaks.Contracts.Lifetime.Skeletal",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverSkeletalLifetimeTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    auto* Owner = World->SpawnActor<AActor>();
    auto* Root = NewObject<USceneComponent>(Owner); Owner->SetRootComponent(Root); Root->RegisterComponent();
    auto* Mesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Engine/EngineMeshes/SkeletalCube.SkeletalCube"));
    if (!TestNotNull(TEXT("engine skeletal fixture"), Mesh)) { World->DestroyWorld(false); return false; }
    FRiverSkeletalAppearance Appearance; Appearance.Mesh = Mesh; Appearance.AnimClass = URiverLocomotionAnimInstance::StaticClass();
    TMap<FName, FRiverSkeletalAppearance> Appearances; Appearances.Add(TEXT("woman-casual"), Appearance);
    {
        FRiverSkeletalBackend Backend(Owner, Appearances);
        const auto Recipe = URiverAppearanceCatalogue::Resolve(0);
        const int32 Held = Backend.CreateHuman(TEXT("held"), Recipe);
        TestTrue(TEXT("live fixture is admitted"), Held != INDEX_NONE);
        Backend.DestroyHuman(Backend.CreateHuman(TEXT("warm"), Recipe));
        const SIZE_T WarmBytes = Backend.GetAllocatedSize();
        for (int32 Cycle = 0; Cycle < 256; ++Cycle)
        {
            const int32 Handle = Backend.CreateHuman(TEXT("churn"), Recipe);
            TestTrue(TEXT("replacement fixture is admitted"), Handle != INDEX_NONE);
            Backend.DestroyHuman(Handle);
            TestFalse(TEXT("retired skeletal handle rejects poses"), Backend.ApplyPose(Handle, FRiverHumanPose()));
            if (Cycle % 32 == 31) CollectGarbage(RF_NoFlags);
        }
        TestTrue(TEXT("retired skeletal records do not grow with lifetime churn"), Backend.GetAllocatedSize() <= WarmBytes + 1024);
        TestEqual(TEXT("only the held component remains live"), Backend.NumLiveComponents(), 1);
        const int32 Late = Backend.CreateHuman(TEXT("late"), Recipe);
        TestTrue(TEXT("new live handle remains monotonic after churn"), Late > Held);
        Backend.DestroyComponents();
        TestFalse(TEXT("teardown retires the held handle"), Backend.Ledger().IsLive(Held));
        TestFalse(TEXT("teardown also retires sparse high handles"), Backend.Ledger().IsLive(Late));
        TestEqual(TEXT("teardown releases every component"), Backend.NumLiveComponents(), 0);
    }
    World->DestroyWorld(false);
    return true;
}
#endif
