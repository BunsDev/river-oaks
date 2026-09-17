#pragma once
#include "CoreMinimal.h"

namespace RiverOaksRules
{
    inline FVector ToUnreal(const FVector& M) { return FVector(M.X * 100., -M.Y * 100., M.Z * 100.); }
    inline FVector ToMeters(const FVector& Cm) { return FVector(Cm.X / 100., -Cm.Y / 100., Cm.Z / 100.); }
    inline FVector BuildingCenter(const FVector& BaseM, const FVector& SizeM)
    { return ToUnreal(BaseM + FVector(0, 0, SizeM.Z / 2.)); }
    inline float StepSeconds(float Delta) { return FMath::IsFinite(Delta) ? FMath::Clamp(Delta, 0.f, .05f) : 0.f; }
    inline int32 AgentCount(int32 Count) { return FMath::Clamp(Count, 0, 500); }
    inline bool AcceptBatch(int32 Tick, int32 Expected, double Age, double MaxAge)
    { return Tick == Expected && Age >= 0. && Age <= MaxAge; }
    inline FString FallbackAction(const FString& Kind, float Hour, float Rain, float Humidity = .7f, bool Storm = false)
    {
        if (Storm && Kind != TEXT("vehicle")) return TEXT("seek_shelter");
        if (Hour < 6.f || Hour >= 22.f || (Kind == TEXT("jogger") && Hour >= 11.f && Hour < 17.f)) return TEXT("pause");
        return Rain > .5f || (Humidity > .85f && Kind != TEXT("vehicle")) ? TEXT("slow") : TEXT("continue");
    }
    inline bool ValidAction(const FString& Action)
    {
        return Action == TEXT("continue") || Action == TEXT("pause") || Action == TEXT("greet") ||
            Action == TEXT("redirect") || Action == TEXT("seek_shelter") ||
            Action == TEXT("slow") || Action == TEXT("stop");
    }
    inline float SpeedMultiplier(const FString& Action, bool Blocked)
    {
        if (Blocked || Action == TEXT("stop") || Action == TEXT("pause") ||
            Action == TEXT("greet") || Action == TEXT("seek_shelter")) return 0.f;
        return Action == TEXT("slow") ? .5f : 1.f;
    }
    inline FString ConstrainAction(const FString& Requested, const FString& Kind, float Hour,
        float Rain, float Humidity = .7f, bool Storm = false)
    {
        const FString Local = FallbackAction(Kind, Hour, Rain, Humidity, Storm);
        // Inference may stop an agent, but cannot exceed the schedule/weather speed limit.
        return SpeedMultiplier(Local, false) < SpeedMultiplier(Requested, false) ? Local : Requested;
    }
}
