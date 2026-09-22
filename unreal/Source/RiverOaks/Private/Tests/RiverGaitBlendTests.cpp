#include "Misc/AutomationTest.h"
#include "RiverGaitBlend.h"

#include <cmath>
#include <limits>

#if WITH_DEV_AUTOMATION_TESTS

namespace
{
void Simulate(FRiverGaitBlend& Blend, const int32 Steps, const double DeltaSeconds,
    const double TargetStrength)
{
    for (int32 Step = 0; Step < Steps; ++Step)
        Blend.Update(DeltaSeconds, TargetStrength);
}
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverGaitBlendStartsContinuouslyTest,
    "RiverOaks.Contracts.GaitBlend.StartsContinuously",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverGaitBlendStartsContinuouslyTest::RunTest(const FString& Parameters)
{
    FRiverGaitBlend Blend;
    Blend.Update(1.0 / 60.0, 1.0);
    TestTrue(TEXT("starting gait increases strength"), Blend.Strength > 0.0);
    TestTrue(TEXT("starting gait has forward velocity"), Blend.Velocity > 0.0);
    TestTrue(TEXT("strength remains below target during the first frame"), Blend.Strength < 1.0);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverGaitBlendInterruptsContinuouslyTest,
    "RiverOaks.Contracts.GaitBlend.InterruptsContinuously",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverGaitBlendInterruptsContinuouslyTest::RunTest(const FString& Parameters)
{
    FRiverGaitBlend Blend;
    Simulate(Blend, 12, 1.0 / 60.0, 1.0);
    const double StrengthBeforeStop = Blend.Strength;
    const double VelocityBeforeStop = Blend.Velocity;
    Blend.Update(1.0e-6, 0.0);
    TestTrue(TEXT("interrupt keeps existing strength"), Blend.Strength > 0.0);
    TestTrue(TEXT("interrupt keeps velocity continuous"),
        std::abs(Blend.Velocity - VelocityBeforeStop) < 0.001);
    TestTrue(TEXT("interrupt keeps strength continuous"),
        std::abs(Blend.Strength - StrengthBeforeStop) < 0.001);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverGaitBlendSettlesAfterStopTest,
    "RiverOaks.Contracts.GaitBlend.SettlesAfterStop",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverGaitBlendSettlesAfterStopTest::RunTest(const FString& Parameters)
{
    FRiverGaitBlend Blend;
    Simulate(Blend, 60, 1.0 / 60.0, 1.0);
    Simulate(Blend, 180, 1.0 / 60.0, 0.0);
    TestTrue(TEXT("stopped gait settles near rest"), std::abs(Blend.Strength) < 0.001);
    TestTrue(TEXT("stopped gait velocity settles"), std::abs(Blend.Velocity) < 0.01);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverGaitBlendFrameStepIndependentTest,
    "RiverOaks.Contracts.GaitBlend.FrameStepIndependent",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverGaitBlendFrameStepIndependentTest::RunTest(const FString& Parameters)
{
    FRiverGaitBlend At30Hz;
    FRiverGaitBlend At60Hz;
    FRiverGaitBlend At144Hz;
    Simulate(At30Hz, 5, 1.0 / 30.0, 1.0);
    Simulate(At60Hz, 10, 1.0 / 60.0, 1.0);
    Simulate(At144Hz, 24, 1.0 / 144.0, 1.0);
    TestTrue(TEXT("30 Hz simulation starts"), At30Hz.Strength > 0.0);
    TestTrue(TEXT("30 and 60 Hz agree"), std::abs(At30Hz.Strength - At60Hz.Strength) < 0.001);
    TestTrue(TEXT("60 and 144 Hz agree"), std::abs(At60Hz.Strength - At144Hz.Strength) < 0.001);
    TestTrue(TEXT("30 and 144 Hz agree"), std::abs(At30Hz.Strength - At144Hz.Strength) < 0.001);
    TestTrue(TEXT("30 and 60 Hz velocities agree"), std::abs(At30Hz.Velocity - At60Hz.Velocity) < 0.001);
    TestTrue(TEXT("60 and 144 Hz velocities agree"), std::abs(At60Hz.Velocity - At144Hz.Velocity) < 0.001);
    TestTrue(TEXT("30 and 144 Hz velocities agree"), std::abs(At30Hz.Velocity - At144Hz.Velocity) < 0.001);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverGaitBlendBoundsAndFiniteInputTest,
    "RiverOaks.Contracts.GaitBlend.BoundsAndFiniteInput",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverGaitBlendBoundsAndFiniteInputTest::RunTest(const FString& Parameters)
{
    FRiverGaitBlend Blend;
    Simulate(Blend, 120, 1.0 / 60.0, 9.0);
    TestTrue(TEXT("strength respects the maximum target bound"), Blend.Strength <= 1.3);
    TestTrue(TEXT("high target reaches the maximum bound"), Blend.Strength > 1.29);
    const double StrengthBeforeZeroDelta = Blend.Strength;
    const double VelocityBeforeZeroDelta = Blend.Velocity;
    Blend.Update(0.0, -9.0);
    TestEqual(TEXT("zero delta preserves strength state"), Blend.Strength, StrengthBeforeZeroDelta);
    TestEqual(TEXT("zero delta preserves velocity state"), Blend.Velocity, VelocityBeforeZeroDelta);
    Blend.Update(10.0, 0.75);
    TestEqual(TEXT("large finite delta settles to target"), Blend.Strength, 0.75);
    TestEqual(TEXT("large finite delta clears velocity"), Blend.Velocity, 0.0);
    Simulate(Blend, 120, 1.0 / 60.0, -9.0);
    TestTrue(TEXT("strength respects the minimum target bound"), Blend.Strength >= 0.0);
    TestTrue(TEXT("negative target settles at the minimum"), std::abs(Blend.Strength) < 0.001);
    const double StrengthBeforeInvalid = Blend.Strength;
    const double VelocityBeforeInvalid = Blend.Velocity;
    const double NaN = std::numeric_limits<double>::quiet_NaN();
    const double Infinity = std::numeric_limits<double>::infinity();
    Blend.Update(NaN, 0.0);
    Blend.Update(Infinity, 0.0);
    Blend.Update(-1.0, 0.0);
    Blend.Update(1.0 / 60.0, NaN);
    Blend.Update(1.0 / 60.0, Infinity);
    TestTrue(TEXT("invalid inputs preserve finite strength"), std::isfinite(Blend.Strength));
    TestTrue(TEXT("invalid inputs preserve finite velocity"), std::isfinite(Blend.Velocity));
    TestEqual(TEXT("invalid inputs preserve strength state"), Blend.Strength, StrengthBeforeInvalid);
    TestEqual(TEXT("invalid inputs preserve velocity state"), Blend.Velocity, VelocityBeforeInvalid);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverGaitBlendInstancesAreIndependentTest,
    "RiverOaks.Contracts.GaitBlend.IndependentInstances",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverGaitBlendInstancesAreIndependentTest::RunTest(const FString& Parameters)
{
    FRiverGaitBlend Moving;
    FRiverGaitBlend Resting;
    Simulate(Moving, 30, 1.0 / 60.0, 1.0);
    TestTrue(TEXT("one resident can move"), Moving.Strength > 0.0);
    TestEqual(TEXT("another resident remains at rest"), Resting.Strength, 0.0);
    TestEqual(TEXT("another resident has no velocity"), Resting.Velocity, 0.0);
    return true;
}

#endif
