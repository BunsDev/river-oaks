#pragma once
#include "CoreMinimal.h"
#include "Animation/AnimInstance.h"
#include "RiverLocomotionAnimInstance.generated.h"

// The animation states a River Oaks resident can be in. One per name that
// RiverOaksRules::Locomotion can produce; there is no state the simulation cannot ask for.
UENUM(BlueprintType)
enum class ERiverLocomotionState : uint8
{
    Idle     UMETA(DisplayName = "Idle"),
    WalkSlow UMETA(DisplayName = "Walk Slow"),
    Walk     UMETA(DisplayName = "Walk"),
    Jog      UMETA(DisplayName = "Jog"),
    Shelter  UMETA(DisplayName = "Shelter"),
};

// Base class for the resident locomotion animation blueprint. The blueprint's state machine
// reads these values; it never writes them and never moves the component. Movement is
// authoritative in ARiverOaksWorld::MoveAgents and arrives as FRiverHumanPose, so animation
// follows the simulation rather than driving it (docs/astra-integration.md section 4).
UCLASS(Blueprintable)
class RIVEROAKS_API URiverLocomotionAnimInstance : public UAnimInstance
{
    GENERATED_BODY()
public:
    // The locomotion name exactly as the simulation produced it, for display and debugging.
    UPROPERTY(BlueprintReadOnly, Category = "River Oaks")
    FName Locomotion = NAME_None;

    // The state the blueprint should select. Derived, never authored.
    UPROPERTY(BlueprintReadOnly, Category = "River Oaks")
    ERiverLocomotionState State = ERiverLocomotionState::Idle;

    // Centimetres per second, derived from successive authoritative root positions -- not from
    // root motion in the animation, which would let the clip decide where the agent is.
    UPROPERTY(BlueprintReadOnly, Category = "River Oaks")
    float GroundSpeed = 0.f;

    // The only mapping from the simulation's locomotion vocabulary to an animation state.
    // An unrecognised name resolves to Idle: a backend must never invent a motion the
    // simulation did not ask for. tests/test_locomotion_states.py checks the two vocabularies
    // agree, and it runs in CI where the automation tests cannot.
    static ERiverLocomotionState StateFor(FName InLocomotion);

    // Called by FRiverSkeletalBackend once per applied pose.
    void ApplyLocomotion(FName InLocomotion, float InGroundSpeed);
};
