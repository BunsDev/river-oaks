#include "Misc/AutomationTest.h"
#include "RiverDeveloperDiagnostics.h"
#if WITH_DEV_AUTOMATION_TESTS && !UE_BUILD_SHIPPING && !UE_BUILD_TEST
#include "RiverStreetPawn.h"
#include "RiverOaksWorld.h"
#include "Components/BoxComponent.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "Engine/LocalPlayer.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerInput.h"
#include "InputCoreTypes.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverDiagnosticsCollisionTest, "RiverOaks.Contracts.DeveloperCollision",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverDiagnosticsCollisionTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    auto* EdgeActor = World->SpawnActor<AActor>();
    auto* Edge = NewObject<UBoxComponent>(EdgeActor);
    EdgeActor->SetRootComponent(Edge);
    Edge->SetBoxExtent(FVector(10,200,20));
    Edge->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
    Edge->SetCollisionObjectType(ECC_WorldStatic);
    Edge->SetCollisionResponseToAllChannels(ECR_Block);
    Edge->RegisterComponent();
    EdgeActor->SetActorLocation(FVector(50,0,20));
    auto* Pawn = World->SpawnActor<ARiverStreetPawn>();
    Pawn->SetActorLocation(FVector(0,0,88));
    FRiverDeveloperDiagnostics D;
    FHitResult Hit;
    for (int32 I = 0; I < 30; ++I)
    {
        const FVector Before = Pawn->GetActorLocation();
        const FVector Proposed = Before + FVector(8,0,0);
        Pawn->SetActorLocation(Proposed, true, &Hit);
        D.Observe(.05f, FVector::ForwardVector, Before, Proposed, Proposed, Pawn->GetActorLocation(), Hit);
    }
    TestTrue(TEXT("capsule hits low edge without step-up"), Hit.bBlockingHit);
    TestTrue(TEXT("actual sweep identifies blocking component"), Hit.GetComponent() == Edge);
    TestTrue(TEXT("actual blocked pawn gets stuck diagnosis"), D.bStuck);
    TestTrue(TEXT("timeline names actual blocking component"), D.Evidence.Contains(Edge->GetName()));
    const FVector Before = Pawn->GetActorLocation();
    const FVector Sideways = Before + FVector(0,8,0);
    Pawn->SetActorLocation(Sideways, true, &Hit);
    D.Observe(.05f, FVector::RightVector, Before, Sideways, Sideways, Pawn->GetActorLocation(), Hit);
    TestFalse(TEXT("tangential movement clears stuck diagnosis"), D.bStuck);
    TestTrue(TEXT("tangential movement remains possible"), Pawn->GetActorLocation().Y > Before.Y + 7);
    World->DestroyWorld(false);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverDiagnosticsInputTest, "RiverOaks.Contracts.DeveloperInputTrace",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverDiagnosticsInputTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    GEngine->CreateNewWorldContext(EWorldType::Game).SetCurrentWorld(World);
    World->InitializeActorsForPlay(FURL());
    World->SpawnActor<ARiverOaksWorld>();
    const auto Box = [&](const FVector& Position, const FVector& Extent, FName Name)
    {
        auto* Actor = World->SpawnActor<AActor>();
        auto* Component = NewObject<UBoxComponent>(Actor, Name);
        Actor->SetRootComponent(Component);
        Component->SetBoxExtent(Extent);
        Component->SetCollisionEnabled(ECollisionEnabled::QueryAndPhysics);
        Component->SetCollisionObjectType(ECC_WorldStatic);
        Component->SetCollisionResponseToAllChannels(ECR_Block);
        Component->RegisterComponent();
        Actor->SetActorLocation(Position);
        return Component;
    };
    Box(FVector(0,0,-10), FVector(2000,2000,10), TEXT("InputFloor"));
    auto* Edge = Box(FVector(50,0,20), FVector(10,200,20), TEXT("InputEdge"));
    auto* Selection = Box(FVector(200,0,168), FVector(10,10,10), TEXT("SelectionTarget"));
    auto* Pawn = World->SpawnActor<ARiverStreetPawn>(FVector(0,0,88), FRotator::ZeroRotator);
    auto* PC = World->SpawnActor<APlayerController>();
    PC->Player = NewObject<ULocalPlayer>(GEngine);
    PC->PlayerInput = NewObject<UPlayerInput>(PC);
    PC->Possess(Pawn);
    Pawn->DispatchBeginPlay();
    TestTrue(TEXT("input fixture represents a local player"), PC->IsLocalController());
    const auto Frame = [&]()
    {
        PC->PlayerInput->ProcessInputStack({}, .05f, false);
        Pawn->Tick(.05f);
    };
    const auto Key = [&](FKey Input, EInputEvent Event)
    {
        PC->InputKey(FInputKeyEventArgs::CreateSimulated(Input, Event, Event == IE_Released ? 0.f : 1.f));
        Frame();
    };
    Key(EKeys::F8, IE_Pressed);
    TestFalse(TEXT("editor eject key does not enable developer view"), Pawn->Diagnostics.bEnabled);
    Key(EKeys::F8, IE_Released);
    Key(EKeys::F7, IE_Pressed);
    TestTrue(TEXT("real input enables developer view"), Pawn->Diagnostics.bEnabled);
    Key(EKeys::F7, IE_Released);
    Key(EKeys::F6, IE_Pressed);
    TestTrue(TEXT("selection key traces the camera center"), Pawn->Diagnostics.Selected.Get() == Selection);
    Key(EKeys::F6, IE_Released);
    Selection->SetWorldLocation(FVector(200,500,168));
    Key(EKeys::F6, IE_Pressed);
    TestFalse(TEXT("selection miss clears the selected component"), Pawn->Diagnostics.Selected.IsValid());
    Key(EKeys::F6, IE_Released);
    Key(EKeys::W, IE_Pressed);
    for (int32 I = 0; I < 30; ++I) Frame();
    TestTrue(TEXT("held input through pawn movement diagnoses actual edge blockage"), Pawn->Diagnostics.bStuck);
    TestTrue(TEXT("pawn instrumentation preserves actual blocking component"), Pawn->Diagnostics.BlockingHit.GetComponent() == Edge);
    TestTrue(TEXT("timeline connects input with actual collision outcome"),
        !Pawn->Diagnostics.Events.IsEmpty() && Pawn->Diagnostics.Events.Last().Contains(TEXT("InputEdge")));
    Key(EKeys::W, IE_Released);
    TestFalse(TEXT("releasing input clears current stuck state"), Pawn->Diagnostics.bStuck);
    Key(EKeys::F7, IE_Pressed);
    TestFalse(TEXT("real input disables developer view"), Pawn->Diagnostics.bEnabled);
    TestTrue(TEXT("disable resets observed history"), Pawn->Diagnostics.Events.IsEmpty());
    World->DestroyWorld(false);
    GEngine->DestroyWorldContext(World);
    return true;
}
#endif
