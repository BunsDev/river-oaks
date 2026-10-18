"""The Jev model the bridge's engines pin (TypeSafe: https://docs.typesafe.ai/models).

jev-1.14.0 is TypeSafe's newest release (14 October 2026, the target of `jev-preview`);
the stable alias `jev-latest` still names jev-1.13.0. River Oaks pins an exact version,
never an alias, so every reply is checked against it and evaluation evidence names the
model it measured. JEV_MODEL (residents) and JEV_AUTO_MODEL (auto visits, the companion
and the chauffeur) override it per process.
"""

JEV_MODEL = "jev-1.14.0"
