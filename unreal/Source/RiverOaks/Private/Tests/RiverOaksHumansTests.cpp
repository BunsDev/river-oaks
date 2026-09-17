#include "Misc/AutomationTest.h"
#include "Features/IModularFeatures.h"
#include "RiverOaksHumans.h"
#include "RiverOaksRules.h"
#include "RiverOaksWorld.h"

#if WITH_DEV_AUTOMATION_TESTS
namespace
{
    // A backend that records what it receives. It has no reference to any FRiverAgent.
    struct FRecordingBackend final : public IRiverHumanBackend
    {
        int32 Priority = 0;
        FRiverHumanPoseLedger Ledger;
        TArray<FRiverHumanPose> Received;
        virtual FRiverHumanCapabilities Probe() const override
        {
            FRiverHumanCapabilities Caps;
            Caps.BackendName = FName(TEXT("Recording"));
            Caps.Priority = Priority;
            Caps.bRuntimePoseInput = true;
            return Caps;
        }
        virtual int32 CreateHuman(const FString&, const FRiverAppearanceRecipe&) override { return Ledger.Create(); }
        virtual void DestroyHuman(int32 Handle) override { Ledger.Destroy(Handle); }
        virtual bool ApplyPose(int32 Handle, const FRiverHumanPose& Pose) override
        {
            if (!Ledger.Accept(Handle, Pose.Sequence)) return false;
            Received.Add(Pose);
            return true;
        }
        virtual void SetLod(int32, ERiverHumanLod) override {}
        virtual void Tick(float) override {}
    };

    struct FScopedFeature
    {
        IModularFeature* Feature;
        explicit FScopedFeature(IModularFeature* In) : Feature(In)
        { IModularFeatures::Get().RegisterModularFeature(IRiverHumanBackend::GetModularFeatureName(), Feature); }
        ~FScopedFeature()
        { IModularFeatures::Get().UnregisterModularFeature(IRiverHumanBackend::GetModularFeatureName(), Feature); }
    };
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverHumanPoseSequenceTest, "RiverOaks.Contracts.HumanPoseSequence",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverHumanPoseSequenceTest::RunTest(const FString& Parameters)
{
    FRiverHumanPoseLedger Ledger;
    const int32 A = Ledger.Create();
    const int32 B = Ledger.Create();
    TestTrue(TEXT("first pose accepted"), Ledger.Accept(A, 1));
    TestFalse(TEXT("same sequence rejected"), Ledger.Accept(A, 1));
    TestFalse(TEXT("older sequence rejected"), Ledger.Accept(A, 0));
    TestTrue(TEXT("newer sequence accepted"), Ledger.Accept(A, 2));
    TestTrue(TEXT("gaps are allowed"), Ledger.Accept(A, 10));
    TestEqual(TEXT("last sequence tracked"), Ledger.LastSequence(A), static_cast<uint64>(10));
    TestTrue(TEXT("handles are independent"), Ledger.Accept(B, 1));
    TestFalse(TEXT("unknown handle rejected"), Ledger.Accept(99, 1));
    TestFalse(TEXT("negative handle rejected"), Ledger.Accept(INDEX_NONE, 1));
    TestTrue(TEXT("destroy live handle"), Ledger.Destroy(B));
    TestFalse(TEXT("destroyed handle rejects poses"), Ledger.Accept(B, 2));
    TestFalse(TEXT("double destroy rejected"), Ledger.Destroy(B));
    TestEqual(TEXT("handles are never reused"), Ledger.Create(), 2);
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverHumanBackendSelectionTest, "RiverOaks.Contracts.HumanBackendSelection",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverHumanBackendSelectionTest::RunTest(const FString& Parameters)
{
    FRecordingBackend Fallback;
    Fallback.Priority = 0;
    TestEqual(TEXT("nothing registered selects the fallback"), IRiverHumanBackend::Select(&Fallback), static_cast<IRiverHumanBackend*>(&Fallback));

    FRecordingBackend Plugin;
    Plugin.Priority = 10;
    {
        FScopedFeature Registered(&Plugin);
        TestEqual(TEXT("registered higher priority wins"), IRiverHumanBackend::Select(&Fallback), static_cast<IRiverHumanBackend*>(&Plugin));
        FRecordingBackend Better;
        Better.Priority = 20;
        {
            FScopedFeature RegisteredBetter(&Better);
            TestEqual(TEXT("highest priority wins among several"), IRiverHumanBackend::Select(&Fallback), static_cast<IRiverHumanBackend*>(&Better));
        }
        FRecordingBackend Tie;
        Tie.Priority = 0;
        {
            FScopedFeature RegisteredTie(&Tie);
            TestEqual(TEXT("ties keep the fallback over the tie but still lose to the plugin"),
                IRiverHumanBackend::Select(&Fallback), static_cast<IRiverHumanBackend*>(&Plugin));
        }
    }
    TestEqual(TEXT("unregistering restores the fallback"), IRiverHumanBackend::Select(&Fallback), static_cast<IRiverHumanBackend*>(&Fallback));
    FRecordingBackend Weak;
    Weak.Priority = -1;
    {
        FScopedFeature RegisteredWeak(&Weak);
        TestEqual(TEXT("lower priority than the fallback never wins"), IRiverHumanBackend::Select(&Fallback), static_cast<IRiverHumanBackend*>(&Fallback));
    }
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverHumanAuthorityTest, "RiverOaks.Contracts.HumanAuthority",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverHumanAuthorityTest::RunTest(const FString& Parameters)
{
    // The backend contract only exposes a handle and a const pose: it has no path to FRiverAgent.
    FRiverAgent Agent;
    Agent.Id = TEXT("npc-0001");
    Agent.Kind = TEXT("jogger");
    Agent.Position = FVector(1200, -800, 90);
    Agent.Action = TEXT("continue");
    const FRiverAgent Before = Agent;

    FRecordingBackend Backend;
    Agent.HumanHandle = Backend.CreateHuman(Agent.Id, Agent.Appearance);
    FRiverHumanPose Pose;
    Pose.Sequence = ++Agent.PoseSequence;
    Pose.Root = FTransform(FQuat::Identity, Agent.Position);
    Pose.Locomotion = RiverOaksRules::Locomotion(Agent.Action, Agent.Kind, Agent.bBlocked);
    TestTrue(TEXT("pose applied"), Backend.ApplyPose(Agent.HumanHandle, Pose));

    TestEqual(TEXT("position untouched by backend"), Agent.Position, Before.Position);
    TestEqual(TEXT("action untouched by backend"), Agent.Action, Before.Action);
    TestEqual(TEXT("route untouched by backend"), Agent.Target, Before.Target);
    TestEqual(TEXT("blocked untouched by backend"), Agent.bBlocked, Before.bBlocked);
    TestEqual(TEXT("backend saw the root the simulation produced"), Backend.Received.Last().Root.GetLocation(), Agent.Position);
    TestEqual(TEXT("backend saw derived locomotion, not the action string"), Backend.Received.Last().Locomotion, FName(TEXT("jog")));
    return true;
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverLocomotionTest, "RiverOaks.Contracts.Locomotion",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverLocomotionTest::RunTest(const FString& Parameters)
{
    TestEqual(TEXT("pedestrian walks"), RiverOaksRules::Locomotion(TEXT("continue"), TEXT("pedestrian"), false), FName(TEXT("walk")));
    TestEqual(TEXT("jogger jogs"), RiverOaksRules::Locomotion(TEXT("continue"), TEXT("jogger"), false), FName(TEXT("jog")));
    TestEqual(TEXT("slow walks slowly"), RiverOaksRules::Locomotion(TEXT("slow"), TEXT("jogger"), false), FName(TEXT("walk_slow")));
    TestEqual(TEXT("blocked is idle"), RiverOaksRules::Locomotion(TEXT("continue"), TEXT("pedestrian"), true), FName(TEXT("idle")));
    TestEqual(TEXT("stop is idle"), RiverOaksRules::Locomotion(TEXT("stop"), TEXT("pedestrian"), false), FName(TEXT("idle")));
    TestEqual(TEXT("pause is idle"), RiverOaksRules::Locomotion(TEXT("pause"), TEXT("jogger"), false), FName(TEXT("idle")));
    TestEqual(TEXT("shelter is its own state"), RiverOaksRules::Locomotion(TEXT("seek_shelter"), TEXT("pedestrian"), false), FName(TEXT("shelter")));
    return true;
}
#endif
