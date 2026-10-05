# Shared spatial voice (deferred)

Spatial voice would let residents talk within their current world and interior,
with volume and direction following confirmed player positions.

**Status: deferred at Val's request on 5 October 2026.** Keep this as a plan.
Resume implementation only when Val asks to resume voice. Provider selection,
service provisioning, and production enablement remain pending.

## Preserve the current town

- Restrict building, saved designs, region publishing, and wish granting to
  Jevica's two verified WorkOS account IDs. Voice access must not confer these
  capabilities.
- Keep the shared cast at 98 simulated NPCs, versus 193 in solo play (49.2%
  fewer), and retain the 32-player world limit.
- Preserve the shared seating shipped in PR 158. Integrate later interaction
  changes from their landed version when voice resumes.
- Retain the proof gaps in the
  [multiplayer performance audit](../../multiplayer-performance-audit.md).
  Local fixtures do not establish global capacity or live WorkOS acceptance.

## Proposed transport and authority

LiveKit is a candidate SFU (selective forwarding unit). Each client would publish
one microphone track to the SFU. Recheck its supported releases and hosting
options when work resumes; no provider or hosting purchase is approved by this
plan.

1. Gate voice access with the existing authenticated session, waitlist approval,
   ban status, origin, CSRF, rate limits, and active game connection. Derive the
   account, world, session, connection, and interior from server authority.
2. Assign separate SFU rooms per deployment namespace, world, and interior or
   outdoor space. Never accept a client-selected room or account identity.
3. Issue scoped tokens for joining the assigned room, publishing microphone
   audio, and receiving audio. Exclude video, screen sharing, data publishing,
   metadata changes, and administrative grants.
4. Bind a random voice lease identity to the current game session and connection.
   Fence renewals and departures so a stale browser cannot remove its successor.
5. Use confirmed world poses for distance gain, stereo direction, and selective
   listening within the authorized room. Client volume and subscriptions are
   presentation controls; they do not enforce private-home access.
6. On interior changes, leave the old SFU room and authorize the new room before
   receiving its audio. Account for region revisions and private-home access
   changes when determining the authoritative voice space.

The inspected LiveKit `v1.13.7` subscription implementation checks
`CanSubscribe()` before adding a subscriber, including server-directed
subscriptions. Do not grant `canSubscribe: false` and assume an administrative
subscription call can bypass it. See the
[subscription implementation](https://github.com/livekit/livekit/blob/v1.13.7/pkg/rtc/subscriptionmanager.go).

## Revocation and deployment

Use a persistent controller to reconcile voice participants against authorized
leases and game presence. Serverless HTTP requests alone cannot provide
continuous cleanup after every resident leaves.

- Remove audio access after logout, ban, approval revocation, session expiry,
  connection replacement, world departure, or lease expiry.
- Fail closed when controller health or authoritative presence is stale.
- Bound lease counts and expiries, reconcile unknown participants, and keep
  memory and Redis behavior equivalent.
- Determine and test a maximum revocation delay before enablement. Short JWT
  lifetimes alone are insufficient proof that active audio has stopped.
- Verify removal, token replay, reconnect, and SDK token refresh against the
  selected hosted or self-hosted deployment. Do not assume both have identical
  token revocation behavior.
- Keep provider secrets server-side and isolate production, preview, and local
  namespaces. Deploy the controller near its SFU and state store.
- For self-hosting, plan trusted TLS, reachable media ports, TURN fallback,
  monitoring, and measured CPU and bandwidth capacity. See the
  [LiveKit deployment requirements](https://docs.livekit.io/transport/self-hosting/deployment/).

## Resident controls

- Provide an explicit Join voice action with the microphone initially off.
- Request microphone permission only after a deliberate microphone action.
- Offer microphone mute, deafen, per-resident mute, and Leave voice controls.
- Show connection and speaking status with accessible labels and keyboard access.
- Stop capture and dispose tracks, audio nodes, timers, and listeners on leave,
  sign-out, authorization loss, world changes, and component disposal.
- Handle permission denial, missing hardware, autoplay restrictions, and network
  failure without interrupting ordinary movement and text chat.
- For Electron, design a narrow trusted-origin, microphone-only permission path.
  Its current deny-all permission handlers require separate verification before
  desktop voice can be enabled.

## Implementation seams to revisit

| Area | Existing seam | Planned responsibility |
| --- | --- | --- |
| HTTP authorization | `server/app.js`, `server/distributed-app.js` | Join, renew, and leave with existing access gates |
| Room authority | `server/world.js`, `server/redis-room.js` | Current connection and authorized voice space |
| Lifecycle and hosting | `server/town.js`, `server/world-gateway.js`, `server/redis-backend.js` | Lease store, controller, revocation, and configuration |
| Browser | `preview/src/multiplayer-client.js` | Controls, snapshot-driven audio, and cleanup |
| Routing | `preview/vite.config.js`, `vercel.json` | Explicit voice routes |
| Desktop | `desktop/main.js` | Restricted microphone permission |

## Acceptance gates before enablement

- [ ] Confirm provider, hosting ownership, operating cost, and revocation behavior.
- [ ] Write failing tests for access gates, identity spoofing, world and interior
  isolation, lease fencing, expiry, controller failure, and the participant cap.
- [ ] Implement matching memory and Redis authority, including lifecycle hooks.
- [ ] Verify actual two-browser microphone audio through a real SFU, not only
  mocked token responses or connection status.
- [ ] Measure distance attenuation and direction, selective receiving, mute,
  deafen, per-resident mute, and room transition isolation.
- [ ] Test permission denial, TURN fallback, reconnect, logout, bans, session
  replacement, token replay, region updates, and capture cleanup.
- [ ] Verify restricted Electron permissions and real browser/device acceptance.
- [ ] Measure 8, 16, and 32 concurrent users from multiple regions for at least
  30 minutes. Record audio latency, loss, bitrate, SFU resources, game frame time,
  and interference with movement, chat, building, and wishes.
- [ ] Run required repository and hosted gates before committing implementation.
  Revalidate the final head, then record deployment and production proof.

## Exploration recorded before deferral

The initial local HTTP/WebSocket authorization fixture had three failing route
tests before implementation and three passing tests afterward. It used injected
provider responses and local identities, so it proved neither real audio nor
hosted authentication. A temporary self-hosted fixture was prepared, but actual
audio transport was not verified.

The exploratory routes, tests, and dependency changes were withdrawn when voice
was deferred. This plan is the only intended repository change for the milestone.
The broader virtual-world goal remains open, including global performance and
physical-device acceptance.
