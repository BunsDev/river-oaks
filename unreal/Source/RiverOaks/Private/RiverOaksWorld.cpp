#include "RiverOaksWorld.h"
#include "RiverOaksRules.h"
#include "Components/InstancedStaticMeshComponent.h"
#include "Components/SceneComponent.h"
#include "Components/DirectionalLightComponent.h"
#include "Components/ExponentialHeightFogComponent.h"
#include "Engine/DirectionalLight.h"
#include "Engine/ExponentialHeightFog.h"
#include "Engine/StaticMesh.h"
#include "Engine/World.h"
#include "HttpModule.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "CollisionQueryParams.h"
#include "CollisionShape.h"
#include "Interfaces/IHttpResponse.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformTime.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
    using FValues = TArray<TSharedPtr<FJsonValue>>;
    bool Numbers(const FValues& Values, int32 Count)
    {
        if (Values.Num() != Count) return false;
        for (const auto& Value : Values)
        {
            double Number = 0.;
            if (!Value.IsValid() || !Value->TryGetNumber(Number) || !FMath::IsFinite(Number)) return false;
        }
        return true;
    }
    bool VectorField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, FVector& Out)
    {
        const FValues* Values = nullptr;
        if (!Object->TryGetArrayField(Key, Values) || !Numbers(*Values, 3)) return false;
        Out = FVector((*Values)[0]->AsNumber(), (*Values)[1]->AsNumber(), (*Values)[2]->AsNumber());
        return true;
    }
    bool PositiveField(const TSharedPtr<FJsonObject>& Object, const TCHAR* Key, double& Out)
    { return Object->TryGetNumberField(Key, Out) && FMath::IsFinite(Out) && Out > 0. && Out < 1000.; }
    TArray<TSharedPtr<FJsonValue>> JsonPosition(const FVector& Position)
    {
        const FVector M = RiverOaksRules::ToMeters(Position);
        return { MakeShared<FJsonValueNumber>(M.X), MakeShared<FJsonValueNumber>(M.Y), MakeShared<FJsonValueNumber>(M.Z) };
    }
}

ARiverOaksWorld::ARiverOaksWorld()
{
    PrimaryActorTick.bCanEverTick = true;
    RootComponent = CreateDefaultSubobject<USceneComponent>(TEXT("Root"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> CubeAsset(TEXT("/Engine/BasicShapes/Cube.Cube"));
    static ConstructorHelpers::FObjectFinder<UStaticMesh> SphereAsset(TEXT("/Engine/BasicShapes/Sphere.Sphere"));
    Cube = CubeAsset.Object;
    Sphere = SphereAsset.Object;
}

UInstancedStaticMeshComponent* ARiverOaksWorld::MakeInstances(FName Name, UStaticMesh* Mesh, const FLinearColor& Color, bool Collision)
{
    auto* Component = NewObject<UInstancedStaticMeshComponent>(this, Name);
    Component->SetupAttachment(RootComponent);
    Component->SetMobility(EComponentMobility::Movable);
    Component->SetStaticMesh(Mesh);
    Component->SetCollisionEnabled(Collision ? ECollisionEnabled::QueryOnly : ECollisionEnabled::NoCollision);
    Component->SetCollisionObjectType(ECC_WorldStatic);
    Component->SetCollisionResponseToAllChannels(ECR_Block);
    if (BlockoutMaterial)
    {
        auto* Material = UMaterialInstanceDynamic::Create(BlockoutMaterial, this);
        Material->SetVectorParameterValue(TEXT("Color"), Color);
        Component->SetMaterial(0, Material);
    }
    AddInstanceComponent(Component);
    Component->RegisterComponent();
    Geometry.Add(Component);
    return Component;
}

void ARiverOaksWorld::BeginPlay()
{
    Super::BeginPlay();
    if (!BlockoutMaterial)
        BlockoutMaterial = LoadObject<UMaterialInterface>(nullptr, TEXT("/Game/Generated/M_Blockout.M_Blockout"));
    bLoaded = LoadManifest();
    if (bLoaded) SpawnAgents();
    else UE_LOG(LogTemp, Error, TEXT("River Oaks: invalid/missing Content/Data/world.json; no world generated."));
}

bool ARiverOaksWorld::LoadManifest()
{
    const FString Path = FPaths::ProjectContentDir() / TEXT("Data/world.json");
    const int64 Bytes = IFileManager::Get().FileSize(*Path);
    if (Bytes <= 0 || Bytes > 64 * 1024 * 1024) return false;
    FString Text;
    TSharedPtr<FJsonObject> World;
    if (!FFileHelper::LoadFileToString(Text, *Path) || !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Text), World) || !World) return false;
    double Version = 0.;
    FString Crs;
    const FValues *Extent = nullptr, *Roads = nullptr, *Buildings = nullptr, *Trees = nullptr, *Origin = nullptr;
    if (!World->TryGetNumberField(TEXT("schema_version"), Version) || Version != 1. ||
        !World->TryGetStringField(TEXT("crs"), Crs) || Crs != TEXT("EPSG:32615") ||
        !World->TryGetArrayField(TEXT("origin"), Origin) || !Numbers(*Origin, 2) ||
        !World->TryGetArrayField(TEXT("bounds_m"), Extent) || !Numbers(*Extent, 4) ||
        !World->TryGetArrayField(TEXT("roads"), Roads) ||
        !World->TryGetArrayField(TEXT("buildings"), Buildings) ||
        !World->TryGetArrayField(TEXT("trees"), Trees)) return false;
    const double X0 = (*Extent)[0]->AsNumber(), Y0 = (*Extent)[1]->AsNumber();
    const double X1 = (*Extent)[2]->AsNumber(), Y1 = (*Extent)[3]->AsNumber();
    if (X1 - X0 <= 2. || Y1 - Y0 <= 2. || X1 - X0 > 20000. || Y1 - Y0 > 20000.) return false;
    if (Roads->Num() > 50000 || Buildings->Num() > 50000 || Trees->Num() > 200000) return false;
    Bounds = FBox(FVector(X0 * 100., -Y1 * 100., -100000.), FVector(X1 * 100., -Y0 * 100., 100000.));
    // Validate all geometry before creating any components. Reject malformed arrays without partial scenes.
    for (const auto& Value : *Roads)
    {
        const TSharedPtr<FJsonObject>* Road = nullptr;
        const FValues* Points = nullptr;
        double Width = 0.;
        if (!Value->TryGetObject(Road) || !PositiveField(*Road, TEXT("width_m"), Width) ||
            !(*Road)->TryGetArrayField(TEXT("points"), Points) || Points->Num() < 2 || Points->Num() > 10000) return false;
        for (const auto& Point : *Points)
        {
            const FValues* Coordinates = nullptr;
            if (!Point->TryGetArray(Coordinates) || !Numbers(*Coordinates, 3)) return false;
        }
    }
    for (const auto& Value : *Buildings)
    {
        const TSharedPtr<FJsonObject>* Building = nullptr;
        FVector Base, Size;
        double Yaw = 0.;
        if (!Value->TryGetObject(Building) || !VectorField(*Building, TEXT("center"), Base) ||
            !VectorField(*Building, TEXT("size"), Size) || Size.GetMin() <= 0. || Size.GetMax() > 1000. ||
            !(*Building)->TryGetNumberField(TEXT("yaw_deg"), Yaw) || !FMath::IsFinite(Yaw)) return false;
    }
    for (const auto& Value : *Trees)
    {
        const TSharedPtr<FJsonObject>* Tree = nullptr;
        FVector Base;
        double Height = 0., Radius = 0.;
        if (!Value->TryGetObject(Tree) || !VectorField(*Tree, TEXT("position"), Base) ||
            !PositiveField(*Tree, TEXT("height_m"), Height) || !PositiveField(*Tree, TEXT("crown_radius_m"), Radius)) return false;
    }
    auto* Ground = MakeInstances(TEXT("Ground"), Cube, FLinearColor(.13f, .21f, .1f), true);
    Ground->AddInstance(FTransform(FQuat::Identity, FVector((X0 + X1) * 50., -(Y0 + Y1) * 50., -55.), FVector(X1 - X0, Y1 - Y0, 1.)), true);
    auto* Asphalt = MakeInstances(TEXT("Roads"), Cube, FLinearColor(.07f, .075f, .08f), false);
    for (const auto& Value : *Roads)
    {
        const auto Road = Value->AsObject();
        FRiverRoute Route;
        Route.HalfWidth = Road->GetNumberField(TEXT("width_m")) * 50.;
        for (const auto& Point : Road->GetArrayField(TEXT("points")))
        {
            const auto& Coordinates = Point->AsArray();
            const FVector P = RiverOaksRules::ToUnreal(FVector(Coordinates[0]->AsNumber(), Coordinates[1]->AsNumber(), Coordinates[2]->AsNumber()));
            if (Route.Points.IsEmpty() || FVector::DistSquared(P, Route.Points.Last()) > 1.) Route.Points.Add(P);
        }
        for (int32 Index = 1; Index < Route.Points.Num(); ++Index)
        {
            const FVector Delta = Route.Points[Index] - Route.Points[Index - 1];
            Asphalt->AddInstance(FTransform(Delta.Rotation(), (Route.Points[Index] + Route.Points[Index - 1]) * .5,
                FVector(Delta.Size() / 100., Route.HalfWidth / 50., .08)), true);
        }
        if (Route.Points.Num() >= 2) Routes.Add(MoveTemp(Route));
    }
    TMap<FString, UInstancedStaticMeshComponent*> Styles;
    auto* Roofs = MakeInstances(TEXT("RoofBlocks"), Cube, FLinearColor(.18f, .13f, .11f), true);
    for (const auto& Value : *Buildings)
    {
        const auto Building = Value->AsObject();
        FVector Base, Size;
        VectorField(Building, TEXT("center"), Base);
        VectorField(Building, TEXT("size"), Size);
        FString Style;
        Building->TryGetStringField(TEXT("style"), Style);
        if (!Styles.Contains(Style))
        {
            const auto* Replacement = BuildingStyleMeshes.Find(Style);
            const float Shade = .4f + (GetTypeHash(Style) % 20) * .01f;
            Styles.Add(Style, MakeInstances(FName(*FString::Printf(TEXT("Style_%d"), Styles.Num())),
                Replacement && *Replacement ? Replacement->Get() : Cube.Get(), FLinearColor(Shade, Shade * .87f, Shade * .72f), true));
        }
        const FRotator Rotation(0., -Building->GetNumberField(TEXT("yaw_deg")), 0.);
        Styles[Style]->AddInstance(FTransform(Rotation, RiverOaksRules::BuildingCenter(Base, Size), Size), true);
        // Representative roof mass, intentionally not a reconstruction of any residence.
        const auto* Replacement = BuildingStyleMeshes.Find(Style);
        if (!Replacement || !*Replacement)
        {
            const auto Roof = [&](const FVector& OffsetM, const FVector& Scale, float Roll = 0.f)
            {
                const FVector Local = FVector(OffsetM.X * 100., -OffsetM.Y * 100., OffsetM.Z * 100.);
                Roofs->AddInstance(FTransform(Rotation.Quaternion() * FRotator(0, 0, Roll).Quaternion(),
                    RiverOaksRules::ToUnreal(Base) + Rotation.RotateVector(Local), Scale), true);
            };
            if (Style == TEXT("tudor_revival"))
            {
                Roof(FVector(0, Size.Y * .25, Size.Z + Size.Y * .12), FVector(Size.X, Size.Y * .55, .25), 28.f);
                Roof(FVector(0, -Size.Y * .25, Size.Z + Size.Y * .12), FVector(Size.X, Size.Y * .55, .25), -28.f);
            }
            else if (Style == TEXT("french_eclectic"))
            {
                Roof(FVector(0, 0, Size.Z + .35), FVector(Size.X, Size.Y, .7));
                Roof(FVector(0, 0, Size.Z + 1.1), FVector(Size.X * .8, Size.Y * .8, .8));
                Roof(FVector(0, 0, Size.Z + 1.65), FVector(Size.X * .6, Size.Y * .6, .3));
            }
            else if (Style == TEXT("georgian_colonial"))
            {
                Roof(FVector(0, 0, Size.Z + .3), FVector(Size.X, Size.Y, .6));
                Roof(FVector(0, 0, Size.Z + .85), FVector(Size.X * .75, Size.Y * .75, .5));
                Roof(FVector(Size.X * .3, 0, Size.Z + 1.5), FVector(.8, .8, 1.));
                Roof(FVector(-Size.X * .3, 0, Size.Z + 1.5), FVector(.8, .8, 1.));
            }
            else
            {
                Roof(FVector(0, 0, Size.Z + .12), FVector(Size.X, Size.Y, .24));
                Roof(FVector(Size.X * .15, 0, Size.Z + .7), FVector(Size.X * .35, Size.Y * .6, 1.));
            }
        }
    }
    auto* Trunks = MakeInstances(TEXT("Trunks"), Cube, FLinearColor(.19f, .12f, .065f), true);
    auto* Crowns = MakeInstances(TEXT("Canopy"), CanopyMesh ? CanopyMesh.Get() : Sphere.Get(), FLinearColor(.07f, .24f, .065f), false);
    for (const auto& Value : *Trees)
    {
        const auto Tree = Value->AsObject();
        FVector Base;
        VectorField(Tree, TEXT("position"), Base);
        const double Height = Tree->GetNumberField(TEXT("height_m"));
        const double Radius = Tree->GetNumberField(TEXT("crown_radius_m"));
        Trunks->AddInstance(FTransform(FQuat::Identity, RiverOaksRules::ToUnreal(Base + FVector(0, 0, Height * .3)), FVector(.4, .4, Height * .6)), true);
        Crowns->AddInstance(FTransform(FQuat::Identity, RiverOaksRules::ToUnreal(Base + FVector(0, 0, Height * .7)), FVector(Radius * 2., Radius * 2., Height * .6)), true);
    }
    UE_LOG(LogTemp, Display, TEXT("River Oaks BLOCKOUT loaded: %d roads, %d buildings, %d trees."), Roads->Num(), Buildings->Num(), Trees->Num());
    return true;
}

FVector ARiverOaksWorld::RouteTarget(const FRiverAgent& Agent) const
{
    const FRiverRoute& Route = Routes[Agent.Route];
    const int32 Previous = FMath::Clamp(Agent.Target - Agent.Direction, 0, Route.Points.Num() - 1);
    const FVector Tangent = (Route.Points[Agent.Target] - Route.Points[Previous]).GetSafeNormal2D();
    // A road-edge offset, not a surveyed sidewalk or navigation mesh.
    return Route.Points[Agent.Target] + FVector(-Tangent.Y, Tangent.X, 0.) * (Route.HalfWidth + 150.) + FVector(0, 0, 90.);
}

void ARiverOaksWorld::SpawnAgents()
{
    if (Routes.IsEmpty()) return;
    People = MakeInstances(TEXT("Agents"), Sphere, FLinearColor(.75f, .32f, .08f), false);
    FRandomStream Random(1729);
    for (int32 Index = 0; Index < RiverOaksRules::AgentCount(AgentPopulation); ++Index)
    {
        FRiverAgent Agent;
        Agent.Id = FString::Printf(TEXT("npc-%04d"), Index);
        Agent.Kind = Index % 5 == 0 ? TEXT("jogger") : TEXT("pedestrian");
        Agent.Speed = Agent.Kind == TEXT("jogger") ? 280.f : 140.f;
        Agent.Route = Random.RandRange(0, Routes.Num() - 1);
        const auto& Route = Routes[Agent.Route];
        Agent.Target = Random.RandRange(1, Route.Points.Num() - 1);
        Agent.Position = FMath::Lerp(Route.Points[Agent.Target - 1] + (RouteTarget(Agent) - Route.Points[Agent.Target]), RouteTarget(Agent), Random.FRand());
        Agent.Position.X = FMath::Clamp(Agent.Position.X, Bounds.Min.X + 100., Bounds.Max.X - 100.);
        Agent.Position.Y = FMath::Clamp(Agent.Position.Y, Bounds.Min.Y + 100., Bounds.Max.Y - 100.);
        People->AddInstance(FTransform(FQuat::Identity, Agent.Position, FVector(.6, .6, 1.8)), true);
        Agents.Add(MoveTemp(Agent));
    }
}

void ARiverOaksWorld::MoveAgents(float DeltaSeconds)
{
    const double Now = FPlatformTime::Seconds();
    for (int32 Index = 0; Index < Agents.Num(); ++Index)
    {
        auto& Agent = Agents[Index];
        if (Now > Agent.ActionUntil) Agent.Action = RiverOaksRules::FallbackAction(Agent.Kind, Hour, Rain, Humidity, bStorm);
        const FString EffectiveAction = RiverOaksRules::ConstrainAction(Agent.Action, Agent.Kind, Hour, Rain, Humidity, bStorm);
        const FVector Target = RouteTarget(Agent);
        const FVector ToTarget = Target - Agent.Position;
        if (ToTarget.Size2D() < 100.)
        {
            const int32 Last = Routes[Agent.Route].Points.Num() - 1;
            if (Agent.Target == Last) Agent.Direction = -1;
            else if (Agent.Target == 0) Agent.Direction = 1;
            Agent.Target += Agent.Direction;
        }
        const float Speed = Agent.Speed * RiverOaksRules::SpeedMultiplier(EffectiveAction, false);
        const FVector Next = Agent.Position + ToTarget.GetSafeNormal2D() * FMath::Min(Speed * DeltaSeconds, static_cast<float>(ToTarget.Size2D()));
        Agent.bBlocked = !Bounds.IsInsideXY(Next);
        FHitResult Hit;
        // Static mesh collision remains authoritative even when inference says continue.
        if (!Agent.bBlocked && GetWorld()->SweepSingleByObjectType(Hit, Agent.Position, Next, FQuat::Identity,
            FCollisionObjectQueryParams(ECC_WorldStatic), FCollisionShape::MakeSphere(35.f))) Agent.bBlocked = true;
        for (int32 Other = 0; Other < Agents.Num() && !Agent.bBlocked; ++Other)
            if (Other != Index && FVector::DistSquared2D(Next, Agents[Other].Position) < FMath::Square(70.f) &&
                FVector::DistSquared2D(Next, Agents[Other].Position) < FVector::DistSquared2D(Agent.Position, Agents[Other].Position)) Agent.bBlocked = true;
        if (!Agent.bBlocked) Agent.Position = Next;
        else if (Now > Agent.ActionUntil)
        {
            Agent.Direction *= -1;
            Agent.Target = FMath::Clamp(Agent.Target + Agent.Direction, 0, Routes[Agent.Route].Points.Num() - 1);
            Agent.ActionUntil = Now + 1.;
        }
        People->UpdateInstanceTransform(Index, FTransform(ToTarget.Rotation(), Agent.Position, FVector(.6, .6, 1.8)), true, false, true);
    }
    if (People) People->MarkRenderStateDirty();
}

void ARiverOaksWorld::RequestDecisions()
{
    const double Now = FPlatformTime::Seconds();
    if (PendingRequest || Agents.IsEmpty()) return;
    auto Packet = MakeShared<FJsonObject>();
    Packet->SetNumberField(TEXT("schema_version"), 1);
    Packet->SetNumberField(TEXT("tick"), ++RequestTick);
    Packet->SetNumberField(TEXT("hour"), Hour);
    auto Weather = MakeShared<FJsonObject>();
    Weather->SetNumberField(TEXT("rain"), Rain);
    Weather->SetNumberField(TEXT("humidity"), Humidity);
    Weather->SetBoolField(TEXT("storm"), bStorm);
    Packet->SetObjectField(TEXT("weather"), Weather);
    FValues Records;
    for (const auto& Agent : Agents)
    {
        auto Record = MakeShared<FJsonObject>();
        Record->SetStringField(TEXT("id"), Agent.Id);
        Record->SetStringField(TEXT("kind"), Agent.Kind);
        Record->SetArrayField(TEXT("position"), JsonPosition(Agent.Position));
        Record->SetStringField(TEXT("activity"), RiverOaksRules::ConstrainAction(Agent.Action, Agent.Kind, Hour, Rain, Humidity, bStorm));
        Record->SetBoolField(TEXT("blocked"), Agent.bBlocked);
        Record->SetField(TEXT("vehicle_distance_m"), MakeShared<FJsonValueNull>());
        FValues Nearby;
        for (const auto& Other : Agents)
        {
            const double Distance = FVector::Dist(Agent.Position, Other.Position) / 100.;
            if (Other.Id == Agent.Id || Distance > 10.) continue;
            auto Neighbor = MakeShared<FJsonObject>();
            Neighbor->SetStringField(TEXT("id"), Other.Id);
            Neighbor->SetStringField(TEXT("kind"), Other.Kind);
            Neighbor->SetNumberField(TEXT("distance_m"), Distance);
            Nearby.Add(MakeShared<FJsonValueObject>(Neighbor));
            if (Nearby.Num() == 8) break;
        }
        Record->SetArrayField(TEXT("nearby"), Nearby);
        Records.Add(MakeShared<FJsonValueObject>(Record));
    }
    Packet->SetArrayField(TEXT("agents"), Records);
    FString Body;
    FJsonSerializer::Serialize(Packet, TJsonWriterFactory<>::Create(&Body));
    PendingRequest = FHttpModule::Get().CreateRequest();
    PendingRequest->SetURL(TEXT("http://127.0.0.1:8765/v1/decisions"));
    PendingRequest->SetVerb(TEXT("POST"));
    PendingRequest->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
    PendingRequest->SetContentAsString(Body);
    PendingRequest->SetTimeout(1.25f);
    PendingRequest->SetDelegateThreadPolicy(EHttpRequestDelegateThreadPolicy::CompleteOnGameThread);
    RequestStarted = Now;
    const int32 ExpectedTick = RequestTick;
    PendingRequest->OnProcessRequestComplete().BindWeakLambda(this,
        [this, ExpectedTick, Now](FHttpRequestPtr Request, FHttpResponsePtr Response, bool Success)
        {
            if (Request != PendingRequest) return;
            PendingRequest.Reset();
            if (!Success || !Response || Response->GetResponseCode() != 200 || Response->GetContent().Num() > 1024 * 1024) return;
            TSharedPtr<FJsonObject> Result;
            if (!FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Response->GetContentAsString()), Result) || !Result) return;
            double Version = 0., Tick = 0.;
            const FValues* Decisions = nullptr;
            if (!Result->TryGetNumberField(TEXT("schema_version"), Version) || Version != 1. ||
                !Result->TryGetNumberField(TEXT("tick"), Tick) || Tick != ExpectedTick ||
                !RiverOaksRules::AcceptBatch(ExpectedTick, RequestTick, FPlatformTime::Seconds() - Now, 1.5) ||
                !Result->TryGetArrayField(TEXT("decisions"), Decisions) || Decisions->Num() > Agents.Num()) return;
            TMap<FString, FString> Actions;
            for (const auto& Value : *Decisions)
            {
                const TSharedPtr<FJsonObject>* Decision = nullptr;
                FString Id, Action;
                if (!Value->TryGetObject(Decision) || !(*Decision)->TryGetStringField(TEXT("id"), Id) ||
                    !(*Decision)->TryGetStringField(TEXT("action"), Action) ||
                    !RiverOaksRules::ValidAction(Action) || Actions.Contains(Id)) return;
                Actions.Add(Id, Action);
            }
            for (auto& Agent : Agents)
                if (const FString* Action = Actions.Find(Agent.Id))
                {
                    Agent.Action = *Action;
                    Agent.ActionUntil = FPlatformTime::Seconds() + 1.5;
                    if (*Action == TEXT("redirect"))
                    {
                        Agent.Direction *= -1;
                        Agent.Target = FMath::Clamp(Agent.Target + Agent.Direction, 0, Routes[Agent.Route].Points.Num() - 1);
                    }
                }
        });
    if (!PendingRequest->ProcessRequest()) PendingRequest.Reset();
}

void ARiverOaksWorld::UpdateWeather()
{
    Rain = FMath::Clamp(Rain, 0.f, 1.f);
    Humidity = FMath::Clamp(Humidity, 0.f, 1.f);
    if (Sun)
    {
        Sun->SetActorRotation(FRotator(-FMath::Sin((Hour - 6.f) / 24.f * 2.f * PI) * 70.f, Hour * 15.f, 0.f));
        if (auto* Light = Cast<UDirectionalLightComponent>(Sun->GetLightComponent()))
            Light->SetIntensity(FMath::Max(0.f, FMath::Sin((Hour - 6.f) / 24.f * 2.f * PI)) * 8.f * (1.f - Rain * .7f));
    }
    if (Fog) Fog->GetComponent()->SetFogDensity(.005f + Humidity * .012f + Rain * .035f);
    OnWeatherChanged(Rain, Humidity, bStorm, Hour);
}

void ARiverOaksWorld::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    if (!bLoaded) return;
    MoveAgents(RiverOaksRules::StepSeconds(DeltaSeconds));
    Hour = FMath::Fmod(Hour + RiverOaksRules::StepSeconds(DeltaSeconds) * 24.f / FMath::Max(60.f, DayLengthSeconds), 24.f);
    const double Now = FPlatformTime::Seconds();
    if (PendingRequest && Now - RequestStarted > 1.5)
    {
        PendingRequest->OnProcessRequestComplete().Unbind();
        PendingRequest->CancelRequest();
        PendingRequest.Reset();
    }
    if (Now >= NextDecision) { NextDecision = Now + 2.; RequestDecisions(); }
    if (Now >= NextWeather)
    {
        NextWeather = Now + 1.;
        if (bCycleWeather)
        {
            Rain = FMath::Clamp((FMath::Sin(GetWorld()->GetTimeSeconds() / 90.f) - .3f) * 1.4f, 0.f, 1.f);
            Humidity = .72f + Rain * .25f;
            bStorm = Rain > .8f;
        }
        UpdateWeather();
    }
}

void ARiverOaksWorld::EndPlay(const EEndPlayReason::Type Reason)
{
    if (PendingRequest)
    {
        PendingRequest->OnProcessRequestComplete().Unbind();
        PendingRequest->CancelRequest();
        PendingRequest.Reset();
    }
    Super::EndPlay(Reason);
}
