#include "Misc/AutomationTest.h"
#include "RiverDeveloperDiagnostics.h"
#if WITH_DEV_AUTOMATION_TESTS && !UE_BUILD_SHIPPING && !UE_BUILD_TEST
#include "Camera/CameraTypes.h"
#include "Engine/LocalPlayer.h"
#include "SceneView.h"

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverDiagnosticsCameraTest, "RiverOaks.Contracts.DeveloperCamera",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverDiagnosticsCameraTest::RunTest(const FString& Parameters)
{
    FRiverDeveloperDiagnostics D;
    float WideHeight = 0;
    for (const int32 Width : {1600, 1200})
    {
        FMinimalViewInfo View;
        View.FOV = 65;
        View.AspectRatio = 16.f / 9.f;
        View.bConstrainAspectRatio = false;
        const FIntRect Rect(0, 0, Width, 900);
        FSceneViewProjectionData Projection;
        Projection.SetViewRectangle(Rect);
        Projection.ViewOrigin = FVector(12, 34, 56);
        Projection.ViewRotationMatrix = FMatrix::Identity;
        FMinimalViewInfo::CalculateProjectionMatrixGivenViewRectangle(
            View, AspectRatio_MaintainYFOV, Rect, Projection);
        TestTrue(TEXT("engine perspective projection is available"), D.ObserveCamera(Projection));
        const float ExpectedFov = Width == 1600 ? 65.f : 51.077f;
        TestTrue(TEXT("horizontal FOV follows viewport and engine axis policy"),
            FMath::IsNearlyEqual(D.CameraHorizontalFov, ExpectedFov, .01f));
        TestTrue(TEXT("guide aspect matches constrained viewport"),
            FMath::IsNearlyEqual(D.CameraAspectRatio, float(Width) / 900.f, .001f));
        TestTrue(TEXT("guide uses the projected view origin"), D.CameraOrigin.Equals(Projection.ViewOrigin));
        if (Width == 1600) WideHeight = D.CameraHalfExtents.Y;
        else TestTrue(TEXT("maintain Y FOV preserves vertical guide size"),
            WideHeight > 0 && FMath::IsNearlyEqual(float(D.CameraHalfExtents.Y), WideHeight, .001f));
    }
    FSceneViewProjectionData Invalid;
    Invalid.ProjectionMatrix = FMatrix::Identity;
    TestFalse(TEXT("non-perspective projection is unavailable"), D.ObserveCamera(Invalid));
    TestFalse(TEXT("invalid projection clears availability"), D.bCameraProjectionValid);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverDiagnosticsTest, "RiverOaks.Contracts.DeveloperDiagnostics",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverDiagnosticsTest::RunTest(const FString& Parameters)
{
    FRiverDeveloperDiagnostics D;
    FHitResult Hit;
    Hit.bBlockingHit = true;
    for (int32 I = 0; I < 10; ++I) D.Observe(.05f, FVector::ForwardVector, FVector::ZeroVector, FVector(8,0,0), FVector(8,0,0), FVector::ZeroVector, Hit);
    TestTrue(TEXT("sustained actual sweep blockage"), D.bStuck);
    TestTrue(TEXT("cause names fixed-height movement"), D.Cause.Contains(TEXT("step-up")));
    D.Observe(.05f, FVector::ZeroVector, FVector::ZeroVector, FVector::ZeroVector, FVector::ZeroVector, FVector::ZeroVector, Hit);
    TestFalse(TEXT("idle clears stuck"), D.bStuck);
    for (int32 I = 0; I < 10; ++I) D.Observe(.05f, FVector::ForwardVector, FVector::ZeroVector, FVector(8,0,0), FVector(8,0,0), FVector(0,5,0), Hit);
    TestFalse(TEXT("sliding is progress"), D.bStuck);
    Hit.bStartPenetrating = true;
    for (int32 I = 0; I < 10; ++I) D.Observe(.05f, FVector::ForwardVector, FVector::ZeroVector, FVector(8,0,0), FVector(8,0,0), FVector::ZeroVector, Hit);
    TestTrue(TEXT("penetration evidence wins"), D.Cause.Contains(TEXT("overlapping")));
    Hit = FHitResult();
    for (int32 I = 0; I < 1000; ++I) D.Observe(.05f, FVector::ForwardVector, FVector::ZeroVector, FVector(8,0,0), FVector::ZeroVector, FVector::ZeroVector, Hit);
    TestTrue(TEXT("bounds diagnosis"), D.Cause.Contains(TEXT("boundary")));
    TestTrue(TEXT("timeline stays bounded"), D.Events.Num() <= 48);
    D.Reset();
    TestEqual(TEXT("disable clears history"), D.Events.Num(), 0);
    return true;
}
#endif
