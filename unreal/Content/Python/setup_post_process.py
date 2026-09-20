"""Create/update the River Oaks global SSAO volume in the currently open level."""

import unreal

LABEL = "River Oaks Global Post Process"


def configure_global_post_process():
    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
    matches = [
        actor
        for actor in actors.get_all_level_actors()
        if isinstance(actor, unreal.PostProcessVolume) and actor.get_actor_label() == LABEL
    ]
    if len(matches) > 1:
        raise RuntimeError(f"Multiple {LABEL} volumes; keep one before running setup.")
    volume = (
        matches[0]
        if matches
        else actors.spawn_actor_from_class(unreal.PostProcessVolume, unreal.Vector(0, 0, 0))
    )
    if volume is None:
        raise RuntimeError("Could not create the global Post Process Volume.")
    volume.set_actor_label(LABEL)
    volume.set_editor_property("unbound", True)
    volume.set_editor_property("enabled", True)
    volume.set_editor_property("blend_weight", 1.0)
    settings = volume.get_editor_property("settings")
    for name, value in (
        ("ambient_occlusion_intensity", 0.6),
        ("ambient_occlusion_radius", 100.0),
        ("ambient_occlusion_quality", 100.0),
    ):
        settings.set_editor_property(f"override_{name}", True)
        settings.set_editor_property(name, value)
    volume.set_editor_property("settings", settings)
    return volume


if __name__ == "__main__":
    configure_global_post_process()
    unreal.log("Global SSAO volume configured. Inspect the current level, then save it.")
