#pragma once
#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interfaces/IHttpRequest.h"
#include "RiverOaksHumans.h"
#include "RiverMarkerBackend.h"
#include "RiverOaksWorld.generated.h"

class UInstancedStaticMeshComponent;
class UStaticMesh;
class UMaterialInterface;
class ADirectionalLight;
class AExponentialHeightFog;

struct FRiverRoute
{
    TArray<FVector> Points;
    float HalfWidth = 400.f;
};
struct FRiverAgent
{
    FString Id;
    FString Kind;
    FString Action = TEXT("continue");
    FVector Position = FVector::ZeroVector;
    int32 Route = 0;
    int32 Target = 1;
    int32 Direction = 1;
    float Speed = 140.f;
    double ActionUntil = 0.;
    bool bBlocked = false;
    // Visual state only. Backends receive these; they never write back into this struct.
    FRiverAppearanceRecipe Appearance;
    int32 HumanHandle = INDEX_NONE;
    uint64 PoseSequence = 0;
};

UCLASS(Blueprintable)
class RIVEROAKS_API ARiverOaksWorld : public AActor
{
    GENERATED_BODY()
public:
    ARiverOaksWorld();
    virtual void Tick(float DeltaSeconds) override;
    virtual void EndPlay(const EEndPlayReason::Type Reason) override;

    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks")
    int32 AgentPopulation = 300;
    // Meshes must use centered 100 cm nominal bounds. JSON styles select these slots.
    UPROPERTY(EditAnywhere, Category="River Oaks|Assets")
    TMap<FString, TObjectPtr<UStaticMesh>> BuildingStyleMeshes;
    UPROPERTY(EditAnywhere, Category="River Oaks|Assets")
    TObjectPtr<UStaticMesh> CanopyMesh;
    UPROPERTY(EditAnywhere, Category="River Oaks|Assets")
    TObjectPtr<UMaterialInterface> BlockoutMaterial;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks|Weather", meta=(ClampMin="0", ClampMax="24"))
    float Hour = 14.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks|Weather", meta=(ClampMin="0", ClampMax="1"))
    float Rain = 0.f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks|Weather", meta=(ClampMin="0", ClampMax="1"))
    float Humidity = .75f;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks|Weather")
    bool bStorm = false;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks|Weather")
    bool bCycleWeather = true;
    UPROPERTY(EditAnywhere, BlueprintReadWrite, Category="River Oaks|Weather")
    float DayLengthSeconds = 1200.f;
    UPROPERTY(EditInstanceOnly, Category="River Oaks|Weather")
    TObjectPtr<ADirectionalLight> Sun;
    UPROPERTY(EditInstanceOnly, Category="River Oaks|Weather")
    TObjectPtr<AExponentialHeightFog> Fog;
    UFUNCTION(BlueprintImplementableEvent, Category="River Oaks|Weather")
    void OnWeatherChanged(float RainAmount, float HumidityAmount, bool Storm, float TimeOfDay);

protected:
    virtual void BeginPlay() override;
private:
    UPROPERTY() TObjectPtr<UStaticMesh> Cube;
    UPROPERTY() TObjectPtr<UStaticMesh> Sphere;
    UPROPERTY() TObjectPtr<UInstancedStaticMeshComponent> People;
    TUniquePtr<FRiverMarkerBackend> MarkerBackend;   // built-in fallback, owned here
    IRiverHumanBackend* HumanBackend = nullptr;      // selected via IRiverHumanBackend::Select
    UPROPERTY() TArray<TObjectPtr<UInstancedStaticMeshComponent>> Geometry;
    TArray<FRiverRoute> Routes;
    TArray<FRiverAgent> Agents;
    FBox Bounds = FBox(ForceInit);
    FHttpRequestPtr PendingRequest;
    double RequestStarted = 0.;
    double NextDecision = 0.;
    double NextWeather = 0.;
    int32 RequestTick = 0;
    bool bLoaded = false;
    bool LoadManifest();
    UInstancedStaticMeshComponent* MakeInstances(FName Name, UStaticMesh* Mesh, const FLinearColor& Color, bool Collision);
    void SpawnAgents();
    void MoveAgents(float DeltaSeconds);
    void SelectHumanBackend();
    void TeardownHumans();
    void RequestDecisions();
    void UpdateWeather();
    FVector RouteTarget(const FRiverAgent& Agent) const;
};
