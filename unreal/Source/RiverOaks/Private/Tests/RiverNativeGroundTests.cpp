#include "Misc/AutomationTest.h"
#include "RiverOaksWorld.h"
#include "RiverOaksRules.h"
#include "Components/BoxComponent.h"
#include "Engine/World.h"
#include "HAL/PlatformTime.h"

#if WITH_DEV_AUTOMATION_TESTS
// The real district manifest is generated locally. Keep this outside Contracts,
// whose synthetic collision fixtures also run in a source-only checkout.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverNativeDistrictGroundTest, "RiverOaks.NativeAssets.DistrictGroundContact",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverNativeDistrictGroundTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    auto* District = World->SpawnActor<ARiverOaksWorld>();
    if (TestTrue(TEXT("district manifest loads"), District->LoadManifest()))
    {
        District->SpawnAgents();
        TestEqual(TEXT("district still spawns its population"), District->Agents.Num(), 24);
        for (const auto& Agent : District->Agents)
        {
            FHitResult Hit;
            const FVector Sole = Agent.Position - FVector(0,0,RiverOaksRules::HumanRootHeightCm);
            const bool bHit = World->LineTraceSingleByObjectType(Hit, Sole + FVector(0,0,40),
                Sole - FVector(0,0,40), FCollisionObjectQueryParams(ECC_WorldStatic));
            TestTrue(Agent.Id + TEXT(" has static support"), bHit);
            if (bHit)
            {
                AddInfo(FString::Printf(TEXT("%s sole=%f surface=%f gap=%f cm"),
                    *Agent.Id, Sole.Z, Hit.ImpactPoint.Z, Sole.Z - Hit.ImpactPoint.Z));
                TestTrue(Agent.Id + TEXT(" root rests on support"), FMath::Abs(Sole.Z - Hit.ImpactPoint.Z) < .1);
            }
        }
        const auto& Route = District->Routes[0];
        const FVector RoadCenter = (Route.Points[0] + Route.Points[1]) * .5;
        FHitResult RoadHit;
        TestTrue(TEXT("road surface has query collision"), World->LineTraceSingleByObjectType(RoadHit,
            RoadCenter + FVector(0,0,40), RoadCenter - FVector(0,0,40), FCollisionObjectQueryParams(ECC_WorldStatic)) &&
            FMath::Abs(RoadHit.ImpactPoint.Z - RoadCenter.Z - 4.) < .1);
    }
    District->TeardownHumans();
    World->DestroyWorld(false);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverNativeGroundTest, "RiverOaks.Contracts.NativeGroundContact",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverNativeGroundTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    auto* District = World->SpawnActor<ARiverOaksWorld>();
    District->Bounds = FBox(FVector(-2000), FVector(2000));
    District->Hour = 9.f;
    FRiverRoute Route; Route.Points = {FVector(0,0,0), FVector(1000,0,0)}; Route.HalfWidth = 0;
    District->Routes.Add(Route);
    auto* FloorActor = World->SpawnActor<AActor>();
    auto* Floor = NewObject<UBoxComponent>(FloorActor); FloorActor->SetRootComponent(Floor);
    Floor->SetBoxExtent(FVector(2000,2000,10));
    Floor->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    Floor->SetCollisionObjectType(ECC_WorldStatic);
    Floor->SetCollisionResponseToAllChannels(ECR_Block);
    Floor->RegisterComponent();
    const auto PlaceAgent = [&](double SoleHeight)
    {
        District->Agents.Reset();
        FRiverAgent Agent; Agent.Id = TEXT("ground-test"); Agent.Kind = TEXT("pedestrian");
        Agent.Position = FVector(200,150,SoleHeight + RiverOaksRules::HumanRootHeightCm);
        Agent.ActionUntil = FPlatformTime::Seconds() + 100.;
        District->Agents.Add(Agent);
    };
    for (const double Surface : {-5., 4., 20., -20.})
    {
        PlaceAgent(0.);
        FloorActor->SetActorLocation(FVector(0,0,Surface - 10.));
        District->MoveAgents(.05f);
        const auto& Agent = District->Agents[0];
        TestTrue(TEXT("supported movement advances horizontally"), Agent.Position.X > 200. && !Agent.bBlocked);
        TestTrue(TEXT("grounding preserves the proposed XY"),
            FMath::IsNearlyEqual(Agent.Position.X, 207., .01) && FMath::IsNearlyEqual(Agent.Position.Y, 150., .01));
        TestTrue(TEXT("accepted root follows support height"),
            FMath::Abs(Agent.Position.Z - RiverOaksRules::HumanRootHeightCm - Surface) < .1);
    }
    PlaceAgent(300.);
    FloorActor->SetActorLocation(FVector(0,0,290.));
    District->MoveAgents(.05f);
    TestTrue(TEXT("upper floor retains its elevation"), FMath::Abs(District->Agents[0].Position.Z - 390.) < .1);
    TestTrue(TEXT("upper floor permits movement"), District->Agents[0].Position.X > 200.);

    PlaceAgent(0.);
    FloorActor->SetActorLocation(FVector(0,0,-10));
    const FVector Visitor(100,150,88);
    District->GreetNearby(Visitor);
    TestTrue(TEXT("ground fixture enters conversation"), District->UpdateConversation(Visitor));
    FloorActor->SetActorLocation(FVector(0,0,10));
    District->MoveAgents(.05f);
    TestTrue(TEXT("held resident retains its accepted root when support changes"),
        District->Agents[0].Position.Equals(FVector(200,150,90)));
    District->EndConversation();
    District->MoveAgents(.05f);
    TestTrue(TEXT("released resident resumes support sampling"),
        FMath::IsNearlyEqual(District->Agents[0].Position.Z, 110., .1));

    for (const double Surface : {40., -40.})
    {
        PlaceAgent(0.);
        FloorActor->SetActorLocation(FVector(0,0,Surface - 10.));
        District->MoveAgents(.05f);
        TestTrue(TEXT("excessive steps retain the accepted root"), District->Agents[0].Position.Equals(FVector(200,150,90)));
        TestTrue(TEXT("excessive steps block movement"), District->Agents[0].bBlocked);
    }
    PlaceAgent(0.);
    Floor->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    District->MoveAgents(.05f);
    TestTrue(TEXT("unsupported edge retains the accepted root"), District->Agents[0].Position.Equals(FVector(200,150,90)));
    TestTrue(TEXT("unsupported edge blocks movement"), District->Agents[0].bBlocked);

    PlaceAgent(0.);
    Floor->SetCollisionEnabled(ECollisionEnabled::QueryOnly);
    FloorActor->SetActorLocation(FVector(207,150,-20));
    FloorActor->SetActorRotation(FRotator(60,0,0));
    District->MoveAgents(.05f);
    TestTrue(TEXT("steep support retains the accepted root"), District->Agents[0].Position.Equals(FVector(200,150,90)));
    TestTrue(TEXT("steep support blocks movement"), District->Agents[0].bBlocked);
    World->DestroyWorld(false);
    return true;
}
#endif
