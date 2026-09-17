"""Exercise the actual commit guard against isolated Git indexes; never create real secrets."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def repo(tmp_path):
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True)
    return tmp_path


def stage(repo, name, text):
    path = repo / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    subprocess.run(["git", "-C", str(repo), "add", "-f", "--", name], check=True)


def check(repo, env=None):
    import sys

    return subprocess.run(
        [sys.executable, str(ROOT / "scripts/check_secrets.py"), "--staged"],
        cwd=repo,
        capture_output=True,
        text=True,
        env=env,
    )


def test_force_added_env_file_is_blocked_even_without_secret_pattern(repo):
    stage(repo, ".env.production", "VALUE=small\n")
    result = check(repo)
    assert result.returncode != 0
    assert "credential file" in result.stderr


def test_staged_secret_is_blocked_even_when_working_copy_is_clean(repo):
    if not shutil.which("gitleaks"):
        pytest.skip("Install gitleaks to exercise the real scanner")
    fake = "ghp_" + "Ab3Cd4Ef5Gh6Ij7Kl8Mn9Op0Qr1St2Uv3Wx4"
    stage(repo, "config.txt", "token=" + fake)
    (repo / "config.txt").write_text("clean unstaged replacement")
    result = check(repo)
    assert result.returncode != 0
    assert fake not in result.stdout + result.stderr


def test_typesafe_key_in_arbitrary_config_is_blocked(repo):
    if not shutil.which("gitleaks"):
        pytest.skip("Install gitleaks to exercise the real scanner")
    stage(repo, "settings.ini", "TYPESAFE_API_KEY=" + "Z9y8" * 9)
    assert check(repo).returncode != 0


def test_clean_placeholder_passes(repo):
    if not shutil.which("gitleaks"):
        pytest.skip("Install gitleaks to exercise the real scanner")
    stage(repo, ".env.example", "TYPESAFE_API_KEY=\nJEV_MODEL=jev-1.13.0\n")
    assert check(repo).returncode == 0


def test_missing_scanner_fails_closed(repo, tmp_path):
    stage(repo, "safe.txt", "safe")
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    (bin_dir / "git").symlink_to(shutil.which("git"))
    result = check(repo, {**os.environ, "PATH": str(bin_dir)})
    assert result.returncode != 0
    assert "Install gitleaks" in result.stderr


def test_actual_git_hook_prevents_commit(repo):
    if not shutil.which("gitleaks"):
        pytest.skip("Install gitleaks to exercise the real scanner")
    for name in (".gitleaks.toml", ".githooks/pre-commit", "scripts/check_secrets.py"):
        target = repo / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, target)
    (repo / ".githooks/pre-commit").chmod(0o755)
    subprocess.run(["git", "-C", str(repo), "config", "core.hooksPath", ".githooks"], check=True)
    stage(repo, "settings.txt", "TYPESAFE_API_KEY=" + "K8a2" * 10)
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repo),
            "-c",
            "user.name=Test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-m",
            "This synthetic-secret commit must be rejected",
        ],
        capture_output=True,
        text=True,
    )
    assert result.returncode != 0
    assert "leaks found" in result.stderr
    assert (
        subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "--verify", "HEAD"], capture_output=True
        ).returncode
        != 0
    )
