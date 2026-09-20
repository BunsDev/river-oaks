import json

from river_oaks.cli import main


def test_demo_build_and_verify_return_blocked_exit_code(tmp_path):
    assert main(["demo", "--output", str(tmp_path)]) == 0
    world = tmp_path / "world.json"
    assert world.exists()
    value = json.loads(world.read_text())
    assert value["data_mode"] == "synthetic_fixture"
    assert (
        main(
            [
                "verify",
                "--config",
                str(tmp_path / "config.json"),
                "--raw",
                str(tmp_path),
                "--world",
                str(world),
                "--output",
                str(tmp_path / "report.json"),
            ]
        )
        == 2
    )
    assert json.loads((tmp_path / "report.json").read_text())["status"] == "blocked"
