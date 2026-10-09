# Python bridge and data pipeline

The Python package owns acquisition, exports, verification and bounded local/remote
inference and speech. Read `docs/data.md` and the relevant bridge/feature doc.

- Keep meter coordinates in EPSG:32615 and explicit Unreal east/south/up centimeter
  conversion. Preserve origin, source provenance and independent-reference gates.
- Synthetic demo data never proves observed-world accuracy. Verification exit 1
  means failed, 2 blocked, and 0 complete acceptance; do not collapse these meanings.
- Preserve timeouts, concurrency/batch bounds, cancellation and stale-response
  fences. Local physics/schedule constraints remain authoritative over inference.
- Tests use synthetic geometry and mocked transports. Do not call paid providers,
  acquire live GIS, or fetch optional speech weights during unit verification.
- From root run `pnpm run verify python` or a focused `uv run --locked pytest`
  command while iterating. Python tests live in `tests/` at the repository root.

See root AGENTS.md and `docs/testing.md`.
