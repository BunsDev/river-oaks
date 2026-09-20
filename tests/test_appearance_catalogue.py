"""The Unreal appearance catalogue must agree with the browser showcase.

docs/astra-integration.md section 9 requires the Unreal catalogue to preserve the persona ->
generic-profile mapping that ``preview/src/avatars.js`` already implements, "not reopen it".
The Unreal contract test that covers this cannot run here -- the module has no engine to compile
against -- so this test enforces the same parity against the C++ source text, and it does run.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOGUE = ROOT / "unreal/Source/RiverOaks/Private/RiverAppearanceCatalogue.cpp"
AVATARS = ROOT / "preview/src/avatars.js"
MANIFEST = ROOT / "preview/public/assets/characters/sources.json"

# Mirrors preview/src/avatars.js: targetHeight = base + (index % 3) * 0.025.
STATURE_BASE = {"woman": 1.66, "man": 1.78}
STATURE_STEP = 0.025
STATURE_STEPS = 3

ENTRY = re.compile(
    r'\{\s*TEXT\("(?P<id>[^"]+)"\),\s*TEXT\("(?P<skin>[^"]+)"\),\s*TEXT\("(?P<hair>[^"]+)"\),'
    r'\s*\{\s*TEXT\("(?P<outfit>[^"]+)"\),\s*TEXT\("(?P<shoes>[^"]+)"\)\s*\},'
    r"\s*(?P<stature>[0-9.]+)f\s*\},"
)


def ue_entries():
    found = list(ENTRY.finditer(CATALOGUE.read_text()))
    assert found, "no catalogue entries parsed from the Unreal source"
    return [match.groupdict() for match in found]


def ue_portrayals():
    source = CATALOGUE.read_text()
    return {
        int(index): name
        for index, name in re.findall(r'case (\d+): return TEXT\("([^"]+)"\);', source)
    }


def js_profiles():
    text = AVATARS.read_text()
    listing = re.search(r"AVATAR_PROFILES\s*=\s*\[([^\]]+)\]", text).group(1)
    return [item.strip().strip("'\"") for item in listing.split(",")]


def js_portrayals():
    text = AVATARS.read_text()
    mapping = re.search(r"\(\{([^}]*)\}\)\[index\]", text).group(1)
    return {int(index): name for index, name in re.findall(r"(\d+)\s*:\s*'([^']+)'", mapping)}


def manifest_entries():
    return {item["id"]: item for item in json.loads(MANIFEST.read_text())["files"]}


def test_catalogue_ids_match_the_shipped_assets():
    manifest = manifest_entries()
    assert [entry["id"] for entry in ue_entries()] == js_profiles()
    assert {entry["id"] for entry in ue_entries()} == set(manifest)


def test_catalogue_ingredients_match_the_asset_manifest():
    manifest = manifest_entries()
    for entry in ue_entries():
        source = manifest[entry["id"]]
        assert entry["skin"] == source["skin"], entry["id"]
        assert entry["hair"] == source["hair"], entry["id"]
        assert entry["outfit"] == source["outfit"], entry["id"]
        assert entry["shoes"] == source["shoes"], entry["id"]
        assert source["license"] == "CC0-1.0", entry["id"]


def test_portrayal_mapping_is_preserved_not_reopened():
    assert ue_portrayals() == js_portrayals()
    assert sorted(ue_portrayals()) == [20, 21, 22, 23]


def test_every_persona_resolves_to_a_shipped_profile():
    profiles, portrayals, manifest = js_profiles(), ue_portrayals(), manifest_entries()
    for index in range(24):
        resolved = portrayals.get(index, profiles[index % len(profiles)])
        assert resolved in manifest, index


def test_stature_bases_match_the_browser_heights():
    for entry in ue_entries():
        expected = STATURE_BASE["woman" if entry["id"].startswith("woman") else "man"]
        assert float(entry["stature"]) == expected, entry["id"]


def test_stature_constants_match_the_browser():
    header = (ROOT / "unreal/Source/RiverOaks/Public/RiverAppearanceCatalogue.h").read_text()
    step = re.search(r"StatureStep = ([0-9.]+)f", header).group(1)
    steps = re.search(r"StatureSteps = (\d+)", header).group(1)
    assert float(step) == STATURE_STEP
    assert int(steps) == STATURE_STEPS
    assert f"{STATURE_STEP}" in AVATARS.read_text()


def test_discovery_gate_is_enabled_only_alongside_the_validator():
    humans = (ROOT / "unreal/Source/RiverOaks/Public/RiverOaksHumans.h").read_text()
    enabled = "bRiverHumanBackendDiscoveryEnabled = true" in humans
    world = (ROOT / "unreal/Source/RiverOaks/Private/RiverOaksWorld.cpp").read_text()
    if enabled:
        assert "FRiverRecipeValidator::Validate" in world
        assert "URiverAppearanceCatalogue::Resolve" in world


def test_persona_scoped_validation_has_no_non_portrayal_shortcut():
    """Regression guard for the review finding on PR #3.

    The persona-scoped overload must compare against ``Resolve(PersonaIndex)`` for every persona.
    An early ``return true`` for non-portrayals let an in-range but altered stature through, and
    a dropped stature with it. ``RiverOaks.Contracts.PortrayalRecipe`` covers the behaviour but
    cannot run without an engine, so this checks the shape of the function that must enforce it.
    """
    source = CATALOGUE.read_text()
    signature = "int32 PersonaIndex, FString& OutReason)"
    assert signature in source, "persona-scoped validator not found"
    body = source[source.index(signature) :]
    assert "Resolve(PersonaIndex)" in body
    assert not re.search(r"IsPortrayal\(PersonaIndex\)\)\s*return true", body), (
        "persona-scoped validation must not short-circuit for non-portrayal personas"
    )
