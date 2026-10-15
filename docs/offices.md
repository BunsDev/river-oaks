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

By default, the office uses the existing 9 × 7 m furnished room, with collision against walls, desks, chairs, storage and the review table. Walking reserves the measured 0.888 m turning radius of the longest playable body. The cinematic crosses the doorway along its centerline; free walking stays inside the office.

## Arrival presentation

The web client keeps one scene, camera, renderer and postprocessing pipeline for the street, lobby, cabin and office. A temporary presentation pose animates the actual player avatar; it does not publish cinematic positions as street movement. The district is hidden only after both cabin doors close. The existing light pool supplies the cabin and office without changing the scene's light count. Leaving, revocation, disconnect or a world rebuild releases borrowed camera, avatar, lighting and lobby state.

The entrance retains the mapped office frontage, neighboring tenants, stone portal and green-glass canopy. Lobby finishes, signage, interior dimensions and the 24.3 m lift rise are authored interpretations, not surveyed building plans. The local floor mask is a rendering correction; it does not create an unrestricted walk-in room or change authoritative collision.

## Work at your desk

While upstairs, choose **Open desk · E**, press **E**, or approach a desk and choose **Use this desk**. The desk pauses walking and opens **My tasks**, private to your account. Guests keep their own tasks; office ownership does not grant access to someone else's notes. In personal workspaces, **Office tasks** switches to the current office’s shared tasks. The scope is labeled before saving. Existing private tasks are never automatically copied into shared tasks.

Owners use **Office access** to invite approved residents currently in town. Invitees choose the office in their selector and explicitly accept before entering or accessing shared tasks. Accepted collaborators can edit tasks but cannot manage membership. Owners can revoke pending invitations or accepted collaborations. Task authorization observes revocation on every request, including retried mutations. Occupants are removed immediately in the local server and on the bounded reconciliation interval (up to five seconds) in Redis rooms; clients clear shared views when revocation is observed. Previously delivered data cannot be recalled. Jevica’s original visit-only office continues to provide private desks.

Create a task, add notes and links to your files or documents, and write the result. An empty private desk also offers **Or write a three-line scene idea**, which opens a private task with a three-line hint. The task is named Scene idea once you write in it, so the click alone saves nothing. It is never shared, published or copied to Office tasks. Changes save automatically after a short pause; **Save** or **Cmd/Ctrl S** saves immediately. **Mark complete** keeps the result, and **Reopen task** resumes it. Returning to the desk after leaving or reloading opens the last saved task. **Download** exports a plain-text copy. File references are web links, not uploaded copies.

A failed save keeps your draft in the current page and offers Retry. Retries reuse the original operation ID and payload; typing after a timeout remains dirty until a subsequent save. The server retains the latest 32 operation receipts per desk or workspace; retries outside that window fail the version check safely. Conflicts with another tab require downloading the local draft or explicitly reloading saved work. Closing a failed or unnamed draft asks before hiding it; it remains in that page until you return. Unsaved changes prompt before browser reload/navigation. They are not recoverable after closing the page without saving. Switching task scopes or leaving an office asks before discarding a failed shared draft. Account changes and observed revocation clear shared cached content; export before leaving if you need an unsaved copy. Escape closes the desk first; a second Escape leaves the office.

Each private desk and each shared office desk can keep up to 24 tasks within a 128 KiB desk document. Task limits are 120 characters for the title, 4,000 for notes, 8,000 for the result and five file links. Removing a task requires confirmation. Redis stores the account's desk outside world checkpoints until tasks are removed; the standalone in-memory development server retains it only for that process lifetime. Creation/update timestamps are assigned by the server. Legacy tasks acquire timestamps when edited. Deletion removes task content while retaining a small version record to prevent stale writes from resurrecting deleted work.

The desk routes require the existing authenticated, approved session, origin/CSRF checks, rate limits and an active office visit in that same session. Desk text is never included in public snapshots. Saves use version checks so simultaneous tabs cannot silently overwrite each other. The desk performs no external writes, file fetches or model calls.

## Authority and persistence

`server/offices.js` handles the `office` world command. It derives ownership from the existing Jevica admin predicate; no command accepts an owner field. The same authenticated ticket/WebSocket gates enforce waitlist approval, session expiry and bans for both the local and Redis servers. Movement uses office-local coordinates, a speed budget and swept collision. Office visitors cannot perform street interactions or travel until they leave. Voice receives a distinct office space.

Grants, pending requests and current visits entered the private world checkpoint in version 6. Version 7 adds interior level occupancy; version 8 adds personal workspace visits; version 9 adds venue screenings; version 10 adds each office visit’s layout and floor; version 11 adds penthouse seat claims. The Redis writer generation is fenced at v11. Earlier supported checkpoints upgrade according to their schema: pre-v6 checkpoints have no office state, pre-v10 office visits use the legacy layout, and pre-v11 visits stand. Unsupported writers cannot replace a newer coordinator.

Application replacement and coordinator takeover restore compatible visits, including their floor, within the normal session and presence timeouts, while rechecking current sessions and workspace membership before publishing the restored room. This is separate from region publication, which intentionally disconnects players and ends visits as geography changes; office grants/requests survive when that office remains. Both paths use the new coordinator’s configured `RIVER_OAKS_OFFICE_LAYOUT` and `RIVER_OAKS_SCREENING_HOSTS`, including the supported district checkpoint recovery chain. Configuration comes from the application, not the backup. Keep it consistent across gateways; changing environment values takes effect when those processes are replaced.

`RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1` selects Jevica’s penthouse; unset or `office-legacy-1` selects the legacy room. Personal workspaces always keep the legacy layout. An intentional change back to legacy ends incompatible penthouse visits without discarding grants, workspace memberships or tasks. Removed or expired screening-host grants cannot be recovered from an old checkpoint. The pre-playback 12-second synthetic screening fixture is recognized during recovery and stopped with a new screening epoch; its old command receipts cannot replay. This does not discard office visits, memberships or tasks. Failed region publication leaves the previous committed region and world authoritative; a competing draft must be refreshed before retrying. Redis retains world state across application replacement; the standalone in-memory town loses it when restarted.

Workspace metadata, invitations and shared tasks live in a versioned account-level store outside world checkpoints. Provisioning uses a deterministic workspace ID and atomic compare-and-set writes. Redis updates membership, discovery indices and shared tasks in the same transaction, preventing stale writes from bypassing revocation. Storage is bounded to 10,000 workspaces, 32 collaborators per office and 64 owned/invited offices per account; discovery uses per-account indices, not database scans. Browser discovery refreshes only near the lobby, in an active office, or while the office panel is visible. Private desk records read the legacy shape and write schema version 2 with bounded retry receipts. No existing task content is made public or shared.

The new endpoints are POST `/api/office-desk/workspace/{provision,list,invite,accept,revoke,read,save,remove}`. Discovery and invitations require an approved authenticated account; task reads/writes additionally require an active visit in the same session. The hosted allowlist and rewrites include these routes. Production rollout must update the gateway and client together; real hosted authentication remains a separate acceptance check.

This office visit feature is independent of the experimental companion drafting panel and its `RIVER_OAKS_WORKPLACE` / `VITE_WORKPLACE` flags. It performs no paid model or speech calls. It does not enable the drafting service.

Tests: `server/tests/offices*.test.js`, `server/tests/penthouse-*.test.js`, `preview/tests/office-*.test.js`, the office spatial-voice regression, and `pnpm run test:experience office-visit office-desk office-computer-shared`. Browser fixtures use synthetic identities; they do not establish live WorkOS, hosted deployment, human accessibility or target-device performance acceptance.

## Layouts and floors

Each visit records the layout and the floor the server admitted it to (`preview/src/office-layouts.js`). The legacy 9 × 7 m room (`office-legacy-1`) is the default and the rollback. `RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1` selects the penthouse for Jevica's office on that server. It is a two-floor plan in #349's level shape (`jevica-office/l0` main floor and terrace, `jevica-office/l1` mezzanine at +3.8 m), built from the reviewed #360 contract. Personal workspaces always use the legacy room. An unknown value keeps the legacy room and logs `office_layout_ignored`.

- **Floors.** Moves are checked against the visit's own floor, so the mezzanine and the main floor beneath it never share collision. A move names the layout it was computed for (`office_layout_stale` otherwise). It may repeat the visit's floor but never choose it (`office_level_stale`). Height and elevation are not command fields. Snapshots publish `layout`, `levelId` and the server-derived `elevation`.
- **Stairs and lift.** `{type:'office', action:'transition', officeId, portalId, layout}` works only from within 1.3 m of a stair or lift portal on the current floor. It lands on that portal's pair if the landing is free and no other visitor stands within 0.7 m, then resets the movement budget. There is no arbitrary destination.
- **Seats (#363).** The penthouse's seats are the plan's five desk chairs on the main floor and the two library reading chairs on the mezzanine (`officeSeats` in `office-layouts.js`). `{type:'office', action:'sit', officeId, seatId, layout}` works only within 1.3 m of the seat's stand point on the visit's own floor: a desk chair's stand point is its desk's approach, and a reading chair's is the edge of the gallery band (d 16.45). The server places the visitor at the plan's seat position and facing; the client sends no pose. Each seat has one occupant, so of two concurrent claims one wins and the other gets `office_seat_occupied`. A taken seat is collision for everyone else on its floor, for moves, sweeps and stair or lift landings. It covers 2.158 m around the seat, the measured turning radius (0.888 m) plus the widest seated footprint (`AVATAR_ENVELOPE.seatedRadius`, 1.27 m), and 0.7 m around its stand point. A claim is refused (`office_seat_blocked`) while another standing visitor is inside that area. Every required contract route stays walkable with every other seat taken, and the reading chairs' envelopes stay out of the gallery band and passing bay. Seated visitors cannot move or take the stairs (`office_seated`). `{action:'stand', layout}` returns the visitor to the stand point, which nobody else can be standing near, so standing up is never blocked by a body. Leaving, revocation, a layout the server no longer serves, and departure after the reconnect grace end the visit and release its seat; a late `sit` or `stand` cannot recreate a visit. Snapshots publish `seat: {id}` only. The legacy room and personal workspaces have no seats.
- **Checkpoints.** Version 10 stores `layout` and `levelId` with each visit. Version 11 adds the optional `seat: {id}`. Visits from versions 6–9 were in the legacy room and upgrade to it, and version 10 visits stand. A restored claim must name a seat on the visit's own floor, sit exactly at that seat's position and facing, leave its stand point clear, and be the seat's only claim. No standing visit may be inside another visit's taken seat. Anything else refuses the restore. Claims survive a Redis coordinator replacement this way. A well-formed visit on a layout the server no longer serves for that office ends safely, and its seat with it; grants, requests and desks stay. Switching the option back to the legacy room is the rollback; the writer stays at version 11.


- **In the browser.** Within reach of the stair foot or the lift, **Take the stairs up · Q** (or down, or **Use the lift · Q**) appears; it sends the transition and adopts the floor the server answers with. Moves carry the layout and floor; a reply that arrives after the visit closed changes nothing. At a chair's stand point, **Sit down · Z** claims it; seated, walking and stairs pause, the eye drops to 1.2 m, a desk chair offers **Use this desk**, and **Stand up · Z** stands. The client adopts a seat or release the server reports, predicts movement around other visitors' occupied seats, and draws seated peers on their seat. The first-person eye and avatars stand at the server-derived floor elevation, and a visitor on the other floor stays visible even directly above or below. Until #362's assets arrive, the penthouse is a graybox drawn from the same plan (`preview/src/office-penthouse-graybox.js`); an unknown layout refuses to render rather than show another plan's geometry. Its street front, east side and terrace side are a bronze-mullioned glass curtain wall (two instanced draws), with a solid core around the arrival doorway and a solid back wall; transoms 3 m up close the terrace portals, which stay walkable, and the plan's terrace walls keep their collision. In this layout, once you arrive, the borrowed cabin and lobby are hidden, so they cannot show through the front glass; the car's closed doors stay in the doorway. Leaving restores them. The standalone office scene, used when the street cannot be borrowed, hides its own lift and lobby the same way (`arrivalBehindGlass` in `office-arrival-architecture.js`). The street itself is hidden while you are upstairs; the glass shows the skyline capture described below, or the plain backdrop in the standalone scene, which has no street to capture.

- **Views (#363).** **V**, or the view select in the header, cycles five fixed camera positions inside the penthouse: Overview, Main floor, Workstations, Library and Terrace (`officeViews` in `office-layouts.js`). A view moves only that visitor's camera. It sends no command and keeps the visitor where they stand. Walking pauses, and the visitor sees their own body, seated if seated. Escape, a walking key, the touch pad, the stairs, a chair or the desk returns to walking. Escape leaves a view before it leaves the office. Choosing from the select returns keyboard focus to the office. If the browser closes the office on a second Escape, the visit is left properly. The legacy room has no views.

To see it locally, run `node preview/e2e/office-penthouse-runner.mjs`: the loopback fixture serves the penthouse, and the owner takes the stairs to the mezzanine.

**Skyline (prototype).** Once the doors close the street stops drawing, so a layout with a terrace captures the actual district once, from the middle of its main floor and terrace at standing height, into a cube map shown as the backdrop outside (`preview/src/office-skyline.js`); it is a local picture that never moves the office or changes collision, membership or position, the legacy room never captures, and `?office-skyline=off` compares without it in development.

The penthouse's three desks are the supplied kit's measured footprints: the executive desk and two shared benches, 0.76 m high. They were imported as numbers only under Val's R19 decision of 2026-10-15. They are collision for the server and the client, and the graybox draws them in one batch. The penthouse is not active anywhere by default. Raising the mapped building to fit it, furniture collision beyond the desks and chairs, and final art are later steps (#362, #363). The graybox chairs are drawn at the plan's 0.5 m seat height; final chair art must match it.

## Operating office storage

Office provisioning, invitations and task management need no maintainer intervention.
Keep the existing account authentication and Redis backend; no additional service,
provider setting, scheduled cleanup or task runner is needed.

**Bounds and cost.** Each private/shared desk has at most 24 tasks and 128 KiB of
serialized public desk data. Private storage admits 10,000 accounts; shared storage
admits 10,000 offices, 32 collaborators per office and 64 office references per
account. These are admission limits, not TTLs: deleting the last task retains its
version and bounded retry receipts (32) so stale writes cannot recreate it. Metadata,
receipts, Redis hash/index overhead, checkpoints and other application data consume
additional memory; 128 KiB is not a whole-record or deployment memory limit.
Full-capacity public task data alone can approach 2.44 GiB across both stores.
Existing desks remain readable at capacity; new writes exceeding limits return a
conflict instead of growing storage silently.

Movement, reconnect validation, visit reconciliation, repeat provisioning and
indexed discovery project current metadata from the canonical record in Redis.
No task text/receipts cross the wire on these paths, and there is no authorization
cache. Redis still decodes the bounded record per projection; each projection is
one EVAL with one internal HGET. Discovery reads at most 64 indexed offices per
account. Task saves and membership changes retain the full-record compare-and-set
transaction, including discovery index updates; their transfer/CPU cost still grows
with desk size and membership. Task reads always recheck membership. A request
ordered after revocation is denied, including a previously successful save retry.
An already-running read ordered before revocation can complete afterward; previously
delivered content cannot be recalled.

**Persistence is not durability configuration.** Replacing a gateway leaves Redis
records intact; restarting the standalone memory server loses them. Redis restart
survival depends on its existing persistence and recovery configuration. Our local
recovery fixture uses AOF with `appendfsync always` and verifies acknowledged writes
after SIGKILL/restart. RDB snapshots and less frequent AOF fsync have different loss
windows; replication alone is not a backup. No test here inspects or changes the
hosted provider's configuration, guarantees its disk durability, or proves production
recovery. Verify that separately before making a production durability claim.
The version/receipt and membership records must also survive without expiration or
eviction. Losing a tombstone or reverting to an older snapshot loses its stale-write
fence. Capacity planning must preserve these records (for example, a no-eviction
policy with adequate headroom); this patch does not inspect or change that policy.
See Redis’s [persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/)
and [eviction](https://redis.io/docs/latest/develop/reference/eviction/) references.

**Compatibility and failures.** Workspace records remain schema 1 in
`<namespace-tag>:office-workspaces:v1`; the account discovery index remains
`office-workspaces-index:v1`. Private records remain schema 2 in `office-desk:v1`
and still read the legacy shape. This improvement requires no data migration or
backfill; old and new compatible writers share the same atomic record. Personal workspace visits entered checkpoint generation 8; the integrated world
now uses checkpoint/writer generation 10 for office layouts (v9 added venue screenings). Do not roll back to a writer that cannot read
the current checkpoint/schema. Deploy the gateway and client as a compatible pair.
Storage failures deny access rather than granting cached membership; a failed save
keeps its current-page draft and stable operation ID for Retry. Export a needed draft
before closing the page. For a conflict, explicitly reload saved work or export the
local draft. Do not delete version records, edit memberships by hand, flush Redis,
or replay an old operation with a new expected version as a recovery shortcut.

**Validate recovery with synthetic local data.** Install the repository prerequisites
and a local `redis-server`, then run:

```sh
node --test server/tests/office-recovery.test.js server/tests/office-world-lifecycle.test.js
node scripts/office-database-cost.mjs a714a8a5
node scripts/office-database-cost.mjs
```

The recovery test starts its own temporary loopback Redis processes and never uses
an existing database URL. It replaces stores, drops successful responses, kills and
restarts AOF Redis, makes a consistent RDB snapshot with SAVE, copies it to a fresh
owned directory and boots a separate Redis with AOF disabled to validate the backup.
It checks exact private/shared tasks, membership, versions and receipts, then exercises
concurrent edits, deletion, revocation, reinvitation and stale retries after recovery.
Temporary data/processes are removed on completion. A missing local binary is a skip
in the core suite, never recovery proof; the full profile requires `redis-server` and
fails if it is unavailable. Full verification also requires its separate disposable
`REDIS_URL` for the existing server suites. Real HTTP/WebSocket replacement/reconnect
coverage is in `office-desk-transport.test.js`. The lifecycle suite drives real room
requests and fenced Redis commits with synthetic catalog records for the district-only
office and IPIC geometry. It covers publication, rejected publication, takeover,
compatible checkpoint recovery, revocation/expiry and intentional configuration
rollback. The creator-region HTTP publication path remains covered separately by
`world-gateway.test.js`.

The cost fixture writes raw and summarized receipts under
`.runtime/office-reliability/cost-{baseline,after}.json`. It measures office-store
commands (including Lua subcommands), RESP socket bytes, and five latency samples per
scenario; it excludes authentication and room transport overhead. Use the same host
and fixture for comparison; loopback latency is not hosted performance acceptance.

A real backup must preserve the workspace records **and** discovery indices, private
desk records and relevant world/checkpoint state from a consistent recovery point.
Restore into an isolated destination first and validate account isolation, versions,
retry behavior and membership before any separately authorized cutover. Restoring
an older backup also restores its older grants and task contents: post-snapshot
revocations/deletions cannot be inferred from that backup. Keep traffic stopped until
those changes are reconciled from authoritative evidence; do not claim that stale
backup restoration preserves newer revocations. This runbook authorizes no production
backup, restore, deployment or provider changes.
