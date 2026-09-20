"""Exercise editor setup orchestration without pretending to render Unreal frames."""

import runpy
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPT = Path(__file__).parents[1] / "unreal/Content/Python/setup_post_process.py"


class Volume:
    def __init__(self, label="Artist volume"):
        self.label = label
        self.properties = {"settings": Settings()}

    def get_actor_label(self):
        return self.label

    def set_actor_label(self, label):
        self.label = label

    def get_editor_property(self, key):
        return self.properties[key]

    def set_editor_property(self, key, value):
        self.properties[key] = value


class Settings:
    def __init__(self):
        self.properties = {"bloom_intensity": 0.25}

    def set_editor_property(self, key, value):
        self.properties[key] = value


@pytest.fixture
def editor(monkeypatch):
    volumes = [Volume()]
    subsystem = SimpleNamespace(
        get_all_level_actors=lambda: volumes,
        spawn_actor_from_class=lambda cls, position: spawn(cls),
    )

    def spawn(cls):
        volume = cls()
        volumes.append(volume)
        return volume

    unreal = SimpleNamespace(
        PostProcessVolume=Volume,
        EditorActorSubsystem=object(),
        Vector=lambda *args: args,
        get_editor_subsystem=lambda cls: subsystem,
    )
    monkeypatch.setitem(sys.modules, "unreal", unreal)
    return volumes, subsystem


def test_setup_is_global_and_repeatable_without_touching_artist_volume(editor):
    assert SCRIPT.exists(), "global post-process setup script is missing"
    setup = runpy.run_path(str(SCRIPT))["configure_global_post_process"]
    volumes, _ = editor
    first = setup()
    assert setup() is first
    assert len(volumes) == 2
    assert volumes[0].properties == {"settings": volumes[0].properties["settings"]}
    assert first.properties["unbound"] is True
    assert first.properties["enabled"] is True
    assert first.properties["blend_weight"] == 1.0
    settings = first.properties["settings"].properties
    assert settings["bloom_intensity"] == 0.25
    assert settings["override_ambient_occlusion_intensity"] is True
    assert 0 < settings["ambient_occlusion_intensity"] <= 1
    assert settings["override_ambient_occlusion_radius"] is True
    assert settings["ambient_occlusion_radius"] > 0
    assert settings["override_ambient_occlusion_quality"] is True
    assert settings["ambient_occlusion_quality"] > 0


def test_spawn_failure_is_explicit(editor):
    assert SCRIPT.exists(), "global post-process setup script is missing"
    _, subsystem = editor
    subsystem.spawn_actor_from_class = lambda *args: None
    setup = runpy.run_path(str(SCRIPT))["configure_global_post_process"]
    with pytest.raises(RuntimeError, match="Post Process Volume"):
        setup()


def test_duplicate_named_volumes_fail_without_modifying_level(editor):
    module = runpy.run_path(str(SCRIPT))
    volumes, _ = editor
    volumes.extend([Volume(module["LABEL"]), Volume(module["LABEL"])])
    with pytest.raises(RuntimeError, match="Multiple"):
        module["configure_global_post_process"]()
    assert len(volumes) == 3
    assert all("unbound" not in volume.properties for volume in volumes)
