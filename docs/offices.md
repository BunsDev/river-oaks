# Visiting an office

Open **Play → Offices → Go to office lobby**, or walk to the existing office lobby beneath the green-glass canopy beside Equinox. Press **F** or choose **Office elevator**.

Every approved account can choose **Open my office** to provision one personal workspace on first use. The same lobby and furnished room serve separate logical offices; each workspace has its own visits, voice space and shared tasks. Setup requires no maintainer action. The office selector also lists invitations and accepted collaborations.

Jevica’s original office remains available in the selector. Visiting it still requires an invitation from Jevica or a visit request she has accepted. Choosing Jevica’s appearance or name does not grant ownership. Existing visit grants do not grant collaboration access to a personal workspace.

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

While upstairs, choose **Open desk · E**, press **E**, or approach a desk and choose **Use this desk**. The desk pauses walking and opens **My tasks**, private to your account. Guests keep their own tasks; office ownership does not grant access to someone else's notes. In personal workspaces, **Office tasks** switches to the current office’s shared tasks. The scope is labeled before saving. Existing private tasks are never automatically copied into shared tasks.

Owners use **Office access** to invite approved residents currently in town. Invitees choose the office in their selector and explicitly accept before entering or accessing shared tasks. Accepted collaborators can edit tasks but cannot manage membership. Owners can revoke pending invitations or accepted collaborations. Task authorization observes revocation on every request, including retried mutations. Occupants are removed immediately in the local server and on the bounded reconciliation interval (up to five seconds) in Redis rooms; clients clear shared views when revocation is observed. Previously delivered data cannot be recalled. Jevica’s original visit-only office continues to provide private desks.

Create a task, add notes and links to your files or documents, and write the result. Changes save automatically after a short pause; **Save** or **Cmd/Ctrl S** saves immediately. **Mark complete** keeps the result, and **Reopen task** resumes it. Returning to the desk after leaving or reloading opens the last saved task. **Download** exports a plain-text copy. File references are web links, not uploaded copies.

A failed save keeps your draft in the current page and offers Retry. Retries reuse the original operation ID and payload; typing after a timeout remains dirty until a subsequent save. The server retains the latest 32 operation receipts per desk or workspace; retries outside that window fail the version check safely. Conflicts with another tab require downloading the local draft or explicitly reloading saved work. Closing a failed or unnamed draft asks before hiding it; it remains in that page until you return. Unsaved changes prompt before browser reload/navigation. They are not recoverable after closing the page without saving. Switching task scopes or leaving an office asks before discarding a failed shared draft. Account changes and observed revocation clear shared cached content; export before leaving if you need an unsaved copy. Escape closes the desk first; a second Escape leaves the office.

Each private desk and each shared office desk can keep up to 24 tasks within a 128 KiB desk document. Task limits are 120 characters for the title, 4,000 for notes, 8,000 for the result and five file links. Removing a task requires confirmation. Redis stores the account's desk outside world checkpoints until tasks are removed; the standalone in-memory development server retains it only for that process lifetime. Creation/update timestamps are assigned by the server. Legacy tasks acquire timestamps when edited. Deletion removes task content while retaining a small version record to prevent stale writes from resurrecting deleted work.

The desk routes require the existing authenticated, approved session, origin/CSRF checks, rate limits and an active office visit in that same session. Desk text is never included in public snapshots. Saves use version checks so simultaneous tabs cannot silently overwrite each other. The desk performs no external writes, file fetches or model calls.

## Authority and persistence

`server/offices.js` handles the `office` world command. It derives ownership from the existing Jevica admin predicate; no command accepts an owner field. The same authenticated ticket/WebSocket gates enforce waitlist approval, session expiry and bans for both the local and Redis servers. Movement uses office-local coordinates, a speed budget and swept collision. Office visitors cannot perform street interactions or travel until they leave. Voice receives a distinct office space.

Grants, pending requests and current visits entered the private world checkpoint in version 6. Version 7 adds interior level occupancy; version 8 adds personal workspace visits. Workspace membership is revalidated before the first reconnect snapshot and by the coordinator before restored visits are published. Version 10 records each visit's layout and level (below). The Redis writer generation is fenced at v10 (v9 added venue screenings, [screenings](screenings.md)). Older versions upgrade without office state; older writers reject the current version. Region migration preserves grants/requests when the office remains and ends visits along with other player connections. Redis persists this state with the world; a standalone in-memory town loses it when restarted.

Workspace metadata, invitations and shared tasks live in a versioned account-level store outside world checkpoints. Provisioning uses a deterministic workspace ID and atomic compare-and-set writes. Redis updates membership, discovery indices and shared tasks in the same transaction, preventing stale writes from bypassing revocation. Storage is bounded to 10,000 workspaces, 32 collaborators per office and 64 owned/invited offices per account; discovery uses per-account indices, not database scans. Browser discovery refreshes only near the lobby, in an active office, or while the office panel is visible. Private desk records read the legacy shape and write schema version 2 with bounded retry receipts. No existing task content is made public or shared.

The new endpoints are POST `/api/office-desk/workspace/{provision,list,invite,accept,revoke,read,save,remove}`. Discovery and invitations require an approved authenticated account; task reads/writes additionally require an active visit in the same session. The hosted allowlist and rewrites include these routes. Production rollout must update the gateway and client together; real hosted authentication remains a separate acceptance check.

This office visit feature is independent of the experimental companion drafting panel and its `RIVER_OAKS_WORKPLACE` / `VITE_WORKPLACE` flags. It performs no paid model or speech calls. It does not enable the drafting service.

Tests: `server/tests/offices*.test.js`, `server/tests/penthouse-*.test.js`, `preview/tests/office-*.test.js`, the office spatial-voice regression, and `pnpm run test:experience office-visit office-desk office-computer-shared`. Browser fixtures use synthetic identities; they do not establish live WorkOS, hosted deployment, human accessibility or target-device performance acceptance.

## Layouts and floors

Each visit records the layout and the floor the server admitted it to (`preview/src/office-layouts.js`). The legacy 9 × 7 m room (`office-legacy-1`) is the default and the rollback. `RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1` selects the penthouse for Jevica's office on that server. It is a two-floor plan in #349's level shape (`jevica-office/l0` main floor and terrace, `jevica-office/l1` mezzanine at +3.8 m), built from the reviewed #360 contract. Personal workspaces always use the legacy room. An unknown value keeps the legacy room and logs `office_layout_ignored`.

- **Floors.** Moves are checked against the visit's own floor, so the mezzanine and the main floor beneath it never share collision. A move names the layout it was computed for (`office_layout_stale` otherwise). It may repeat the visit's floor but never choose it (`office_level_stale`). Height and elevation are not command fields. Snapshots publish `layout`, `levelId` and the server-derived `elevation`.
- **Stairs and lift.** `{type:'office', action:'transition', officeId, portalId, layout}` works only from within 1.3 m of a stair or lift portal on the current floor. It lands on that portal's pair if the landing is free and no other visitor stands within 0.7 m, then resets the movement budget. There is no arbitrary destination.
- **Checkpoints.** Version 10 stores `layout` and `levelId` with each visit. Visits from versions 6–9 were in the legacy room and upgrade to it. A malformed layout, floor or position refuses the restore. A well-formed visit on a layout the server no longer serves for that office ends safely; grants, requests and desks stay. Switching the option back to the legacy room is the rollback.


- **In the browser.** Within reach of the stair foot or the lift, **Take the stairs up · Q** (or down, or **Use the lift · Q**) appears; it sends the transition and adopts the floor the server answers with. Moves carry the layout and floor; a reply that arrives after the visit closed changes nothing. The first-person eye and avatars stand at the server-derived floor elevation, and a visitor on the other floor stays visible even directly above or below. Until #362's assets arrive, the penthouse is a graybox drawn from the same plan (`preview/src/office-penthouse-graybox.js`); an unknown layout refuses to render rather than show another plan's geometry.

To see it locally, run `node preview/e2e/office-penthouse-runner.mjs`: the loopback fixture serves the penthouse, and the owner takes the stairs to the mezzanine.

The penthouse is not active anywhere by default. Raising the mapped building to fit it, furniture collision beyond the desk chairs, and final art are later steps (#362, #363).
