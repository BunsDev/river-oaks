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

void URiverLocomotionAnimInstance::ApplyLocomotion(FName InLocomotion, float InGroundSpeed, double StepDistanceCm)
{
    Locomotion = InLocomotion;
    State = StateFor(InLocomotion);
    GroundSpeed = FMath::IsFinite(InGroundSpeed) ? FMath::Max(0.f, InGroundSpeed) : 0.f;
    if (FMath::IsFinite(StepDistanceCm) && StepDistanceCm > 0.)
        TravelDistanceCm = FMath::Fmod(TravelDistanceCm + StepDistanceCm, 110.);
}

double URiverLocomotionAnimInstance::StrideAngle(FName Bone, ERiverLocomotionState InState,
    double DistanceCm, double SpeedCm)
{
    if (InState == ERiverLocomotionState::Idle || InState == ERiverLocomotionState::Shelter ||
        !FMath::IsFinite(DistanceCm) || !FMath::IsFinite(SpeedCm)) return 0.;
    const double Strength = FMath::Clamp(SpeedCm / 110., 0., 1.) *
        (InState == ERiverLocomotionState::Jog ? 1.3 : 1.);
    const bool Right = Bone == TEXT("thigh_r") || Bone == TEXT("calf_r") ||
        Bone == TEXT("foot_r") || Bone == TEXT("upperarm_r");
    const double Phase = DistanceCm / 110. * 2. * UE_PI + (Right ? UE_PI : 0.);
    const double Swing = FMath::Sin(Phase), Lift = FMath::Max(0., -FMath::Cos(Phase));
    if (Bone == TEXT("thigh_l") || Bone == TEXT("thigh_r")) return Swing * .29 * Strength;
    if (Bone == TEXT("calf_l") || Bone == TEXT("calf_r")) return -Lift * .42 * Strength;
    if (Bone == TEXT("foot_l") || Bone == TEXT("foot_r")) return (Lift * .15 - Swing * .08) * Strength;
    if (Bone == TEXT("upperarm_l") || Bone == TEXT("upperarm_r")) return -Swing * .16 * Strength;
    return 0.;
}
