#pragma once
#include "RiverLocomotionAnimInstance.h"
#include "RiverProceduralAnimInstance.generated.h"

// Native fallback for the shipped MPFB game-engine skeleton. Blueprint subclasses of the
// base locomotion instance remain available for authored animation graphs.
UCLASS()
class RIVEROAKS_API URiverProceduralAnimInstance : public URiverLocomotionAnimInstance
{
    GENERATED_BODY()
protected:
    virtual FAnimInstanceProxy* CreateAnimInstanceProxy() override;
    virtual void DestroyAnimInstanceProxy(FAnimInstanceProxy* InProxy) override;
};
