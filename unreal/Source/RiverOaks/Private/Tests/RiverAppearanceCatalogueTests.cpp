#include "Misc/AutomationTest.h"
#include <limits>
#include "RiverAppearanceCatalogue.h"
#include "RiverOaksHumans.h"

#if WITH_DEV_AUTOMATION_TESTS
namespace
{
    // Counts CreateHuman calls so a rejected recipe can be shown never to reach a backend.
    struct FCountingBackend final : public IRiverHumanBackend
    {
        int32 Created = 0;
        FRiverHumanPoseLedger Ledger;
        virtual FRiverHumanCapabilities Probe() const override { return FRiverHumanCapabilities(); }
        virtual int32 CreateHuman(const FString&, const FRiverAppearanceRecipe&) override
        { ++Created; return Ledger.Create(); }
        virtual void DestroyHuman(int32 Handle) override { Ledger.Destroy(Handle); }
        virtual bool ApplyPose(int32 Handle, const FRiverHumanPose& Pose) override
        { return Ledger.Accept(Handle, Pose.Sequence); }
        virtual void SetLod(int32, ERiverHumanLod) override {}
        virtual void Tick(float) override {}
    };

    // The guard ARiverOaksWorld applies: validate, and only then create.
    bool CreateIfValid(FCountingBackend& Backend, const FRiverAppearanceRecipe& Recipe, int32 PersonaIndex)
    {
        FString Reason;
        if (!FRiverRecipeValidator::Validate(Recipe, PersonaIndex, Reason)) return false;
        Backend.CreateHuman(TEXT("npc"), Recipe);
        return true;
    }
}

IMPLEMENT_SIMPLE_AUTOMATION_TEST(FRiverPortrayalRecipeTest, "RiverOaks.Contracts.PortrayalRecipe",
    EAutomationTestFlags::EditorContext | EAutomationTestFlags::EngineFilter)
bool FRiverPortrayalRecipeTest::RunTest(const FString& Parameters)
{
    FString Reason;

    // The resolved recipe passes for every persona, portrayal or not.
    for (int32 Persona = 0; Persona < 24; ++Persona)
    {
        const FRiverAppearanceRecipe Resolved = URiverAppearanceCatalogue::Resolve(Persona);
        TestTrue(FString::Printf(TEXT("resolved recipe for persona %d validates"), Persona),
            FRiverRecipeValidator::Validate(Resolved, Persona, Reason));
        TestTrue(FString::Printf(TEXT("persona %d resolves to a catalogue entry"), Persona),
            URiverAppearanceCatalogue::Find(Resolved.CatalogueId) != nullptr);
    }

    for (float Invalid : { std::numeric_limits<float>::quiet_NaN(),
        std::numeric_limits<float>::infinity(), -std::numeric_limits<float>::infinity() })
    {
        FRiverAppearanceRecipe NonFinite = URiverAppearanceCatalogue::Resolve(0);
        NonFinite.BodyMorphs.Add(TEXT("Stature"), Invalid);
        TestFalse(TEXT("range-only validator rejects non-finite stature"),
            FRiverRecipeValidator::Validate(NonFinite, Reason));
        TestFalse(TEXT("persona validator rejects non-finite stature"),
            FRiverRecipeValidator::Validate(NonFinite, 0, Reason));
    }

    // The four portrayals are locked to fixed generic profiles (section 9).
    TestEqual(TEXT("Ima Hogg resolves to woman-tailored"),
        URiverAppearanceCatalogue::ProfileForPersona(20), FName(TEXT("woman-tailored")));
    TestEqual(TEXT("Barbara Jordan resolves to woman-casual"),
        URiverAppearanceCatalogue::ProfileForPersona(21), FName(TEXT("woman-casual")));
    TestEqual(TEXT("Hakeem Olajuwon resolves to man-tailored"),
        URiverAppearanceCatalogue::ProfileForPersona(22), FName(TEXT("man-tailored")));
    TestEqual(TEXT("Beyonce resolves to woman-daywear"),
        URiverAppearanceCatalogue::ProfileForPersona(23), FName(TEXT("woman-daywear")));
    for (int32 Persona = 20; Persona <= 23; ++Persona)
        TestTrue(FString::Printf(TEXT("persona %d is a portrayal"), Persona),
            URiverAppearanceCatalogue::IsPortrayal(Persona));
    TestFalse(TEXT("an ordinary resident is not a portrayal"), URiverAppearanceCatalogue::IsPortrayal(19));

    // Every mutation is rejected for every persona -- portrayal or not -- and never reaches
    // CreateHuman. Personas 0, 3, 7 and 19 are ordinary residents; 20-23 are the portrayals.
    FCountingBackend Backend;
    const int32 TestPersonas[] = { 0, 3, 7, 19, 20, 21, 22, 23 };
    for (int32 Persona : TestPersonas)
    {
        const FRiverAppearanceRecipe Preset = URiverAppearanceCatalogue::Resolve(Persona);
        const FString Label = FString::Printf(TEXT("persona %d"), Persona);

        FRiverAppearanceRecipe OffAllowlist = Preset;
        OffAllowlist.BodyMorphs.Add(TEXT("NoseBridgeWidth"), 0.5f);
        TestFalse(Label + TEXT(": off-allowlist morph rejected"), CreateIfValid(Backend, OffAllowlist, Persona));

        FRiverAppearanceRecipe OutOfRange = Preset;
        OutOfRange.BodyMorphs.Add(TEXT("Stature"), 2.4f);
        TestFalse(Label + TEXT(": out-of-range stature rejected"), CreateIfValid(Backend, OutOfRange, Persona));

        // In range for this catalogue entry, so the allowlist and range checks both pass and only
        // the exactness rule can reject it. This is the case that regressed in review of PR #3.
        float Min = 0.f, Max = 0.f;
        TestTrue(Label + TEXT(": stature has a declared range"),
            URiverAppearanceCatalogue::MorphRange(TEXT("Stature"), Preset.CatalogueId, Min, Max));
        const float Resolved = Preset.BodyMorphs.FindChecked(TEXT("Stature"));
        const float Alternative = FMath::IsNearlyEqual(Resolved, Max, KINDA_SMALL_NUMBER) ? Min : Max;
        TestFalse(Label + TEXT(": the alternative stature differs from the resolved one"),
            FMath::IsNearlyEqual(Alternative, Resolved, KINDA_SMALL_NUMBER));
        FRiverAppearanceRecipe InRangeButAltered = Preset;
        InRangeButAltered.BodyMorphs.Add(TEXT("Stature"), Alternative);
        FString RangeReason;
        TestTrue(Label + TEXT(": the altered stature still passes the range-only check"),
            FRiverRecipeValidator::Validate(InRangeButAltered, RangeReason));
        TestFalse(Label + TEXT(": in-range deviation from the resolved recipe rejected"),
            CreateIfValid(Backend, InRangeButAltered, Persona));

        // A dropped morph is a deviation too, and the allowlist/range loop cannot see it at all.
        FRiverAppearanceRecipe NoStature = Preset;
        NoStature.BodyMorphs.Empty();
        FString EmptyReason;
        TestTrue(Label + TEXT(": a recipe with no morphs still passes the range-only check"),
            FRiverRecipeValidator::Validate(NoStature, EmptyReason));
        TestFalse(Label + TEXT(": missing stature rejected"), CreateIfValid(Backend, NoStature, Persona));

        FRiverAppearanceRecipe SwappedHair = Preset;
        SwappedHair.HairAsset = FName(*(Preset.HairAsset.ToString() + TEXT("-altered")));
        TestFalse(Label + TEXT(": altered hair rejected"), CreateIfValid(Backend, SwappedHair, Persona));

        FRiverAppearanceRecipe SwappedPreset = Preset;
        SwappedPreset.BodyPreset = FName(*(Preset.BodyPreset.ToString() + TEXT("-altered")));
        TestFalse(Label + TEXT(": altered body preset rejected"), CreateIfValid(Backend, SwappedPreset, Persona));

        FRiverAppearanceRecipe ExtraGarment = Preset;
        ExtraGarment.Garments.Add(TEXT("male_worksuit01"));
        TestFalse(Label + TEXT(": altered garments rejected"), CreateIfValid(Backend, ExtraGarment, Persona));

        // Another persona's recipe is internally consistent, and still is not this persona's.
        int32 Other = INDEX_NONE;
        for (int32 Candidate = 0; Candidate < 24; ++Candidate)
            if (URiverAppearanceCatalogue::ProfileForPersona(Candidate) != Preset.CatalogueId)
            { Other = Candidate; break; }
        TestTrue(Label + TEXT(": a persona with a different profile exists"), Other != INDEX_NONE);
        TestFalse(Label + TEXT(": another persona's recipe rejected"),
            CreateIfValid(Backend, URiverAppearanceCatalogue::Resolve(Other), Persona));

        FRiverAppearanceRecipe Unknown = Preset;
        Unknown.CatalogueId = TEXT("resident-07");
        TestFalse(Label + TEXT(": unknown catalogue id rejected"), CreateIfValid(Backend, Unknown, Persona));
    }
    TestEqual(TEXT("no rejected recipe reached CreateHuman"), Backend.Created, 0);

    // The guard still admits the legitimate recipe.
    TestTrue(TEXT("resolved portrayal recipe is created"),
        CreateIfValid(Backend, URiverAppearanceCatalogue::Resolve(20), 20));
    TestEqual(TEXT("exactly one human created"), Backend.Created, 1);
    return true;
}
#endif
