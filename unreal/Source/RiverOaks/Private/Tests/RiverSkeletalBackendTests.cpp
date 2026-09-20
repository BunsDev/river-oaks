#include "Misc/AutomationTest.h"
#include "RiverLocomotionAnimInstance.h"
#include "RiverMarkerBackend.h"
#include "RiverOaksHumans.h"
#include "RiverOaksRules.h"
#include "RiverSkeletalBackend.h"
#include "RiverAppearanceCatalogue.h"
#include "Components/SceneComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/World.h"
#include "GameFramework/Actor.h"
#include <limits>

#if WITH_DEV_AUTOMATION_TESTS

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverSkeletalLocomotionTest, "RiverOaks.Contracts.SkeletalLocomotion",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverSkeletalLocomotionTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("idle"), URiverLocomotionAnimInstance::StateFor(TEXT("idle")), ERiverLocomotionState::Idle);
    TestEqual(TEXT("walk_slow"), URiverLocomotionAnimInstance::StateFor(TEXT("walk_slow")), ERiverLocomotionState::WalkSlow);
    TestEqual(TEXT("walk"), URiverLocomotionAnimInstance::StateFor(TEXT("walk")), ERiverLocomotionState::Walk);
    TestEqual(TEXT("jog"), URiverLocomotionAnimInstance::StateFor(TEXT("jog")), ERiverLocomotionState::Jog);
    TestEqual(TEXT("shelter"), URiverLocomotionAnimInstance::StateFor(TEXT("shelter")), ERiverLocomotionState::Shelter);

    // An unrecognised name must resolve to Idle rather than inventing a motion.
    TestEqual(TEXT("unknown name falls back to Idle"),
        URiverLocomotionAnimInstance::StateFor(TEXT("moonwalk")), ERiverLocomotionState::Idle);
    TestEqual(TEXT("empty name falls back to Idle"),
        URiverLocomotionAnimInstance::StateFor(NAME_None), ERiverLocomotionState::Idle);

    // The two vocabularies must agree: no name the simulation can produce may land on the Idle
    // default unless it really is "idle". This is what catches a new locomotion state that was
    // added to the rules but never given an animation state.
    const TArray<FString> Actions = {
        TEXT("continue"), TEXT("pause"), TEXT("stop"), TEXT("slow"),
        TEXT("greet"), TEXT("redirect"), TEXT("seek_shelter"),
    };
    const TArray<FString> Kinds = { TEXT("pedestrian"), TEXT("jogger") };
    int32 Covered = 0;
    for (const FString& Action : Actions)
    {
        for (const FString& Kind : Kinds)
        {
            for (int32 BlockedIndex = 0; BlockedIndex < 2; ++BlockedIndex)
            {
                const FName Produced = RiverOaksRules::Locomotion(Action, Kind, BlockedIndex == 1);
                const ERiverLocomotionState State = URiverLocomotionAnimInstance::StateFor(Produced);
                if (Produced != FName(TEXT("idle")))
                {
                    TestTrue(FString::Printf(TEXT("'%s' from action '%s' has its own animation state"),
                        *Produced.ToString(), *Action), State != ERiverLocomotionState::Idle);
                }
                ++Covered;
            }
        }
    }
    TestEqual(TEXT("every action/kind/blocked combination was exercised"), Covered, Actions.Num() * Kinds.Num() * 2);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverSkeletalBackendTest, "RiverOaks.Contracts.SkeletalBackend",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverSkeletalBackendTest::RunTest(const FString& Parameters)
{
    // No owner and no mesh: the configuration the repository actually ships.
    FRiverSkeletalBackend Unconfigured(nullptr, {});
    TestFalse(TEXT("an unconfigured skeletal backend is not usable"), Unconfigured.IsUsable());

    const FRiverAppearanceRecipe Recipe;
    TestEqual(TEXT("an unusable backend refuses with INDEX_NONE"),
        Unconfigured.CreateHuman(TEXT("npc-0000"), Recipe), static_cast<int32>(INDEX_NONE));
    TestEqual(TEXT("refusal takes no ledger handle"), Unconfigured.Ledger().Num(), 0);
    TestEqual(TEXT("refusal creates no component"), Unconfigured.NumLiveComponents(), 0);
    TestFalse(TEXT("a pose for a handle that was never created is rejected"),
        Unconfigured.ApplyPose(0, FRiverHumanPose()));

    // Capability shape: outranks markers, loses to a licensed plugin.
    const FRiverHumanCapabilities Caps = Unconfigured.Probe();
    TestEqual(TEXT("backend name"), Caps.BackendName, FName(TEXT("Skeletal")));
    TestEqual(TEXT("declared priority"), Caps.Priority, FRiverSkeletalBackend::BackendPriority);
    TestTrue(TEXT("accepts runtime poses"), Caps.bRuntimePoseInput);
    TestTrue(TEXT("declares native LOD"), Caps.bNativeLod);
    TestFalse(TEXT("does not claim body morphs it cannot apply"), Caps.bBodyMorphs);
    TestFalse(TEXT("does not claim facial morphs it cannot apply"), Caps.bFacialMorphs);

    FRiverMarkerBackend Marker(nullptr);
    TestTrue(TEXT("skeletal outranks the marker fallback"),
        Caps.Priority > Marker.Probe().Priority);

    // Selection order: offered as a candidate against the marker fallback, skeletal wins.
    IRiverHumanBackend* Candidates[] = { &Unconfigured };
    TestEqual(TEXT("selection prefers skeletal over markers"),
        IRiverHumanBackend::SelectFrom(&Marker, Candidates),
        static_cast<IRiverHumanBackend*>(&Unconfigured));
    return true;
}
IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverSkeletalConfigurationTest, "RiverOaks.Contracts.SkeletalConfiguration",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverSkeletalConfigurationTest::RunTest(const FString& Parameters)
{
    UWorld* World = UWorld::CreateWorld(EWorldType::Game, false);
    AActor* Owner = World->SpawnActor<AActor>();
    auto* Root = NewObject<USceneComponent>(Owner);
    Owner->SetRootComponent(Root);
    Root->RegisterComponent();
    auto* Mesh = LoadObject<USkeletalMesh>(nullptr, TEXT("/Engine/EngineMeshes/SkeletalCube.SkeletalCube"));
    if (!TestNotNull(TEXT("engine skeletal fixture"), Mesh))
    {
        World->DestroyWorld(false);
        return false;
    }
    const auto Recipe = URiverAppearanceCatalogue::Resolve(0);
    const auto Appearances = [Mesh](UClass* AnimClass)
    {
        TMap<FName, FRiverSkeletalAppearance> Result;
        FRiverSkeletalAppearance Appearance;
        Appearance.Mesh = Mesh;
        Appearance.AnimClass = AnimClass;
        Result.Add(TEXT("woman-casual"), Appearance);
        return Result;
    };
    FRiverSkeletalBackend MissingAnimation(Owner, Appearances(nullptr));
    TestFalse(TEXT("mesh without animation cannot replace markers"), MissingAnimation.IsUsable());
    TestEqual(TEXT("missing animation refuses the human"),
        MissingAnimation.CreateHuman(TEXT("npc-0"), Recipe), INDEX_NONE);
    MissingAnimation.DestroyComponents();

    FRiverSkeletalBackend WrongAnimation(Owner, Appearances(UAnimInstance::StaticClass()));
    TestFalse(TEXT("unrelated animation cannot replace markers"), WrongAnimation.IsUsable());
    TestEqual(TEXT("unrelated animation refuses the human"),
        WrongAnimation.CreateHuman(TEXT("npc-0"), Recipe), INDEX_NONE);
    WrongAnimation.DestroyComponents();

    FRiverSkeletalBackend Configured(Owner, Appearances(URiverLocomotionAnimInstance::StaticClass()));
    TestEqual(TEXT("unknown appearance must not use an arbitrary mesh"),
        Configured.CreateHuman(TEXT("unknown"), FRiverAppearanceRecipe()), INDEX_NONE);
    auto Altered = Recipe;
    Altered.Garments.Empty();
    TestEqual(TEXT("altered garments cannot silently use the same mesh"),
        Configured.CreateHuman(TEXT("altered"), Altered), INDEX_NONE);
    TestEqual(TEXT("a valid recipe without its own asset is refused"),
        Configured.CreateHuman(TEXT("missing-profile"), URiverAppearanceCatalogue::Resolve(1)), INDEX_NONE);
    auto MissingStature = Recipe;
    MissingStature.BodyMorphs.Empty();
    TestEqual(TEXT("stature cannot be silently omitted"),
        Configured.CreateHuman(TEXT("missing-stature"), MissingStature), INDEX_NONE);
    auto Nonfinite = Recipe;
    Nonfinite.BodyMorphs[TEXT("Stature")] = std::numeric_limits<float>::quiet_NaN();
    TestEqual(TEXT("nonfinite stature is refused"),
        Configured.CreateHuman(TEXT("nonfinite"), Nonfinite), INDEX_NONE);
    TestEqual(TEXT("configuration refusals allocate no handles"), Configured.Ledger().Num(), 0);
    TestEqual(TEXT("configuration refusals allocate no components"), Configured.NumLiveComponents(), 0);
    Configured.DestroyComponents();

    FRiverSkeletalBackend Live(Owner, Appearances(URiverLocomotionAnimInstance::StaticClass()));
    const int32 Handle = Live.CreateHuman(TEXT("npc-0"), Recipe);
    TestTrue(TEXT("configured catalogue human is created"), Handle != INDEX_NONE);
    TArray<USkeletalMeshComponent*> Components;
    Owner->GetComponents(Components);
    if (TestEqual(TEXT("one component for the live human"), Components.Num(), 1))
    {
        auto* Component = Components[0];
        FRiverHumanPose Pose;
        Pose.Sequence = 1;
        Pose.Root = FTransform(FVector(100, 200, 90));
        Pose.SimTimeSeconds = 0.;
        Pose.Locomotion = TEXT("walk");
        TestTrue(TEXT("first authoritative pose applied"), Live.ApplyPose(Handle, Pose));
        const FBox Bounds = Mesh->GetImportedBounds().GetBox();
        TestTrue(TEXT("reference feet meet route ground"), FMath::IsNearlyZero(
            Component->GetComponentTransform().TransformPosition(FVector(0, 0, Bounds.Min.Z)).Z, .01));
        TestTrue(TEXT("recipe stature scales the mesh"), FMath::IsNearlyEqual(
            Bounds.GetSize().Z * Component->GetComponentScale().Z, 166., .01));
        auto* Anim = Cast<URiverLocomotionAnimInstance>(Component->GetAnimInstance());
        if (TestNotNull(TEXT("locomotion animation initialized"), Anim))
        {
            Pose.Sequence = 2;
            Pose.SimTimeSeconds = 1.;
            Pose.Root.SetLocation(FVector(200, 200, 90));
            TestTrue(TEXT("second authoritative pose applied"), Live.ApplyPose(Handle, Pose));
            TestEqual(TEXT("speed works when first pose is at time zero"), Anim->GroundSpeed, 100.f);
            TestTrue(TEXT("stature survives subsequent poses"), FMath::IsNearlyEqual(
                Bounds.GetSize().Z * Component->GetComponentScale().Z, 166., .01));
            TestFalse(TEXT("stale pose is refused"), Live.ApplyPose(Handle, Pose));
            Pose.Sequence = 3;
            Pose.SimTimeSeconds = std::numeric_limits<double>::quiet_NaN();
            TestFalse(TEXT("nonfinite time is refused"), Live.ApplyPose(Handle, Pose));
            TestEqual(TEXT("invalid pose does not consume sequence"), Live.Ledger().LastSequence(Handle), uint64(2));
            Pose.SimTimeSeconds = 2.;
            Component->DestroyComponent();
            TestFalse(TEXT("externally destroyed component refuses pose"), Live.ApplyPose(Handle, Pose));
            TestEqual(TEXT("missing component does not consume sequence"), Live.Ledger().LastSequence(Handle), uint64(2));
        }
    }
    Live.DestroyHuman(Handle);
    TestEqual(TEXT("released humans retain no components or animation"), Live.NumLiveComponents(), 0);
    Live.DestroyHuman(Handle);
    TestFalse(TEXT("destroyed handles reject poses"), Live.ApplyPose(Handle, FRiverHumanPose()));
    Live.DestroyComponents();
    Live.DestroyComponents();

    auto* OtherMesh = LoadObject<USkeletalMesh>(nullptr,
        TEXT("/Engine/EditorMeshes/SkeletalMesh/DefaultSkeletalMesh.DefaultSkeletalMesh"));
    if (TestNotNull(TEXT("second engine skeletal fixture"), OtherMesh))
    {
        auto Presets = Appearances(URiverLocomotionAnimInstance::StaticClass());
        FRiverSkeletalAppearance OtherAppearance;
        OtherAppearance.Mesh = OtherMesh;
        OtherAppearance.AnimClass = URiverLocomotionAnimInstance::StaticClass();
        Presets.Add(TEXT("man-casual"), OtherAppearance);
        FRiverSkeletalBackend PerProfile(Owner, Presets);
        const int32 First = PerProfile.CreateHuman(TEXT("woman"), Recipe);
        Components.Reset();
        Owner->GetComponents(Components);
        if (TestEqual(TEXT("first profile creates one component"), Components.Num(), 1))
            TestEqual(TEXT("first profile uses its catalogue mesh"), Components[0]->GetSkeletalMeshAsset(), Mesh);
        PerProfile.DestroyHuman(First);
        const int32 Second = PerProfile.CreateHuman(TEXT("man"), URiverAppearanceCatalogue::Resolve(1));
        TestTrue(TEXT("handles are never recycled across people"), Second > First);
        Components.Reset();
        Owner->GetComponents(Components);
        if (TestEqual(TEXT("second profile creates one component"), Components.Num(), 1))
            TestEqual(TEXT("second profile uses its own catalogue mesh"), Components[0]->GetSkeletalMeshAsset(), OtherMesh);
        PerProfile.DestroyComponents();
        TestEqual(TEXT("teardown releases every component"), PerProfile.NumLiveComponents(), 0);
        TestFalse(TEXT("teardown invalidates all live handles"), PerProfile.Ledger().IsLive(Second));
        const int32 Third = PerProfile.CreateHuman(TEXT("new-session"), Recipe);
        TestTrue(TEXT("teardown does not reuse stale handles"), Third > Second);
        PerProfile.DestroyComponents();
    }
    World->DestroyWorld(false);
    return true;
}
#endif
