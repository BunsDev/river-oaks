# Resident navigation around creator assemblies

Objective: continue the comprehensive Second Life-style world. The creator
milestone shipped editable assemblies, but NPC routes still use static geography.
Close that physical-world gap before adding more content types.

## Requirements and execution ledger

- [x] Inspect live main, open PRs, worktree ownership, authority and planner seams.
- [x] Isolate work from the dirty commands/clear-view checkout.
- [x] Verify baseline: 38 resident-life and creator-authority tests passed.
- [x] Write failing tests for routing, cached paths after edits/removal, overhead
  clearance, authoritative walking, placement on NPCs, and recovered routes.
- [x] Share confirmed custom colliders with server resident navigation.
- [x] Invalidate affected navigation caches on placement, geometry edits, removal,
  reset and recovery. Preserve the bounded route-search slot and existing routes'
  destinations; blocked routes must recover through the current planner.
- [x] Reject custom placement/editing that intersects a resident's physical body.
- [x] Verify navigation, resident life, volunteer visits, creator authority, Redis
  recovery and the existing multiplayer journeys.
- [x] Measure navigation with maximum allowed assemblies and document evidence
  without claiming GPU, physical-device or global readiness.
- [ ] Complete local verification, independent review and hosted gates before
  commit/push/merge delivery.

Keep 98 shared NPCs, 193 solo NPCs, the 32-player cap, and Jevica-only creation
and wishes. Voice remains deferred. No paid services or real-money flows.
Imported assets, creator behavior, richer inventory/commerce and land, and
hosted global/device acceptance remain requirements of the broader goal.


## Recovery and performance review

Tests-first failures reproduced ordinary walk-through, placement enclosure,
flight landing enclosure, occupied legacy starts, recovery into a road, and a
thin corner missed by a cached dynamic edge. Repairs now use the grounded-to-
lifted column, bounded legacy-only recovery, resident navigation/site policy,
and the same endpoint clearance probes on dynamic links. Repaired volunteer
approaches are requeued without spending another visit.

The first maximum-assembly diagnostic exposed a 2.27-second long cold district
search. Nearby-object indexing and separate static/dynamic caches address the
additional collision work. The final recorded maximum-assembly long district
search p95 is 364.53 ms, with a 60.62 ms warm p95. These busy-host local CPU
samples do not establish controlled improvement, shared tick latency, GPU,
physical-device, or global readiness. Long authority route work remains an
explicit performance follow-up in the multiplayer audit.


## Delivery verification

Independent review is clear after thin-corner and road-recovery regressions;
its focused rerun passed 63 tests. An additional recovered-volunteer test
passed and proves the recipient is reached without spending another visit.
The final full-render two-browser creator journey passed on Apple M3 Max
through confirmed edits, copying, guest denial, reconnect and removal.
`data/reports/creator-navigation-browser.json` records that isolated journey;
`shared-experience.json` retains the prior full-suite receipt. Hosted delivery
still requires the complete current-head shared journey suite.

Local gates: full preview suite, Redis-backed server suite, desktop tests,
production build and complete-worktree secret scan. The existing Vite chunk
size warning remains. Hosted Python, security and browser gates must pass
before merge. Physical-device and global acceptance remain open.
