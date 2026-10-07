#include "RiverDeveloperDiagnostics.h"
#if !UE_BUILD_SHIPPING && !UE_BUILD_TEST
#include "SceneView.h"

bool FRiverDeveloperDiagnostics::ObserveCamera(const FSceneViewProjectionData& Projection)
{
    bCameraProjectionValid = false;
    const double XScale = Projection.ProjectionMatrix.M[0][0];
    const double YScale = Projection.ProjectionMatrix.M[1][1];
    if (!Projection.IsPerspectiveProjection() || !FMath::IsFinite(XScale) || !FMath::IsFinite(YScale)
        || XScale <= SMALL_NUMBER || YScale <= SMALL_NUMBER) return false;
    // A finite 2 m guide from the same projection used by the local player's view.
    CameraHalfExtents = FVector2D(200. / XScale, 200. / YScale);
    CameraHorizontalFov = FMath::RadiansToDegrees(2. * FMath::Atan(1. / XScale));
    CameraAspectRatio = CameraHalfExtents.X / CameraHalfExtents.Y;
    CameraOrigin = Projection.ViewOrigin;
    CameraToWorld = Projection.ViewRotationMatrix.Inverse();
    bCameraProjectionValid = true;
    return true;
}

void FRiverDeveloperDiagnostics::Record(const FString& Event)
{
    if (Events.Num() >= 48) Events.RemoveAt(0, 1, EAllowShrinking::No);
    Events.Add(FString::Printf(TEXT("%.2fs #%llu %s"), Clock, Sequence, *Event));
}
void FRiverDeveloperDiagnostics::Observe(float Dt, const FVector& Direction, const FVector& Before,
    const FVector& Proposed, const FVector& Constrained, const FVector& After, const FHitResult& Hit)
{
    Clock += Dt;
    Input = Direction;
    Requested = Proposed - Before;
    Actual = After - Before;
    BlockingHit = Hit;
    const bool bBounds = !Proposed.Equals(Constrained, .01f) &&
        FVector::DistSquared2D(Proposed, Constrained) > .01;
    const bool bAttempt = !Direction.IsNearlyZero() && Requested.Size2D() > .01;
    const bool bBlocked = bAttempt && (Hit.bBlockingHit || bBounds) &&
        Actual.Size2D() < Requested.Size2D() * .1;
    BlockedSeconds = bBlocked ? BlockedSeconds + Dt : 0;
    bStuck = BlockedSeconds >= .35f;
    SampleSeconds += Dt;
    if (SampleSeconds < .1f) return;
    SampleSeconds = 0;
    ++Sequence;
    if (Hit.bStartPenetrating)
    {
        Cause = TEXT("Capsule starts overlapping collision.");
        Fix = TEXT("Check spawn position, capsule size and overlapping collision.");
    }
    else if (bBounds)
    {
        Cause = TEXT("District boundary clamps the requested movement.");
        Fix = TEXT("Inspect district bounds and the 40 cm visitor margin.");
    }
    else if (Hit.bBlockingHit)
    {
        Cause = TEXT("Collision blocks the capsule; this pawn has no step-up solver.");
        Fix = TEXT("Inspect the edge collision; add a ramp or implement step-up movement.");
    }
    else
    {
        Cause = TEXT("No blocking collision or boundary observed.");
        Fix = TEXT("Reproduce while holding movement input; inspect floor and camera layers.");
    }
    Evidence = FString::Printf(TEXT("Requested %.1f cm; moved %.1f cm; blocked %.2fs; hit %s/%s; normal Z %.2f"),
        Requested.Size2D(), Actual.Size2D(), BlockedSeconds, *GetNameSafe(Hit.GetActor()),
        *GetNameSafe(Hit.GetComponent()), Hit.ImpactNormal.Z);
    Record(FString::Printf(TEXT("input (%.1f,%.1f) -> bounds %s -> sweep %s -> position delta %.1f cm"),
            Input.X, Input.Y, bBounds ? TEXT("clamped") : TEXT("accepted"),
            Hit.bBlockingHit ? *GetNameSafe(Hit.GetComponent()) : TEXT("clear"), Actual.Size2D()));
}
#endif
