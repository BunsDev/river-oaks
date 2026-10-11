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
Jevica can publish either a copy of the bundled River Oaks geography or a
creator region package with its own terrain, roads, buildings, trees, spawn,
and named places. See [Creator regions](creator-regions.md) for the package
format and live revision rules. Live building and wishes remain Jevica-only.
Guests can visit and interact but cannot publish, build,
or grant wishes.

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
The catalog uses `{REDIS_NAMESPACE}:worlds:v1`; compiled creator regions use
`{REDIS_NAMESPACE}:regions:v1`. Publishing writes the metadata and region in
one Redis transaction. For production, use the same
`REDIS_NAMESPACE` across deployments that should share authentication and
published worlds. The gateway loads each room on demand and routes HTTP and
WebSocket requests by world ID.

Private world checkpoints are version 2 and bind the ID in their checksum.
Only the default world accepts a valid legacy version 1 world checkpoint or
room wrapper. A checkpoint from another world fails recovery without changing
the running world. The district fingerprint still guards geography
compatibility. Applying a creator region draft explicitly migrates its room
checkpoint and switches the catalog and room in one fenced Redis commit.
The bundled district still needs an explicit migration before replacement.
A missing or altered region package fails room load
instead of substituting River Oaks.

Run `pnpm run test:server` with a test Redis instance and `pnpm run test:shared`
for the isolated-room, publishing, and browser admission journeys. These tests
cover local behavior, including a creator geography browser journey; they do
not measure global latency.
