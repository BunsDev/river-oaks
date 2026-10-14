# Visiting an office

Open **Play → Offices → Go to office lobby**, or walk to the existing office lobby beneath the green-glass canopy beside Equinox. Press **F** or choose **Office elevator**.

Jevica is the sole initial office owner. Every visitor needs an authenticated, approved town account and either an invitation from Jevica or a visit request she has accepted. Choosing Jevica’s appearance or name does not grant ownership. The lobby prompt offers **Request a visit** to residents without access.

Jevica can invite residents currently in town, accept or decline requests, and revoke access from **Play → Offices**. Upstairs, **Office access** exposes the same controls. Invitations and accepted requests last until revoked. Revoking access returns an occupant to their lobby position immediately.

The arrival sequence starts from your current street view, opens the lobby doors, and follows your selected avatar into the elevator. The same cabin rides to level 6 and opens into the furnished office. **Skip arrival** bypasses the sequence; reduced motion skips it automatically. Inside:

- **WASD** walks; drag or **← / →** turns the view.
- On-screen movement controls support touch and keyboard activation.
- **Y** joins/leaves voice and **M** mutes or holds to talk, following the existing voice preference. Voice remains optional.
- **Return to street** or **Escape** ends the visit and restores your street view and controls. During the access check, **Cancel entry** also handles an acceptance that arrives late.

The office uses the existing 9 × 7 m furnished room, with collision against walls, desks, chairs, storage and the review table. Walking reserves the measured 0.888 m turning radius of the longest playable body. The cinematic crosses the doorway along its centerline; free walking stays inside the office.

## Arrival presentation

The web client keeps one scene, camera, renderer and postprocessing pipeline for the street, lobby, cabin and office. A temporary presentation pose animates the actual player avatar; it does not publish cinematic positions as street movement. The district is hidden only after both cabin doors close. The existing light pool supplies the cabin and office without changing the scene's light count. Leaving, revocation, disconnect or a world rebuild releases borrowed camera, avatar, lighting and lobby state.

The entrance retains the mapped office frontage, neighboring tenants, stone portal and green-glass canopy. Lobby finishes, signage, interior dimensions and the 24.3 m lift rise are authored interpretations, not surveyed building plans. The local floor mask is a rendering correction; it does not create an unrestricted walk-in room or change authoritative collision.

## Work at your desk

While upstairs, choose **Open desk · E**, press **E**, or approach a desk and choose **Use this desk**. The desk pauses walking and opens your private work surface. Guests keep their own tasks; office ownership does not grant access to someone else's notes.

Create a task, add notes and links to your files or documents, and write the result. Changes save automatically after a short pause; **Save** or **Cmd/Ctrl S** saves immediately. **Mark complete** keeps the result, and **Reopen task** resumes it. Returning to the desk after leaving or reloading opens the last saved task. **Download** exports a plain-text copy. File references are web links, not uploaded copies.

A failed save keeps your draft in the current page and offers Retry. Conflicts with another tab require downloading the local draft or explicitly reloading saved work. Closing a failed or unnamed draft asks before hiding it; it remains in that page until you return. Unsaved changes prompt before browser reload/navigation. They are not recoverable after closing the page without saving. Escape closes the desk first; a second Escape leaves the office.

Each account can keep up to 24 tasks within a 128 KiB desk document. Task limits are 120 characters for the title, 4,000 for notes, 8,000 for the result and five file links. Removing a task requires confirmation. Redis stores the account's desk outside world checkpoints until tasks are removed; the standalone in-memory development server retains it only for that process lifetime. Deletion removes task content while retaining a small version record to prevent stale writes from resurrecting deleted work.

The desk routes require the existing authenticated, approved session, origin/CSRF checks, rate limits and an active office visit in that same session. Desk text is never included in public snapshots. Saves use version checks so simultaneous tabs cannot silently overwrite each other. The desk performs no external writes, file fetches or model calls.

## Authority and persistence

`server/offices.js` handles the `office` world command. It derives ownership from the existing Jevica admin predicate; no command accepts an owner field. The same authenticated ticket/WebSocket gates enforce waitlist approval, session expiry and bans for both the local and Redis servers. Movement uses office-local coordinates, a speed budget and swept collision. Office visitors cannot perform street interactions or travel until they leave. Voice receives a distinct office space.

Grants, pending requests and current visits entered the private world checkpoint in version 6 and remain in version 7, which also records interior level occupancy. Older versions upgrade without office state; older writers reject the current version. Region migration preserves grants/requests when the office remains and ends visits along with other player connections. Redis persists this state with the world; a standalone in-memory town loses it when restarted.

This office visit feature is independent of the experimental companion drafting panel and its `RIVER_OAKS_WORKPLACE` / `VITE_WORKPLACE` flags. It performs no paid model or speech calls. It does not enable the drafting service.

Tests: `server/tests/offices*.test.js`, `preview/tests/office-*.test.js`, the office spatial-voice regression, and `pnpm run test:experience office-visit`. Browser fixtures use synthetic identities; they do not establish live WorkOS, hosted deployment, human accessibility or target-device performance acceptance.
