#pragma once
#include "CoreMinimal.h"
#include "RiverOaksHumans.h"
#include "UObject/Object.h"
#include "RiverAppearanceCatalogue.generated.h"

// River Oaks-owned appearance catalogue. See docs/astra-integration.md sections 5.2 and 9.
//
// The six entries mirror preview/public/assets/characters/sources.json, and the persona ->
// profile mapping mirrors avatarProfile() in preview/src/avatars.js. That is deliberate: the
// browser showcase and the Unreal host must resolve the same generic appearance for the same
// persona, or the likeness guarantee holds in one renderer and not the other. The parity is
// machine-checked by tests/test_appearance_catalogue.py, which runs in CI.
//
// Every asset is CC0 and generic. No entry is a scan, photograph, measurement, or likeness of
// any real person, including the four personas that portray public figures.
struct FRiverCatalogueEntry
{
    FName CatalogueId;          // sources.json "id"
    FName BodyPreset;           // sources.json "skin"
    FName HairAsset;            // sources.json "hair"
    TArray<FName> Garments;     // sources.json "outfit", then "shoes"
    float StatureBase = 0.f;    // metres; the shortest of the permitted stature steps
};

UCLASS()
class RIVEROAKS_API URiverAppearanceCatalogue : public UObject
{
    GENERATED_BODY()
public:
    // Stature is the only variation channel, and it mirrors the browser's
    // targetHeight = base + (index % 3) * 0.025 in preview/src/avatars.js.
    static constexpr float StatureStep = 0.025f;
    static constexpr int32 StatureSteps = 3;

    // Persona indices 20-23 are the four fictional portrayals (Ima Hogg, Barbara Jordan,
    // Hakeem Olajuwon, Beyonce). They resolve to fixed generic profiles and are locked.
    static constexpr int32 FirstPortrayalIndex = 20;
    static constexpr int32 NumPortrayals = 4;

    static int32 NumProfiles();
    static const FRiverCatalogueEntry* Entry(int32 Ordinal);
    static const FRiverCatalogueEntry* Find(FName CatalogueId);

    static bool IsPortrayal(int32 PersonaIndex);
    // The catalogue id a persona resolves to. Never authored by a caller.
    static FName ProfileForPersona(int32 PersonaIndex);

    // The only way to obtain a recipe. Returns an empty recipe when PersonaIndex is negative.
    static FRiverAppearanceRecipe Resolve(int32 PersonaIndex);

    // Morph allowlist. A channel absent from this list can never reach a backend.
    static bool IsAllowedMorph(FName Channel);
    static bool MorphRange(FName Channel, FName CatalogueId, float& OutMin, float& OutMax);
};

// Rejects any recipe that was not resolved from the catalogue, or that was resolved and then
// altered. There is no bypass flag: ARiverOaksWorld is the only caller of CreateHuman and it
// validates first, falling back to the marker backend on rejection.
struct RIVEROAKS_API FRiverRecipeValidator
{
    // Catalogue membership, field parity with the catalogue entry, morph allowlist, morph range.
    static bool Validate(const FRiverAppearanceRecipe& Recipe, FString& OutReason);
    // The above, plus exactness: the recipe must equal Resolve(PersonaIndex) in every field,
    // stature included, for every persona. An in-range but altered value is still rejected, so a
    // backend can only ever receive a recipe the catalogue resolved. This pins the four
    // portrayals to their fixed generic preset (section 9) as a special case of the same rule.
    static bool Validate(const FRiverAppearanceRecipe& Recipe, int32 PersonaIndex, FString& OutReason);
};
