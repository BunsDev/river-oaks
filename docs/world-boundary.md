# World identity boundary

The first platform extraction gives each running town an explicit world ID and
protocol version. `river-oaks` is the default ID. An ID is a lowercase slug
of at most 48 characters, such as `garden-2`. Configure a process with
`WORLD_ID=garden-2`; visitors use `?world=garden-2` in that deployment's URL.
An alternate world currently uses the same bundled River Oaks geography and
rules. Creator uploads, runtime region publishing, and routing many worlds
through one process are future work.

The ticket request, WebSocket admission, and public snapshots carry the world
ID. The browser checks the returned ID and protocol version before admitting a
snapshot. A missing world parameter is accepted only by the default town, so
existing River Oaks links continue to work. A mismatched world fails at the
ticket boundary; the client shows a connection gate. Production authentication,
session revocation, bans, and rate limits remain shared across worlds in a
deployment.

Redis room keys use `{REDIS_NAMESPACE}` for the default world and
`{REDIS_NAMESPACE:world:<id>}` for another world. Account landmarks use the
same per-world suffix. This keeps room presence, chat, creations, wishes,
commands, and private landmarks separate while a player can use the same
account in two worlds. A socket ticket is consumed only for its issuing world.
For production, use the same `REDIS_NAMESPACE` for deployments that should
share authentication, and a separate world ID for each room instance.

Private world checkpoints are version 2 and bind the ID in their checksum.
Only the default world accepts a valid legacy version 1 world checkpoint or
room wrapper. A checkpoint from another world fails recovery without changing
the running world. The district fingerprint still guards geography
compatibility; replacing the bundled district needs an explicit migration.

Run `npm run test:server` with a test Redis instance and `npm run test:shared`
for the isolated-room and browser admission journeys. These tests prove
world separation locally; they do not measure global latency or prove a
creator can publish a new world yet.
