#include "Misc/AutomationTest.h"
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

    // Each mutation of a portrayal recipe is rejected, and never reaches CreateHuman.
    FCountingBackend Backend;
    for (int32 Persona = 20; Persona <= 23; ++Persona)
    {
        const FRiverAppearanceRecipe Preset = URiverAppearanceCatalogue::Resolve(Persona);

        FRiverAppearanceRecipe OffAllowlist = Preset;
        OffAllowlist.BodyMorphs.Add(TEXT("NoseBridgeWidth"), 0.5f);
        TestFalse(FString::Printf(TEXT("persona %d: off-allowlist morph rejected"), Persona),
            CreateIfValid(Backend, OffAllowlist, Persona));

        FRiverAppearanceRecipe OutOfRange = Preset;
        OutOfRange.BodyMorphs.Add(TEXT("Stature"), 2.4f);
        TestFalse(FString::Printf(TEXT("persona %d: out-of-range stature rejected"), Persona),
            CreateIfValid(Backend, OutOfRange, Persona));

        // Within the catalogue entry's declared range, so the range check passes -- but not this
        // portrayal's fixed value, so only the portrayal lock can reject it.
        FRiverAppearanceRecipe InRangeButAltered = Preset;
        const float Locked = Preset.BodyMorphs.FindChecked(TEXT("Stature"));
        float Min = 0.f, Max = 0.f;
        TestTrue(TEXT("stature has a declared range"),
            URiverAppearanceCatalogue::MorphRange(TEXT("Stature"), Preset.CatalogueId, Min, Max));
        const float Alternative = FMath::IsNearlyEqual(Locked, Max, KINDA_SMALL_NUMBER) ? Min : Max;
        TestFalse(TEXT("the alternative stature really differs from the locked one"),
            FMath::IsNearlyEqual(Alternative, Locked, KINDA_SMALL_NUMBER));
        InRangeButAltered.BodyMorphs.Add(TEXT("Stature"), Alternative);
        FString RangeReason;
        TestTrue(TEXT("the altered stature still passes the range-only check"),
            FRiverRecipeValidator::Validate(InRangeButAltered, RangeReason));
        TestFalse(FString::Printf(TEXT("persona %d: in-range deviation from the locked preset rejected"), Persona),
            CreateIfValid(Backend, InRangeButAltered, Persona));

        FRiverAppearanceRecipe SwappedHair = Preset;
        SwappedHair.HairAsset = TEXT("short01");
        TestFalse(FString::Printf(TEXT("persona %d: altered hair rejected"), Persona),
            CreateIfValid(Backend, SwappedHair, Persona));

        FRiverAppearanceRecipe SwappedPreset = Preset;
        SwappedPreset.BodyPreset = TEXT("young_asian_female");
        TestFalse(FString::Printf(TEXT("persona %d: altered body preset rejected"), Persona),
            CreateIfValid(Backend, SwappedPreset, Persona));

        FRiverAppearanceRecipe SwappedGarments = Preset;
        SwappedGarments.Garments = { TEXT("male_worksuit01") };
        TestFalse(FString::Printf(TEXT("persona %d: altered garments rejected"), Persona),
            CreateIfValid(Backend, SwappedGarments, Persona));

        // A different catalogue entry, internally consistent, still is not this persona's.
        FRiverAppearanceRecipe WrongEntry = URiverAppearanceCatalogue::Resolve(Persona == 22 ? 21 : 22);
        TestFalse(FString::Printf(TEXT("persona %d: another persona's recipe rejected"), Persona),
            CreateIfValid(Backend, WrongEntry, Persona));

        FRiverAppearanceRecipe Unknown = Preset;
        Unknown.CatalogueId = TEXT("resident-07");
        TestFalse(FString::Printf(TEXT("persona %d: unknown catalogue id rejected"), Persona),
            CreateIfValid(Backend, Unknown, Persona));
    }
    TestEqual(TEXT("no rejected recipe reached CreateHuman"), Backend.Created, 0);

    // The guard still admits the legitimate recipe.
    TestTrue(TEXT("resolved portrayal recipe is created"),
        CreateIfValid(Backend, URiverAppearanceCatalogue::Resolve(20), 20));
    TestEqual(TEXT("exactly one human created"), Backend.Created, 1);
    return true;
}
#endif
