#include "Misc/AutomationTest.h"
#include "RiverLocomotionAnimInstance.h"
#include "Components/SkeletalMeshComponent.h"

#if WITH_DEV_AUTOMATION_TESTS
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverProceduralGaitTest, "RiverOaks.Contracts.ProceduralGait",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverProceduralGaitTest::RunTest(const FString& Parameters)
{
    auto* Anim = NewObject<URiverLocomotionAnimInstance>(NewObject<USkeletalMeshComponent>());
    Anim->ApplyLocomotion(TEXT("walk"), 140.f, 27.5);
    TestEqual(TEXT("gait distance follows accepted movement"), Anim->TravelDistanceCm, 27.5);
    const double Left = URiverLocomotionAnimInstance::StrideAngle(TEXT("thigh_l"), Anim->State,
        Anim->TravelDistanceCm, Anim->GroundSpeed);
    const double Right = URiverLocomotionAnimInstance::StrideAngle(TEXT("thigh_r"), Anim->State,
        Anim->TravelDistanceCm, Anim->GroundSpeed);
    TestTrue(TEXT("left leg swings during walking"), FMath::Abs(Left) > .2);
    TestTrue(TEXT("legs alternate"), FMath::IsNearlyEqual(Left, -Right));
    for (const auto State : { ERiverLocomotionState::Idle, ERiverLocomotionState::Shelter })
        TestEqual(TEXT("stationary states do not stride"),
            URiverLocomotionAnimInstance::StrideAngle(TEXT("thigh_l"), State, 27.5, 140.), 0.);
    TestEqual(TEXT("zero speed means no stride"),
        URiverLocomotionAnimInstance::StrideAngle(TEXT("thigh_l"), ERiverLocomotionState::Walk, 27.5, 0.), 0.);
    TestEqual(TEXT("root is never animated by gait"),
        URiverLocomotionAnimInstance::StrideAngle(TEXT("root"), ERiverLocomotionState::Jog, 27.5, 280.), 0.);
    Anim->ApplyLocomotion(TEXT("idle"), 0.f, 0.);
    TestEqual(TEXT("pausing preserves travelled distance"), Anim->TravelDistanceCm, 27.5);
    auto* Other = NewObject<URiverLocomotionAnimInstance>(NewObject<USkeletalMeshComponent>());
    TestEqual(TEXT("residents have independent phase"), Other->TravelDistanceCm, 0.);
    return true;
}
#endif
