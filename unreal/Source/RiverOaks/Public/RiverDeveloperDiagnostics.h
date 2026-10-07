#pragma once
#include "CoreMinimal.h"
#include "Engine/HitResult.h"
#if !UE_BUILD_SHIPPING && !UE_BUILD_TEST
struct FSceneViewProjectionData;
// Local observations only: never represents a server acknowledgement.
struct FRiverDeveloperDiagnostics
{
    bool bEnabled = false;
    bool Layers[4] = {true, false, false, false};
    bool bStuck = false;
    float BlockedSeconds = 0, SampleSeconds = 0;
    double Clock = 0;
    uint64 Sequence = 0;
    FVector Input = FVector::ZeroVector, Requested = FVector::ZeroVector, Actual = FVector::ZeroVector;
    FHitResult BlockingHit, FloorHit;
    TWeakObjectPtr<UPrimitiveComponent> Selected;
    int32 SelectedItem = INDEX_NONE;
    FString Cause, Evidence, Fix;
    TArray<FString> Events;
    bool bCameraProjectionValid = false;
    float CameraHorizontalFov = 0, CameraAspectRatio = 0;
    FVector2D CameraHalfExtents = FVector2D::ZeroVector;
    FVector CameraOrigin = FVector::ZeroVector;
    FMatrix CameraToWorld = FMatrix::Identity;
    void Reset() { *this = FRiverDeveloperDiagnostics(); }
    bool ObserveCamera(const FSceneViewProjectionData& Projection);
    void Record(const FString& Event);
    void Observe(float Dt, const FVector& Direction, const FVector& Before, const FVector& Proposed,
        const FVector& Constrained, const FVector& After, const FHitResult& Hit);
};
#endif
