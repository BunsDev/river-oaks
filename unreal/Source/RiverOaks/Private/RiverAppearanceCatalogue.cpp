#include "RiverAppearanceCatalogue.h"

namespace
{
    // Mirrors preview/public/assets/characters/sources.json, in the AVATAR_PROFILES order used
    // by preview/src/avatars.js. tests/test_appearance_catalogue.py enforces the parity.
    const TArray<FRiverCatalogueEntry>& Entries()
    {
        static const TArray<FRiverCatalogueEntry> Table = {
            { TEXT("woman-casual"),   TEXT("young_african_female"),      TEXT("bob01"),      { TEXT("female_casualsuit01"), TEXT("shoes02") }, 1.66f },
            { TEXT("man-casual"),     TEXT("young_caucasian_male"),      TEXT("short01"),    { TEXT("male_casualsuit02"),   TEXT("shoes01") }, 1.78f },
            { TEXT("woman-tailored"), TEXT("middleage_caucasian_female"),TEXT("bob02"),      { TEXT("female_elegantsuit01"),TEXT("shoes02") }, 1.66f },
            { TEXT("man-tailored"),   TEXT("middleage_african_male"),    TEXT("short04"),    { TEXT("male_elegantsuit01"),  TEXT("shoes03") }, 1.78f },
            { TEXT("woman-daywear"),  TEXT("young_asian_female"),        TEXT("ponytail01"), { TEXT("female_casualsuit02"), TEXT("shoes01") }, 1.66f },
            { TEXT("man-workwear"),   TEXT("middleage_asian_male"),      TEXT("short02"),    { TEXT("male_worksuit01"),     TEXT("shoes04") }, 1.78f },
        };
        return Table;
    }

    // Mirrors the portrayal branch of avatarProfile() in preview/src/avatars.js.
    FName PortrayalProfile(int32 PersonaIndex)
    {
        switch (PersonaIndex)
        {
        case 20: return TEXT("woman-tailored");  // Ima Hogg
        case 21: return TEXT("woman-casual");    // Barbara Jordan
        case 22: return TEXT("man-tailored");    // Hakeem Olajuwon
        case 23: return TEXT("woman-daywear");   // Beyonce
        default: return NAME_None;
        }
    }

    const FName StatureChannel(TEXT("Stature"));

    bool SameMorphs(const TMap<FName, float>& A, const TMap<FName, float>& B)
    {
        if (A.Num() != B.Num()) return false;
        for (const TPair<FName, float>& Pair : A)
        {
            const float* Other = B.Find(Pair.Key);
            if (!Other || !FMath::IsNearlyEqual(*Other, Pair.Value, KINDA_SMALL_NUMBER)) return false;
        }
        return true;
    }
}

int32 URiverAppearanceCatalogue::NumProfiles() { return Entries().Num(); }

const FRiverCatalogueEntry* URiverAppearanceCatalogue::Entry(int32 Ordinal)
{
    return Entries().IsValidIndex(Ordinal) ? &Entries()[Ordinal] : nullptr;
}

const FRiverCatalogueEntry* URiverAppearanceCatalogue::Find(FName CatalogueId)
{
    for (const FRiverCatalogueEntry& Candidate : Entries())
        if (Candidate.CatalogueId == CatalogueId) return &Candidate;
    return nullptr;
}

bool URiverAppearanceCatalogue::IsPortrayal(int32 PersonaIndex)
{
    return PersonaIndex >= FirstPortrayalIndex && PersonaIndex < FirstPortrayalIndex + NumPortrayals;
}

FName URiverAppearanceCatalogue::ProfileForPersona(int32 PersonaIndex)
{
    if (PersonaIndex < 0) return NAME_None;
    const FName Portrayal = PortrayalProfile(PersonaIndex);
    if (!Portrayal.IsNone()) return Portrayal;
    return Entries()[PersonaIndex % Entries().Num()].CatalogueId;
}

FRiverAppearanceRecipe URiverAppearanceCatalogue::Resolve(int32 PersonaIndex)
{
    FRiverAppearanceRecipe Recipe;
    if (PersonaIndex < 0) return Recipe;
    const FRiverCatalogueEntry* Found = Find(ProfileForPersona(PersonaIndex));
    if (!Found) return Recipe;
    Recipe.CatalogueId = Found->CatalogueId;
    Recipe.BodyPreset = Found->BodyPreset;
    Recipe.HairAsset = Found->HairAsset;
    Recipe.Garments = Found->Garments;
    Recipe.BodyMorphs.Add(StatureChannel, Found->StatureBase + (PersonaIndex % StatureSteps) * StatureStep);
    return Recipe;
}

bool URiverAppearanceCatalogue::IsAllowedMorph(FName Channel)
{
    return Channel == StatureChannel;
}

bool URiverAppearanceCatalogue::MorphRange(FName Channel, FName CatalogueId, float& OutMin, float& OutMax)
{
    if (!IsAllowedMorph(Channel)) return false;
    const FRiverCatalogueEntry* Found = Find(CatalogueId);
    if (!Found) return false;
    OutMin = Found->StatureBase;
    OutMax = Found->StatureBase + (StatureSteps - 1) * StatureStep;
    return true;
}

bool FRiverRecipeValidator::Validate(const FRiverAppearanceRecipe& Recipe, FString& OutReason)
{
    const FRiverCatalogueEntry* Found = URiverAppearanceCatalogue::Find(Recipe.CatalogueId);
    if (!Found)
    {
        OutReason = FString::Printf(TEXT("unknown catalogue id '%s'"), *Recipe.CatalogueId.ToString());
        return false;
    }
    if (Recipe.BodyPreset != Found->BodyPreset)
    {
        OutReason = FString::Printf(TEXT("body preset '%s' deviates from catalogue preset '%s'"),
            *Recipe.BodyPreset.ToString(), *Found->BodyPreset.ToString());
        return false;
    }
    if (Recipe.HairAsset != Found->HairAsset)
    {
        OutReason = FString::Printf(TEXT("hair asset '%s' deviates from catalogue preset '%s'"),
            *Recipe.HairAsset.ToString(), *Found->HairAsset.ToString());
        return false;
    }
    if (Recipe.Garments != Found->Garments)
    {
        OutReason = TEXT("garments deviate from the catalogue preset");
        return false;
    }
    for (const TPair<FName, float>& Morph : Recipe.BodyMorphs)
    {
        if (!URiverAppearanceCatalogue::IsAllowedMorph(Morph.Key))
        {
            OutReason = FString::Printf(TEXT("morph channel '%s' is not on the allowlist"), *Morph.Key.ToString());
            return false;
        }
        float Min = 0.f, Max = 0.f;
        if (!URiverAppearanceCatalogue::MorphRange(Morph.Key, Recipe.CatalogueId, Min, Max))
        {
            OutReason = FString::Printf(TEXT("morph channel '%s' has no declared range"), *Morph.Key.ToString());
            return false;
        }
        if (!FMath::IsFinite(Morph.Value) || Morph.Value < Min - KINDA_SMALL_NUMBER
            || Morph.Value > Max + KINDA_SMALL_NUMBER)
        {
            OutReason = FString::Printf(TEXT("morph '%s' value %f is outside the preset range [%f, %f]"),
                *Morph.Key.ToString(), Morph.Value, Min, Max);
            return false;
        }
    }
    return true;
}

bool FRiverRecipeValidator::Validate(const FRiverAppearanceRecipe& Recipe, int32 PersonaIndex, FString& OutReason)
{
    if (!Validate(Recipe, OutReason)) return false;
    const FRiverAppearanceRecipe Resolved = URiverAppearanceCatalogue::Resolve(PersonaIndex);
    if (Recipe.CatalogueId != Resolved.CatalogueId)
    {
        OutReason = FString::Printf(TEXT("persona %d resolves to '%s', not '%s'"),
            PersonaIndex, *Resolved.CatalogueId.ToString(), *Recipe.CatalogueId.ToString());
        return false;
    }
    // Exact for every persona, not only the portrayals. The host hands a backend nothing but the
    // recipe the catalogue resolved, so an altered or missing value is rejected even when it sits
    // inside the allowlist and range -- those bound the recipe-shaped input the two-argument form
    // accepts; this form admits one recipe per persona. The four portrayals are the case where it
    // matters most (section 9), but a uniform rule is the one that stays true.
    if (Recipe.BodyPreset != Resolved.BodyPreset || Recipe.HairAsset != Resolved.HairAsset
        || Recipe.Garments != Resolved.Garments || !SameMorphs(Recipe.BodyMorphs, Resolved.BodyMorphs))
    {
        OutReason = URiverAppearanceCatalogue::IsPortrayal(PersonaIndex)
            ? FString::Printf(TEXT("portrayal persona %d deviates from its fixed generic preset"), PersonaIndex)
            : FString::Printf(TEXT("persona %d deviates from its resolved catalogue recipe"), PersonaIndex);
        return false;
    }
    return true;
}
