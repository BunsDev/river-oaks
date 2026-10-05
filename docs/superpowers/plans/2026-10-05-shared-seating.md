# Shared seating

Progress toward the comprehensive virtual-world goal: turn placed furniture into
shared social interactions, preserving Jevica-only building and wishes.

- [x] Inspect current main, active worktrees, furniture geometry and motion.
- [x] Add failing server tests for reach, occupancy, stand, persistence and abuse.
- [x] Implement server-assigned slots: two on a garden seat, one on a lounge chair.
- [x] Preserve private-home access, safe exits, immutable occupied furniture,
  checkpoint recovery, disconnect cleanup and compatible region updates.
- [x] Render confirmed seated state locally/remotely, including rig-specific leg and foot placement.
- [x] Add accessible nearby-seat/stand controls for keyboard and mobile.
- [x] Verify real two-browser interaction, seated rendering, correctness/build,
  Redis authority and secret gates before committing.
- [ ] Ship verified PR/main/deployment and clean up the owned worktree.

This milestone does not finish the entire Second Life goal. Custom assets,
spatial voice, broader world interactions and hosted global/device acceptance
remain separate unfinished requirements. Existing built-in shop/park furniture
is not part of the placed-creation protocol and remains a future interaction seam.

Red/green evidence: seat intents initially returned invalid_command; remote seating
initially sent riding=false; rig knees initially straightened to 56 degrees;
sloping terrain exposed a furniture/ground mismatch; old checkpoint format did
not fence legacy coordinators. Focused tests now cover each corrected contract.

Checkpoint v3 upgrade also updates the account appearance bootstrap reader;
existing cross-world gateway tests caught its old version-2 allowlist.

Integrated base c80fc3f (resident usernames): preview 677/677, Redis server
289/289, desktop 8/8, build and the full-render seating journey passed.
Receipt: data/reports/shared-seating.json. Reflections and secret scans passed.
Hosted gates, production deployment and owned-worktree retirement are pending.

Rolling-coordinator probe used actual c80fc3f world/Redis code: upgraded the
active older lease, replayed a queued operation, fenced a delayed old commit and
kept the two-player roster and seat. Lease tests also retain same/newer writers.
