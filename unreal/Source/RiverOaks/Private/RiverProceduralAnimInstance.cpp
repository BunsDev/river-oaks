#include "RiverProceduralAnimInstance.h"
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
            State = River->State;
            Distance = River->TravelDistanceCm;
            Speed = River->GroundSpeed;
        }

        virtual void UpdateAnimationNode(const FAnimationUpdateContext& Context) override
        {
            UpdateCounter.Increment();
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
                const double Angle = URiverLocomotionAnimInstance::StrideAngle(Name, State, Distance, Speed);
                if (FMath::IsNearlyZero(Angle)) continue;
                FQuat ReferenceRotation = Ref.GetRefBonePose()[MeshIndex].GetRotation();
                for (int32 Parent = Ref.GetParentIndex(MeshIndex); Parent != INDEX_NONE; Parent = Ref.GetParentIndex(Parent))
                    ReferenceRotation = Ref.GetRefBonePose()[Parent].GetRotation() * ReferenceRotation;
                // Neutral meshes face +Y; their lateral -X becomes world +Y after
                // the backend's facing correction. Convert that axis to bone space.
                const FVector Axis = ReferenceRotation.Inverse().RotateVector(-FVector::XAxisVector);
                auto& Transform = Output.Pose[Index];
                Transform.SetRotation((Transform.GetRotation() * FQuat(Axis, Angle)).GetNormalized());
            }
            return true;
        }

    private:
        ERiverLocomotionState State = ERiverLocomotionState::Idle;
        double Distance = 0., Speed = 0.;
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
