#include "RiverStreetPawn.h"
#if !UE_BUILD_SHIPPING && !UE_BUILD_TEST
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "DrawDebugHelpers.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/GameViewportClient.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/PlayerController.h"
#include "GameFramework/PlayerState.h"
#include "InputCoreTypes.h"
#include "SceneView.h"

namespace
{
FBoxSphereBounds SelectedBounds(UPrimitiveComponent* Primitive, int32 Item)
{
    const auto* Instances = Cast<UInstancedStaticMeshComponent>(Primitive);
    FTransform Transform;
    if (Instances && Instances->GetStaticMesh() && Item >= 0 && Item < Instances->GetInstanceCount()
        && Instances->GetInstanceTransform(Item, Transform, true))
        return Instances->GetStaticMesh()->GetBounds().TransformBy(Transform);
    return Primitive->Bounds;
}

const TCHAR* RoleName(ENetRole Role)
{
    switch (Role)
    {
    case ROLE_Authority: return TEXT("authority");
    case ROLE_AutonomousProxy: return TEXT("owning client proxy");
    case ROLE_SimulatedProxy: return TEXT("simulated proxy");
    default: return TEXT("none");
    }
}
const TCHAR* NetModeName(ENetMode Mode)
{
    switch (Mode)
    {
    case NM_Client: return TEXT("client");
    case NM_ListenServer: return TEXT("listen server");
    case NM_DedicatedServer: return TEXT("dedicated server");
    default: return TEXT("standalone (no server round trip)");
    }
}
}

void ARiverStreetPawn::UpdateDeveloperView(APlayerController* PC, float Dt)
{
    if (PC->WasInputKeyJustPressed(EKeys::F7))
    {
        const bool bEnable = !Diagnostics.bEnabled;
        Diagnostics.Reset();
        Diagnostics.bEnabled = bEnable;
    }
    auto& D = Diagnostics;
    if (!D.bEnabled) return;
    const FKey Keys[] = {EKeys::One, EKeys::Two, EKeys::Three, EKeys::Four};
    for (int32 I = 0; I < 4; ++I)
        if (PC->WasInputKeyJustPressed(Keys[I])) D.Layers[I] = !D.Layers[I];
    FCollisionQueryParams Query(SCENE_QUERY_STAT(RiverDeveloperView), false, this);
    if (PC->WasInputKeyJustPressed(EKeys::F6))
    {
        FHitResult Hit;
        GetWorld()->LineTraceSingleByChannel(Hit, Camera->GetComponentLocation(),
            Camera->GetComponentLocation() + Camera->GetForwardVector() * 2000, ECC_Visibility, Query);
        D.Selected = Hit.GetComponent();
        D.SelectedItem = Hit.Item;
        D.Record(TEXT("selection -> ") + GetNameSafe(Hit.GetComponent()));
    }
    // The recorder samples at 10 Hz; floor queries share that cadence.
    if (D.SampleSeconds + Dt >= .1f && D.Layers[0])
    {
        const FVector Feet = GetActorLocation() - FVector(0,0,Body->GetScaledCapsuleHalfHeight());
        GetWorld()->LineTraceSingleByChannel(D.FloorHit, Feet + FVector(0,0,10),
            Feet - FVector(0,0,100), ECC_Visibility, Query);
    }
    if (D.Layers[0])
    {
        DrawDebugCapsule(GetWorld(), GetActorLocation(), Body->GetScaledCapsuleHalfHeight(),
            Body->GetScaledCapsuleRadius(), Body->GetComponentQuat(), FColor::Cyan);
        DrawDebugDirectionalArrow(GetWorld(), GetActorLocation(), GetActorLocation() + D.Input * 120, 16, FColor::Yellow);
        if (D.FloorHit.bBlockingHit)
            DrawDebugSphere(GetWorld(), D.FloorHit.ImpactPoint, 6, 8, FColor::Green);
        if (D.BlockingHit.bBlockingHit)
        {
            DrawDebugSphere(GetWorld(), D.BlockingHit.ImpactPoint, 8, 8, FColor::Red);
            DrawDebugDirectionalArrow(GetWorld(), D.BlockingHit.ImpactPoint,
                D.BlockingHit.ImpactPoint + D.BlockingHit.ImpactNormal * 80, 16, FColor::Red);
        }
    }
    D.bCameraProjectionValid = false;
    const auto* LocalPlayer = PC->GetLocalPlayer();
    FSceneViewProjectionData Projection;
    if (D.Layers[1] && LocalPlayer && LocalPlayer->ViewportClient && LocalPlayer->ViewportClient->Viewport
        && LocalPlayer->GetProjectionData(LocalPlayer->ViewportClient->Viewport, Projection)
        && D.ObserveCamera(Projection))
    {
        const FVector Origin = D.CameraOrigin;
        FVector Corners[4];
        for (int32 I = 0; I < 4; ++I)
        {
            const FVector ViewCorner(D.CameraHalfExtents.X * ((I & 1) ? 1 : -1),
                D.CameraHalfExtents.Y * ((I & 2) ? 1 : -1), 200);
            Corners[I] = Origin + D.CameraToWorld.TransformVector(ViewCorner);
            DrawDebugLine(GetWorld(), Origin, Corners[I], FColor::Magenta);
        }
        for (const auto Pair : {FIntPoint(0,1), FIntPoint(1,3), FIntPoint(3,2), FIntPoint(2,0)})
            DrawDebugLine(GetWorld(), Corners[Pair.X], Corners[Pair.Y], FColor::Magenta);
    }
    if (D.Layers[2])
    {
        UPrimitiveComponent* Primitive = D.Selected.Get();
        if (!Primitive) Primitive = D.BlockingHit.GetComponent();
        if (Primitive)
        {
            const auto Bounds = SelectedBounds(Primitive, D.Selected.IsValid() ? D.SelectedItem : D.BlockingHit.Item);
            DrawDebugBox(GetWorld(), Bounds.Origin, Bounds.BoxExtent, FColor::Orange);
        }
    }
}

void ARiverStreetHUD::DrawDeveloperView(const ARiverStreetPawn* Visitor)
{
    const auto& D = Visitor->Diagnostics;
    if (!D.bEnabled) return;
    // Fit vertically and wrap long evidence rather than spilling across the play view.
    const float Width = FMath::Min(740.f, Canvas->SizeX - 32.f);
    float Y = 112;
    const float Bottom = Canvas->SizeY - 110.f;
    UFont* Font = GEngine->GetSmallFont();
    float TextWidth = 0, TextHeight = 0;
    Canvas->StrLen(Font, TEXT("Mg"), TextWidth, TextHeight, true);
    const float RowHeight = FMath::Max(18.f, TextHeight + 3.f);
    auto Line = [&](const FString& Text, FLinearColor Color = FLinearColor::White)
    {
        if (Y + RowHeight >= Bottom) return;
        FTextSizingParameters Sizing(Font, 1.f, 1.f);
        Sizing.DrawXL = Width - 24;
        TArray<FWrappedStringElement> Wrapped;
        Canvas->WrapString(Sizing, 0.f, Text, Wrapped);
        for (const auto& Row : Wrapped)
        {
            if (Y + RowHeight >= Bottom) break;
            DrawRect(FLinearColor(.025f,.025f,.04f,.88f), 16, Y, Width, RowHeight);
            DrawText(Row.Value, Color, 24, Y, Font);
            Y += RowHeight;
        }
    };
    Line(TEXT("DEV | F7 off | F6 select at center | 1 movement 2 camera 3 world 4 network"), FLinearColor::Yellow);
    Line(FString::Printf(TEXT("Layers: movement %s | camera %s | world %s | network %s"),
        D.Layers[0] ? TEXT("on") : TEXT("off"), D.Layers[1] ? TEXT("on") : TEXT("off"),
        D.Layers[2] ? TEXT("on") : TEXT("off"), D.Layers[3] ? TEXT("on") : TEXT("off")));
    Line(D.bStuck ? TEXT("What happened: movement input produced negligible progress for >= 0.35s.") : TEXT("What happened: no sustained blockage detected."));
    Line(TEXT("Likely cause: ") + D.Cause);
    Line(TEXT("Evidence: ") + D.Evidence);
    Line(TEXT("Suggested fix: ") + D.Fix);
    if (D.Layers[0])
        Line(FString::Printf(TEXT("Floor: %s | normal Z %.2f | step height / walkable slope: unsupported by fixed-height APawn"),
            D.FloorHit.bBlockingHit ? *GetNameSafe(D.FloorHit.GetComponent()) : TEXT("no support within probe"), D.FloorHit.ImpactNormal.Z));
    if (D.Layers[1])
    {
        Line(D.bCameraProjectionValid ? FString::Printf(TEXT("Camera: %s | horizontal FOV %.1f | aspect %.2f | clipping: guide only, use engine view tools"),
            *D.CameraOrigin.ToCompactString(), D.CameraHorizontalFov, D.CameraAspectRatio)
            : TEXT("Camera projection: unavailable (no local perspective viewport)."));
        DrawLine(Canvas->SizeX * .5f, 0, Canvas->SizeX * .5f, Canvas->SizeY, FLinearColor(.5f,.5f,.5f,.4f));
        DrawLine(0, Canvas->SizeY * .5f, Canvas->SizeX, Canvas->SizeY * .5f, FLinearColor(.5f,.5f,.5f,.4f));
    }
    UPrimitiveComponent* Selected = D.Selected.Get();
    if (!Selected) Selected = D.BlockingHit.GetComponent();
    const AActor* Subject = Selected ? Selected->GetOwner() : Visitor;
    if (D.Layers[2])
    {
        const auto* Mesh = Cast<UStaticMeshComponent>(Selected);
        Line(Selected ? FString::Printf(TEXT("Selected: %s/%s instance %d | asset: %s | query collision: %s (bounds guide only)"),
            *GetNameSafe(Subject), *GetNameSafe(Selected), D.Selected.IsValid() ? D.SelectedItem : D.BlockingHit.Item, Mesh ? *GetPathNameSafe(Mesh->GetStaticMesh()) : TEXT("not a static mesh"),
            Selected->IsQueryCollisionEnabled() ? TEXT("on") : TEXT("off")) : TEXT("Selected: none; aim at a visibility-blocking object within 20 m."));
        Line(TEXT("Mesh edges / exact collision: engine viewmode wireframe / show collision. Interaction zones: not instrumented."));
    }
    if (D.Layers[3])
    {
        Line(FString::Printf(TEXT("Local observation on %s | owner %s | local role %s remote role %s | replicated %s"),
            NetModeName(Visitor->GetNetMode()), *GetNameSafe(Subject->GetOwner()), RoleName(Subject->GetLocalRole()), RoleName(Subject->GetRemoteRole()),
            Subject->GetIsReplicated() ? TEXT("yes") : TEXT("no")));
        const auto* State = PlayerOwner->PlayerState.Get();
        Line(State ? FString::Printf(TEXT("PlayerState ping %.1f ms (not this action's response time)"), State->GetPingInMilliseconds()) : TEXT("Network delay: unavailable (no PlayerState)."));
        Line(TEXT("Native pawn has no replicated movement/RPC chain. Server response and replication receipt: unavailable."));
    }
    Line(TEXT("Timeline (newest first): input -> bounds -> actual sweep -> pawn position; HUD presents latest sample."), FLinearColor::Yellow);
    for (int32 I = D.Events.Num() - 1; I >= FMath::Max(0, D.Events.Num() - 5); --I) Line(D.Events[I]);
    DrawLine(Canvas->SizeX * .5f - 6, Canvas->SizeY * .5f, Canvas->SizeX * .5f + 6, Canvas->SizeY * .5f, FLinearColor::Yellow);
}
#endif
