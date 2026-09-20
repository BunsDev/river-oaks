"""The animation states must cover every locomotion name the simulation can produce.

``RiverOaksRules::Locomotion`` is the only producer of locomotion names and
``URiverLocomotionAnimInstance::StateFor`` is the only consumer. If a name is added to one and
not the other, the skeletal backend silently animates an agent as Idle. ``RiverOaks.Contracts.
SkeletalLocomotion`` asserts this too, but it needs an engine to run; this test does not.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RULES = ROOT / "unreal/Source/RiverOaks/Public/RiverOaksRules.h"
ANIM = ROOT / "unreal/Source/RiverOaks/Private/RiverLocomotionAnimInstance.cpp"
CONTRACT = ROOT / "unreal/Source/RiverOaks/Public/RiverOaksHumans.h"


def produced_names():
    """Names returned by RiverOaksRules::Locomotion, which wraps each in FName(TEXT(...))."""
    source = RULES.read_text()
    start = source.index("inline FName Locomotion(")
    body = source[start : source.index("\n    }", start)]
    names = set(re.findall(r'FName\(TEXT\("([^"]+)"\)\)', body))
    assert names, "no locomotion names parsed from the rules"
    return names


def handled_names():
    """Names compared in URiverLocomotionAnimInstance::StateFor."""
    source = ANIM.read_text()
    start = source.index("ERiverLocomotionState URiverLocomotionAnimInstance::StateFor")
    body = source[start : source.index("\n}", start)]
    names = set(re.findall(r'InLocomotion == TEXT\("([^"]+)"\)', body))
    assert names, "no locomotion names parsed from the animation mapping"
    return names


def documented_names():
    """The vocabulary the FRiverHumanPose contract advertises to backend authors."""
    line = next(line for line in CONTRACT.read_text().splitlines() if "FName Locomotion;" in line)
    return {name.strip() for name in line.split("//", 1)[1].split("|")}


def test_every_produced_name_has_an_animation_state():
    missing = produced_names() - handled_names()
    assert not missing, f"locomotion names with no animation state: {sorted(missing)}"


def test_no_animation_state_without_a_producer():
    orphans = handled_names() - produced_names()
    assert not orphans, f"animation states no rule can produce: {sorted(orphans)}"


def test_contract_comment_matches_the_rules():
    assert documented_names() == produced_names()


def test_states_enum_covers_every_name():
    header = (ROOT / "unreal/Source/RiverOaks/Public/RiverLocomotionAnimInstance.h").read_text()
    block = header[header.index("enum class ERiverLocomotionState") : header.index("};")]
    entries = re.findall(r"^\s{4}(\w+)\s+UMETA", block, re.MULTILINE)
    assert len(entries) == len(produced_names()), f"enum entries {entries} vs {produced_names()}"
