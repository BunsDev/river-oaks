#include "Misc/AutomationTest.h"
#include "RiverOaksRules.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverCoordinatesTest, "RiverOaks.Contracts.Coordinates",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverCoordinatesTest::RunTest(const FString& Parameters)
{
    const FVector Source(12.0, -8.0, 3.0);
    TestTrue(TEXT("meters east/north/up become centimeters east/south/up"),
        RiverOaksRules::ToUnreal(Source).Equals(FVector(1200, 800, 300)));
    TestTrue(TEXT("coordinate round trip"),
        RiverOaksRules::ToMeters(RiverOaksRules::ToUnreal(Source)).Equals(Source));
    TestEqual(TEXT("base-centered building is raised by half its height"),
        RiverOaksRules::BuildingCenter(FVector(0, 0, 2), FVector(10, 8, 6)).Z, 500.0);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverSafetyTest, "RiverOaks.Contracts.Safety",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverSafetyTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("long frame does not teleport agents"), RiverOaksRules::StepSeconds(4.f), .05f);
    TestEqual(TEXT("negative delta ignored"), RiverOaksRules::StepSeconds(-1.f), 0.f);
    TestEqual(TEXT("agent capacity bounded"), RiverOaksRules::AgentCount(10000), 500);
    TestEqual(TEXT("negative capacity clamped"), RiverOaksRules::AgentCount(-1), 0);
    TestFalse(TEXT("late response rejected"), RiverOaksRules::AcceptBatch(4, 4, 3.1, 3.0));
    TestFalse(TEXT("wrong tick rejected"), RiverOaksRules::AcceptBatch(3, 4, .2, 3.0));
    TestTrue(TEXT("current batch accepted"), RiverOaksRules::AcceptBatch(4, 4, .2, 3.0));
    TestFalse(TEXT("unknown action rejected"), RiverOaksRules::ValidAction(TEXT("teleport")));
    TestTrue(TEXT("shelter is known"), RiverOaksRules::ValidAction(TEXT("seek_shelter")));
    TestEqual(TEXT("collision overrides continue"), RiverOaksRules::SpeedMultiplier(TEXT("continue"), true), 0.f);
    TestEqual(TEXT("stop is stationary"), RiverOaksRules::SpeedMultiplier(TEXT("stop"), false), 0.f);
    TestEqual(TEXT("slow is slower"), RiverOaksRules::SpeedMultiplier(TEXT("slow"), false), .5f);
    TestEqual(TEXT("night pedestrian rests"), RiverOaksRules::FallbackAction(TEXT("pedestrian"), 2.f, 0.f), FString(TEXT("pause")));
    TestEqual(TEXT("rain slows active pedestrian"), RiverOaksRules::FallbackAction(TEXT("pedestrian"), 14.f, .8f), FString(TEXT("slow")));
    TestEqual(TEXT("morning jogger runs"), RiverOaksRules::FallbackAction(TEXT("jogger"), 7.f, 0.f), FString(TEXT("continue")));
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverScheduleAuthorityTest, "RiverOaks.Contracts.ScheduleAuthority",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverScheduleAuthorityTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("external continue cannot wake scheduled pedestrian"),
        RiverOaksRules::ConstrainAction(TEXT("continue"), TEXT("pedestrian"), 2.f, 0.f), FString(TEXT("pause")));
    TestEqual(TEXT("external redirect cannot move resting jogger"),
        RiverOaksRules::ConstrainAction(TEXT("redirect"), TEXT("jogger"), 14.f, 0.f), FString(TEXT("pause")));
    TestEqual(TEXT("active hours release scheduled pause for fresh continue"),
        RiverOaksRules::ConstrainAction(TEXT("continue"), TEXT("pedestrian"), 6.f, 0.f), FString(TEXT("continue")));
    TestEqual(TEXT("external stop remains authoritative during scheduled pause"),
        RiverOaksRules::ConstrainAction(TEXT("stop"), TEXT("pedestrian"), 2.f, 0.f), FString(TEXT("stop")));
    TestEqual(TEXT("storm shelters active pedestrian"),
        RiverOaksRules::FallbackAction(TEXT("pedestrian"), 14.f, 0.f, .7f, true), FString(TEXT("seek_shelter")));
    TestEqual(TEXT("storm overrides external continue"),
        RiverOaksRules::ConstrainAction(TEXT("continue"), TEXT("jogger"), 7.f, 0.f, .7f, true), FString(TEXT("seek_shelter")));
    TestEqual(TEXT("humidity caps external movement speed"),
        RiverOaksRules::ConstrainAction(TEXT("continue"), TEXT("pedestrian"), 14.f, 0.f, .9f), FString(TEXT("slow")));
    TestEqual(TEXT("rain threshold matches sidecar"),
        RiverOaksRules::FallbackAction(TEXT("pedestrian"), 14.f, .51f), FString(TEXT("slow")));
    TestEqual(TEXT("local slowing does not override external stop"),
        RiverOaksRules::ConstrainAction(TEXT("stop"), TEXT("pedestrian"), 14.f, .8f), FString(TEXT("stop")));
    return true;
}
#endif
