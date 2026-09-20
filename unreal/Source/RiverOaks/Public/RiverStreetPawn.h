#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Pawn.h"
#include "GameFramework/HUD.h"
#include "RiverStreetPawn.generated.h"

class UCameraComponent;
class UCapsuleComponent;
class ARiverOaksWorld;

UCLASS()
class RIVEROAKS_API ARiverStreetPawn : public APawn
{
    GENERATED_BODY()
public:
    ARiverStreetPawn();
    virtual void Tick(float DeltaSeconds) override;
    FString InteractionPrompt() const;
    FString Conversation;
protected:
    virtual void BeginPlay() override;
private:
    UPROPERTY() TObjectPtr<UCapsuleComponent> Body;
    UPROPERTY() TObjectPtr<UCameraComponent> Camera;
    UPROPERTY() TObjectPtr<ARiverOaksWorld> District;
    double ConversationUntil = 0.;
};

UCLASS()
class RIVEROAKS_API ARiverStreetHUD : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};
