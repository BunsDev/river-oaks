#include "Misc/AutomationTest.h"
#include "RiverOaksWorld.h"
#include "RiverStreetPawn.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerInput.h"
#include "InputKeyEventArgs.h"
#include "InputCoreTypes.h"
#include "Components/BoxComponent.h"
#include "Engine/World.h"
#include "Engine/Engine.h"
#include "HAL/PlatformTime.h"

#if WITH_DEV_AUTOMATION_TESTS
namespace
{
    void AddEncounterFloor(UWorld* World)
    {
        auto* Actor = World->SpawnActor<AActor>();
        auto* Floor = NewObject<UBoxComponent>(Actor);
        Actor->SetRootComponent(Floor);
        Floor->SetBoxExtent(FVector(2000,2000,10));
        Floor->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
        Floor->SetCollisionObjectType(ECC_WorldStatic);
        Floor->SetCollisionResponseToAllChannels(ECR_Block);
        Floor->RegisterComponent();
        Actor->SetActorLocation(FVector(0,0,-10));
    }
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverNativeEncounterTest, "RiverOaks.Contracts.NativeEncounters",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverNativeEncounterTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    AddEncounterFloor(World);
    auto* District = World->SpawnActor<ARiverOaksWorld>();
    District->Bounds = FBox(FVector(-2000), FVector(2000));
    District->Hour = 9.f;
    FRiverRoute Route; Route.Points = {FVector(0,0,0), FVector(1000,0,0)}; Route.HalfWidth = 0;
    District->Routes.Add(Route);
    FRiverAgent Agent; Agent.Id = TEXT("npc-test"); Agent.Kind = TEXT("pedestrian");
    Agent.Position = FVector(200,150,90); Agent.ActionUntil = FPlatformTime::Seconds()+100.;
    District->Agents.Add(Agent);
    const FVector Visitor(0,150,88), Before = Agent.Position;
    TestTrue(TEXT("reachable resident can be greeted"), District->GreetNearby(Visitor).StartsWith(TEXT("Visitor:")));
    District->MoveAgents(.05f);
    TestTrue(TEXT("conversation holds the authoritative resident position"), District->Agents[0].Position.Equals(Before));

    TestTrue(TEXT("turning toward the visitor is bounded per frame"), FMath::Abs(FMath::FindDeltaAngleDegrees(0.f, District->Agents[0].Heading)) <= 9.01f);
    for (int32 Frame = 0; Frame < 30; ++Frame) District->MoveAgents(.05f);
    const FVector TowardVisitor = (Visitor - District->Agents[0].Position).GetSafeNormal2D();
    const FVector Facing = FRotator(0, District->Agents[0].Heading, 0).Vector();
    TestTrue(TEXT("settled conversation faces the visitor"), FVector::DotProduct(Facing, TowardVisitor) > .999);
    District->EndConversation();
    District->MoveAgents(.05f);
    TestFalse(TEXT("ending conversation resumes the existing route"), District->Agents[0].Position.Equals(Before));
    District->GreetNearby(Visitor);
    TestFalse(TEXT("walking away releases the encounter"), District->UpdateConversation(FVector(-1000,150,88)));
    District->GreetNearby(Visitor);
    District->ConversationUntil = -1.;
    TestFalse(TEXT("conversation deadline releases the encounter"), District->UpdateConversation(Visitor));
    District->Agents[0].Position = FVector(990,150,90);
    District->GreetNearby(FVector(900,150,88));
    District->MoveAgents(.05f);
    TestEqual(TEXT("a conversation at a route endpoint retains its target"), District->Agents[0].Target, 1);
    TestEqual(TEXT("a conversation at a route endpoint retains its direction"), District->Agents[0].Direction, 1);
    District->EndConversation();

    District->Agents[0].Position = FVector(200,0,90);
    FRiverAgent Upstairs = Agent; Upstairs.Id = TEXT("upstairs"); Upstairs.Position = FVector(0,0,690);
    District->Agents.Add(Upstairs);
    const FVector Entrance(0,0,88);
    TestTrue(TEXT("selection does not reach through another floor"), District->NearbyVisitor(Entrance).Contains(TEXT("npc-test")));
    District->Agents.RemoveAt(1);
    auto* Wall = World->SpawnActor<AActor>();
    auto* Box = NewObject<UBoxComponent>(Wall); Wall->SetRootComponent(Box);
    Box->SetBoxExtent(FVector(20,50,100)); Box->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    Box->SetCollisionObjectType(ECC_WorldStatic); Box->SetCollisionResponseToAllChannels(ECR_Block);
    Box->RegisterComponent(); Wall->SetActorLocation(FVector(100,0,100));
    TestTrue(TEXT("opaque wall blocks interaction"), District->NearbyVisitor(Entrance).IsEmpty());
    FRiverAgent Visible = Agent; Visible.Id = TEXT("visible"); Visible.Position = FVector(0,250,90);
    District->Agents.Add(Visible);
    TestTrue(TEXT("blocked nearest person does not hide a reachable neighbor"), District->NearbyVisitor(Entrance).Contains(TEXT("visible")));
    District->GreetNearby(Entrance);
    TestTrue(TEXT("visible conversation remains active"), District->UpdateConversation(Entrance));
    Wall->SetActorLocation(FVector(0,125,100));
    TestFalse(TEXT("new occlusion ends the active conversation"), District->UpdateConversation(Entrance));
    TestTrue(TEXT("occlusion does not silently select another resident"), District->ConversationAgentId.IsEmpty());
    World->DestroyWorld(false);
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverNativeInputTest, "RiverOaks.Contracts.NativeConversationInput",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverNativeInputTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    GEngine->CreateNewWorldContext(EWorldType::Game).SetCurrentWorld(World);
    World->InitializeActorsForPlay(FURL());
    AddEncounterFloor(World);
    auto* District = World->SpawnActor<ARiverOaksWorld>();
    District->Bounds = FBox(FVector(-2000), FVector(2000));
    District->Hour = 9.f;
    FRiverRoute Route; Route.Points = {FVector(0,0,0), FVector(1000,0,0)}; Route.HalfWidth = 0;
    District->Routes.Add(Route);
    FRiverAgent Agent; Agent.Id = TEXT("input-resident"); Agent.Kind = TEXT("pedestrian");
    Agent.Position = FVector(200,150,90); Agent.ActionUntil = FPlatformTime::Seconds()+100.;
    District->Agents.Add(Agent);
    auto* Pawn = World->SpawnActor<ARiverStreetPawn>(FVector(0,150,88), FRotator::ZeroRotator);
    auto* Controller = World->SpawnActor<APlayerController>();
    Controller->PlayerInput = NewObject<UPlayerInput>(Controller);
    Controller->Possess(Pawn);
    Pawn->DispatchBeginPlay();
    TestTrue(TEXT("input fixture pawn is initialized for play"), Pawn->IsActorInitialized() && Pawn->HasActorBegunPlay());
    const auto Frame = [&]()
    {
        Controller->PlayerInput->ProcessInputStack({}, .05f, false);
        Pawn->Tick(.05f);
        District->MoveAgents(.05f);
    };
    const auto Key = [&](FKey Key, EInputEvent Event)
    {
        Controller->InputKey(FInputKeyEventArgs::CreateSimulated(Key, Event, Event == IE_Released ? 0.f : 1.f));
        Frame();
    };
    TestTrue(TEXT("pawn discovers a reachable resident"), Pawn->InteractionPrompt().Contains(TEXT("input-resident")));
    const FVector Before = District->Agents[0].Position;
    Key(EKeys::E, IE_Pressed);
    TestTrue(TEXT("E opens dialogue through the real pawn"), Pawn->Conversation.StartsWith(TEXT("Visitor:")));
    TestEqual(TEXT("E holds the selected identity"), District->ConversationAgentId, Agent.Id);
    TestTrue(TEXT("E holds the resident position"), District->Agents[0].Position.Equals(Before));
    Frame();
    TestTrue(TEXT("holding E does not toggle the conversation twice"), Pawn->InteractionPrompt().Contains(TEXT("Finish conversation")));
    Key(EKeys::E, IE_Released);
    Key(EKeys::E, IE_Pressed);
    TestTrue(TEXT("a second E press closes dialogue"), Pawn->Conversation.IsEmpty());
    TestTrue(TEXT("a second E press releases the resident"), District->ConversationAgentId.IsEmpty());
    TestFalse(TEXT("released resident resumes their route"), District->Agents[0].Position.Equals(Before));
    Key(EKeys::E, IE_Released);
    Key(EKeys::E, IE_Pressed);
    Key(EKeys::E, IE_Released);
    Key(EKeys::S, IE_Pressed);
    for (int32 Index = 0; Index < 70; ++Index) Frame();
    TestTrue(TEXT("movement input leaves talking range"), Pawn->GetActorLocation().X < -450.);
    TestTrue(TEXT("walking away clears dialogue and hold"), Pawn->Conversation.IsEmpty() && District->ConversationAgentId.IsEmpty());
    Key(EKeys::S, IE_Released);
    Pawn->SetActorLocation(District->Agents[0].Position - FVector(200,0,2));
    Key(EKeys::E, IE_Pressed);
    TestFalse(TEXT("encounter can reopen after walking away"), District->ConversationAgentId.IsEmpty());
    Pawn->Destroy();
    TestTrue(TEXT("destroying the conversation pawn releases the resident"), District->ConversationAgentId.IsEmpty());
    World->DestroyWorld(false);
    GEngine->DestroyWorldContext(World);
    return true;
}
#endif
