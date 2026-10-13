# Visiting an office

Open **Play → Offices → Go to office lobby**, or walk to the existing office lobby beneath the green-glass canopy beside Equinox. Press **F** or choose **Office elevator**.

Jevica is the sole initial office owner. Every visitor needs an authenticated, approved town account and either an invitation from Jevica or a visit request she has accepted. Choosing Jevica’s appearance or name does not grant ownership. The lobby prompt offers **Request a visit** to residents without access.

Jevica can invite residents currently in town, accept or decline requests, and revoke access from **Play → Offices**. Upstairs, **Office access** exposes the same controls. Invitations and accepted requests last until revoked. Revoking access returns an occupant to their lobby position immediately.

The arrival sequence shows the player’s current avatar boarding an elevator, riding to level 6, and walking into the finished office. **Skip arrival** bypasses the sequence; reduced motion skips it automatically. Inside:

- **WASD** walks; drag or **← / →** turns the view.
- On-screen movement controls support touch and keyboard activation.
- **Y** joins/leaves voice and **M** mutes or holds to talk, following the existing voice preference. Voice remains optional.
- **Return to lobby** or **Escape** ends the visit and restores street controls.

The office uses the existing 9 × 7 m furnished room, with collision against walls, desks, chairs, storage and the review table. Walking reserves the measured 0.888 m turning radius of the longest playable body. The cinematic crosses the doorway along its centerline; free walking stays inside the office.

## Authority and persistence

`server/offices.js` handles the `office` world command. It derives ownership from the existing Jevica admin predicate; no command accepts an owner field. The same authenticated ticket/WebSocket gates enforce waitlist approval, session expiry and bans for both the local and Redis servers. Movement uses office-local coordinates, a speed budget and swept collision. Office visitors cannot perform street interactions or travel until they leave. Voice receives a distinct office space.

Grants, pending requests and current visits are part of private world checkpoint version 6. Older versions upgrade without office state; older writers reject version 6. Region migration preserves grants/requests when the office remains and ends visits along with other player connections. Redis persists this state with the world; a standalone in-memory town loses it when restarted.

This office visit feature is independent of the experimental companion drafting panel and its `RIVER_OAKS_WORKPLACE` / `VITE_WORKPLACE` flags. It performs no paid model or speech calls. It does not enable the drafting service.

Tests: `server/tests/offices*.test.js`, `preview/tests/office-*.test.js`, the office spatial-voice regression, and `pnpm run test:experience office-visit`. Browser fixtures use synthetic identities; they do not establish live WorkOS, hosted deployment, human accessibility or target-device performance acceptance.
