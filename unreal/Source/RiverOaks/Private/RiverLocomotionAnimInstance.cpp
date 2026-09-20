#include "RiverLocomotionAnimInstance.h"

ERiverLocomotionState URiverLocomotionAnimInstance::StateFor(FName InLocomotion)
{
    // Mirrors RiverOaksRules::Locomotion, which is the only producer of these names.
    if (InLocomotion == TEXT("idle")) return ERiverLocomotionState::Idle;
    if (InLocomotion == TEXT("walk_slow")) return ERiverLocomotionState::WalkSlow;
    if (InLocomotion == TEXT("walk")) return ERiverLocomotionState::Walk;
    if (InLocomotion == TEXT("jog")) return ERiverLocomotionState::Jog;
    if (InLocomotion == TEXT("shelter")) return ERiverLocomotionState::Shelter;
    return ERiverLocomotionState::Idle;
}

void URiverLocomotionAnimInstance::ApplyLocomotion(FName InLocomotion, float InGroundSpeed)
{
    Locomotion = InLocomotion;
    State = StateFor(InLocomotion);
    GroundSpeed = InGroundSpeed;
}
