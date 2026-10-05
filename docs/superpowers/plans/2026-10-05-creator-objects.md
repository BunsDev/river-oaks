# Creator objects and the virtual-world goal

Objective: transform River Oaks into a comprehensive Second Life-style world.
This milestone extends the creation tools beyond six fixed furniture presets.
The overall goal remains active until its full capabilities and acceptance
requirements are implemented and verified.

## Current capability audit

| Capability | Current authoritative seam | Remaining work |
| --- | --- | --- |
| Avatar identity and fashion | Shared appearances, reference rigs, account appearance preferences | Personal collections, richer customization, and imported assets |
| Social presence | Shared rooms, profiles, contacts, private messages, groups, chat, gestures, events | Broader resident activities and geographic acceptance |
| Places and land | Region studio, published worlds, maps, landmarks, home invitations | Broader land management and continuous travel |
| Creation and reuse | Six fixed furniture types, placement preview, world and account saved designs | Editable primitive geometry, materials, assemblies, imported content, and permissions |
| Object behavior | Built-in seating, watering, and wishes | Creator-authored interactive behavior and durable object state |
| Commerce | Illustrative solo economy scenarios | Actual in-world goods, inventory ownership, exchange, and marketplace flows |
| Transport and capacity | Redis authority, 32-player rooms, local transport/render audits | Hosted multi-region soak, physical devices, and measured global headroom |
| Spatial voice | Explicitly deferred plan | Resume only when Val asks |

The creator milestone addresses creation and reuse. Other rows remain in the
goal; this ledger does not redefine completion around the current feature set.
Second Life's [creator overview](https://go.secondlife.com/create) and
[content creation reference](https://wiki.secondlife.com/wiki/Content_Creation)
describe building, assets, scripting, and distribution as separate capabilities.

## Constraints

- Only Jevica's two verified WorkOS IDs may build, design, publish, or grant wishes.
- Keep 98 shared NPCs, 193 solo NPCs, and the 32-player world admission limit.
- Preserve existing furniture, seating, region packages, private-home boundaries,
  checkpoints, saved designs, and account library behavior.
- Keep voice deferred. Do not provision paid services or enable real-money flows.
- Preserve the dirty commands/clear-view checkout and other owned worktrees.

## Milestone design

Add a custom-object creation type with editable primitive parts. A creation has
one authoritative root transform and a bounded assembly of box, sphere, or
cylinder parts, each with dimensions, local position, rotation, color, and
physical material. Compute conservative placement and navigation bounds from
the complete assembly. Validate every field on the server, and render only
confirmed state in other residents' browsers.

Provide an editor in the existing builder controls. Jevica can add, select,
edit, or remove parts, preview placement, and save the complete design in the
account library for copying into other worlds. Guests can see the resulting
objects without receiving creation capabilities. Existing seated furniture
keeps its authored pose geometry.

Do not mistake primitive assemblies for imported assets or arbitrary scripts.
Those capabilities remain explicit follow-up requirements for the full goal.

## Execution and proof

- [x] Inspect placement, collision, rendering, library, checkpoint, and protocol seams.
- [x] Verify a clean baseline in the isolated creator-objects worktree.
- [x] Write failing behavior tests for actual custom creation, bounds, denial,
  malformed parts, durable recovery, and account-library copies.
- [x] Implement a shared assembly contract and authority for memory and Redis.
- [x] Implement the editor, preview, confirmed renderer, and resource cleanup.
- [x] Verify real two-browser creation, edits, reuse, guest denial, and reconnect.
- [x] Measure bounded rendering resources and preserve the multiplayer audit limits.
- [x] Complete local gates before committing.
- Delivery requires successful hosted checks for the current PR head before merge.

Parallel ownership: PR 162 owns the existing journey-race fixes. Review it without
duplicating those edits, and integrate its landed version before final delivery.


## Local verification evidence

- Baseline: 66 focused tests passed, one Redis test skipped before its fixture.
- Tests-first failures reproduced missing assembly authority/rendering, oversized
  transport rejection, missing editor controls, and missing custom collision.
- Preview: 690 tests passed. Server with loopback Redis: 314 tests passed with
  zero skips. Desktop: 8 tests passed. Python: 138 passed, Ruff checks passed.
- Production build passed. Creator hardware-browser journey passed, including
  UI edits, saved copies, guest denial, second-client materials, and reconnect.
- Resource and actual previous-coordinator rollout receipts:
  `data/reports/creator-objects-performance.json` and
  `data/reports/creator-objects-rollout.json`.
- The broad goal still requires imported content, richer inventory/commerce,
  object behavior, broader land management, and global/device acceptance.
  Voice remains explicitly deferred.

- All 17 hardware-browser journey cases passed. The full run passed 16;
  a focused rerun passed the development journey after its old 15-degree
  assertion was updated to the authority's existing 22.5-degree snap.
  `shared-experience.json` preserves that execution history and prior failure.
- Independent review is clear after placement/recovery/protocol fixes; preview
  and authority now share player-volume checks and root yaw snapping.
