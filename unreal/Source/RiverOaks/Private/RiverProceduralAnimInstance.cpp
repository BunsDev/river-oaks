#include "RiverProceduralAnimInstance.h"
#include "RiverGaitBlend.h"
#include "Animation/AnimInstanceProxy.h"

namespace
{
    class FRiverProceduralProxy final : public FAnimInstanceProxy
    {
    public:
        explicit FRiverProceduralProxy(UAnimInstance* Instance) : FAnimInstanceProxy(Instance) {}

        virtual void PreUpdate(UAnimInstance* Instance, float DeltaSeconds) override
        {
            FAnimInstanceProxy::PreUpdate(Instance, DeltaSeconds);
            const auto* River = CastChecked<URiverProceduralAnimInstance>(Instance);
            Distance = River->TravelDistanceCm;
            const bool bMoving = River->State == ERiverLocomotionState::WalkSlow ||
                River->State == ERiverLocomotionState::Walk || River->State == ERiverLocomotionState::Jog;
            TargetStrength = bMoving ? FMath::Clamp(River->GroundSpeed / 110., 0., 1.) *
                (River->State == ERiverLocomotionState::Jog ? 1.3 : 1.) : 0.;
        }

        virtual void UpdateAnimationNode(const FAnimationUpdateContext& Context) override
        {
            UpdateCounter.Increment();
            Blend.Update(Context.GetDeltaTime(), TargetStrength);
        }

        virtual bool Evaluate(FPoseContext& Output) override
        {
            Output.ResetToRefPose();
            const auto& Bones = Output.Pose.GetBoneContainer();
            const auto& Ref = Bones.GetReferenceSkeleton();
            for (const FCompactPoseBoneIndex Index : Output.Pose.ForEachBoneIndex())
            {
                const int32 MeshIndex = Bones.MakeMeshPoseIndex(Index).GetInt();
                const FName Name = Ref.GetBoneName(MeshIndex);
                const auto Rotate = [&](const FVector& ComponentAxis, double Angle)
                {
                    if (FMath::IsNearlyZero(Angle)) return;
                    auto& Transform = Output.Pose[Index];
                    FQuat ComponentRotation = Transform.GetRotation();
                    // Parents have already been evaluated. Include their resting
                    // corrections when mapping elbow and stride axes into bone space.
                    for (auto Parent = Output.Pose.GetParentBoneIndex(Index); Parent != INDEX_NONE;
                        Parent = Output.Pose.GetParentBoneIndex(Parent))
                        ComponentRotation = Output.Pose[Parent].GetRotation() * ComponentRotation;
                    const FVector Axis = ComponentRotation.Inverse().RotateVector(ComponentAxis);
                    Transform.SetRotation((Transform.GetRotation() * FQuat(Axis, Angle)).GetNormalized());
                };
                // The catalogue's A-pose is for skinning, not standing. Lower the
                // shoulders symmetrically and reduce the imported elbow flexion
                // to a small forward bend, without changing limb lengths.
                if (Name == TEXT("upperarm_l")) Rotate(FVector::YAxisVector, .65);
                else if (Name == TEXT("upperarm_r")) Rotate(FVector::YAxisVector, -.65);
                else if (Name == TEXT("lowerarm_l") || Name == TEXT("lowerarm_r"))
                    Rotate(-FVector::XAxisVector, .60);

                // Preserve the distance-driven phase through a stop while strength
                // settles; selecting Idle must not instantly reset all limb rotations.
                const double Angle = URiverLocomotionAnimInstance::StrideAngle(Name,
                    ERiverLocomotionState::Walk, Distance, 110.) * Blend.Strength;
                Rotate(-FVector::XAxisVector, Angle);
            }
            return true;
        }

    private:
        FRiverGaitBlend Blend;
        double Distance = 0., TargetStrength = 0.;
    };
}

FAnimInstanceProxy* URiverProceduralAnimInstance::CreateAnimInstanceProxy()
{
    return new FRiverProceduralProxy(this);
}

void URiverProceduralAnimInstance::DestroyAnimInstanceProxy(FAnimInstanceProxy* Proxy)
{
    delete Proxy;
}
