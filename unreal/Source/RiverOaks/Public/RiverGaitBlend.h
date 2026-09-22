#pragma once

#include <cmath>

struct FRiverGaitBlend
{
    double Strength = 0.0;
    double Velocity = 0.0;

    void Update(double DeltaSeconds, double TargetStrength)
    {
        if (!std::isfinite(DeltaSeconds) || DeltaSeconds <= 0.0 || !std::isfinite(TargetStrength))
            return;

        if (!std::isfinite(Strength) || !std::isfinite(Velocity))
            return;

        constexpr double MaxTarget = 1.3;
        constexpr double Omega = 16.0;
        const double Target = TargetStrength < 0.0 ? 0.0
            : (TargetStrength > MaxTarget ? MaxTarget : TargetStrength);

        if (DeltaSeconds >= 10.0)
        {
            Strength = Target;
            Velocity = 0.0;
            return;
        }

        const double Error = Strength - Target;
        const double Decay = std::exp(-Omega * DeltaSeconds);
        const double Response = (Velocity + Omega * Error) * DeltaSeconds;
        Strength = Target + (Error + Response) * Decay;
        Velocity = (Velocity - Omega * Response) * Decay;

        if (!std::isfinite(Strength) || !std::isfinite(Velocity))
        {
            Strength = Target;
            Velocity = 0.0;
        }
    }
};
