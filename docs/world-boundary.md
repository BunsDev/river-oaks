# World identity boundary

Each shared town has an explicit world ID and protocol version. `river-oaks`
is the default ID. An ID is a lowercase slug of at most 48 characters, such
as `garden-2`. Jevica can publish up to 16 additional worlds from the Explore
panel. A published world has a shareable `?world=<id>` URL and a separate
room on the same origin. Publishing requires the server-confirmed Jevica
identity, a valid session, origin, and CSRF token. The Redis catalog persists
across processes; the standalone development catalog lasts for one process.
`WORLD_ID` can still make a configured alternate world available without
publishing it; visitors use `?world=<id>` to join that world.
Published worlds currently use the bundled River Oaks geography and rules.
Creator-uploaded geography and region editing remain future work.

The ticket request, WebSocket admission, and public snapshots carry the world
ID. The browser checks the returned ID and protocol version before admitting a
snapshot. A missing world parameter goes to River Oaks, so
existing River Oaks links continue to work. Unknown or invalid worlds fail
at the router or ticket boundary; the client shows a connection gate.
Production authentication, session revocation, bans, and Redis rate limits
remain shared across worlds in a deployment.

Redis room keys use `{REDIS_NAMESPACE}` for the default world and
`{REDIS_NAMESPACE:world:<id>}` for another world. Account landmarks use the
same per-world suffix. This keeps room presence, chat, creations, wishes,
commands, and private landmarks separate while a player can use the same
account in two worlds. A socket ticket is consumed only for its issuing world.
The catalog uses `{REDIS_NAMESPACE}:worlds:v1`. For production, use the same
`REDIS_NAMESPACE` across deployments that should share authentication and
published worlds. The gateway loads each room on demand and routes HTTP and
WebSocket requests by world ID.

Private world checkpoints are version 2 and bind the ID in their checksum.
Only the default world accepts a valid legacy version 1 world checkpoint or
room wrapper. A checkpoint from another world fails recovery without changing
the running world. The district fingerprint still guards geography
compatibility; replacing the bundled district needs an explicit migration.

Run `npm run test:server` with a test Redis instance and `npm run test:shared`
for the isolated-room, publishing, and browser admission journeys. These tests
cover local behavior; they do not measure global latency or creator geography.
