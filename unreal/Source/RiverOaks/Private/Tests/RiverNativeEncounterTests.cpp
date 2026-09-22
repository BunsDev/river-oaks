#include "Misc/AutomationTest.h"
#include "RiverOaksWorld.h"
#include "Components/BoxComponent.h"
#include "Engine/World.h"
#include "HAL/PlatformTime.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverNativeEncounterTest, "RiverOaks.Contracts.NativeEncounters",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverNativeEncounterTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
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
#endif
