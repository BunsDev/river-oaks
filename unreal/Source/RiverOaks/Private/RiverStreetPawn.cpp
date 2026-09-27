#include "RiverStreetPawn.h"
#include "RiverOaksWorld.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Engine/Canvas.h"
#include "EngineUtils.h"
#include "GameFramework/PlayerController.h"
#include "InputCoreTypes.h"

ARiverStreetPawn::ARiverStreetPawn()
{
    PrimaryActorTick.bCanEverTick = true;
    Body = CreateDefaultSubobject<UCapsuleComponent>(TEXT("WalkingBody"));
    Body->InitCapsuleSize(35.f, 80.f);
    Body->SetCollisionProfileName(TEXT("Pawn"));
    RootComponent = Body;
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("StreetCamera"));
    Camera->SetupAttachment(Body);
    Camera->SetRelativeLocation(FVector(0, 0, 80));
    Camera->bUsePawnControlRotation = true;
    Camera->FieldOfView = 65.f;
}

void ARiverStreetPawn::BeginPlay()
{
    Super::BeginPlay();
    TActorIterator<ARiverOaksWorld> It(GetWorld());
    if (It) District = *It;
}

void ARiverStreetPawn::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    auto* PC = Cast<APlayerController>(Controller);
    if (!PC || !District) return;
    float MouseX = 0, MouseY = 0;
    PC->GetInputMouseDelta(MouseX, MouseY);
    FRotator Look = PC->GetControlRotation();
    Look.Yaw += MouseX * .15f + (PC->IsInputKeyDown(EKeys::Right) - PC->IsInputKeyDown(EKeys::Left)) * 80.f * DeltaSeconds;
    Look.Pitch = FMath::Clamp(FRotator::NormalizeAxis(Look.Pitch) - MouseY * .15f, -65.f, 65.f);
    Look.Roll = 0;
    PC->SetControlRotation(Look);
    const float Forward = PC->IsInputKeyDown(EKeys::W) - PC->IsInputKeyDown(EKeys::S);
    const float Side = PC->IsInputKeyDown(EKeys::D) - PC->IsInputKeyDown(EKeys::A);
    const FRotationMatrix Rotation(FRotator(0, Look.Yaw, 0));
    const FVector Direction = (Rotation.GetUnitAxis(EAxis::X) * Forward + Rotation.GetUnitAxis(EAxis::Y) * Side).GetClampedToMaxSize(1.);
    const FVector Next = District->ConstrainVisitor(GetActorLocation() + Direction * 165.f * FMath::Min(DeltaSeconds, .05f));
    SetActorLocation(Next, true);
    const bool bStillConversing = District->UpdateConversation(GetActorLocation());
    if (bConversationActive && !bStillConversing) Conversation.Empty();
    bConversationActive = bStillConversing;
    if (PC->WasInputKeyJustPressed(EKeys::E) && bConversationActive)
    {
        District->EndConversation();
        Conversation.Empty();
        bConversationActive = false;
    }
    else if (PC->WasInputKeyJustPressed(EKeys::E))
    {
        Conversation = District->GreetNearby(GetActorLocation());
        bConversationActive = District->UpdateConversation(GetActorLocation());
        ConversationUntil = GetWorld()->GetTimeSeconds() + 10.;
    }
    if (GetWorld()->GetTimeSeconds() > ConversationUntil) Conversation.Empty();
}

void ARiverStreetPawn::EndPlay(const EEndPlayReason::Type Reason)
{
    if (IsValid(District)) District->EndConversation();
    Super::EndPlay(Reason);
}

FString ARiverStreetPawn::InteractionPrompt() const
{
    if (bConversationActive) return TEXT("E - Finish conversation");
    const FString Person = District ? District->NearbyVisitor(GetActorLocation()) : FString();
    return Person.IsEmpty() ? TEXT("Walk the district. Approach a visitor to say hello.") : TEXT("E - Say hello to ") + Person;
}

void ARiverStreetHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner) return;
    const auto* Visitor = Cast<ARiverStreetPawn>(PlayerOwner->GetPawn());
    if (!Visitor) return;
    DrawRect(FLinearColor(0.06f, .05f, .08f, .8f), 16, 16, 440, 80);
    DrawText(TEXT("RIVER OAKS DISTRICT - ON FOOT"), FLinearColor::White, 30, 28);
    DrawText(TEXT("WASD walk | Mouse / arrows look | E greet"), FLinearColor::White, 30, 56);
    DrawRect(FLinearColor(0.06f, .05f, .08f, .8f), 16, Canvas->SizeY - 94, Canvas->SizeX - 32, 78);
    DrawText(Visitor->InteractionPrompt(), FLinearColor(1, .65f, .85f), 30, Canvas->SizeY - 80);
    DrawText(Visitor->Conversation, FLinearColor::White, 30, Canvas->SizeY - 52);
}
