# Player blocking

Added 2026-10-24 for #292 (App Review guideline 1.2: a way to block abusive users).
The server enforces every block. A client can ask for one, but never decides what a
block hides. The coverage below is a proposal for Val.

## What a block does

A resident blocks another from where they meet: someone in the same world, or a
contact. A block counts in both directions, and only the resident who made it can
lift it. Each account can hold up to 200 blocks.

| While a block lasts | Enforced in |
| --- | --- |
| Neither receives the other's town chat lines, gestures or greetings with anyone, nor anyone's greeting toward the other. Lines already on screen when a socket joins are filtered too | `viewFor` in `server/blocks.js`, applied per viewer in `server/app.js` and `server/distributed-app.js` |
| The contact ends, with its direct messages and invitations. A new contact request, a direct message, and world or place invitations are refused | `server/blocks-api.js`, `server/social-api.js` |
| Neither can open the other's profile | `server/profile-api.js` |
| A group they share stays, without the other's messages | `server/groups-api.js` |
| A pending greeting (handshake or dance) or game invitation between them ends. Neither can greet the other, invite them to darts or axe throwing, or travel to them. A table game invitation from one reaches the other's view as nothing, while its sender still sees it waiting | `separate` in `server/world.js` and the game modules; `screenCommand` and `viewFor` in `server/blocks.js` |
| Private homes and offices: only Jevica's accounts invite, so a block between one of them and a resident ends the resident's invitations and steps them out. Jevica can't invite that resident again until the block is lifted | `separate` in `server/world.js`; `screenCommand` in `server/blocks.js` |
| Garden campus guest access, where campus operators are configured: a grant between them ends, whichever of them is the tenant, and the guest is walked out of the suite. Neither can grant the other while the block lasts | `separate` in `server/world.js` and `server/campus-leases.js`; `screenCommand` in `server/blocks.js` |

Lifting a block restores chat, gestures, greetings, profiles and group messages. Contacts
and invitations don't come back by themselves; either resident can ask again. Unblocking
first removes any contact still between them. A contact can't begin during a block, so a
contact left by a failed removal goes before the block lifts.

The blocked resident is never told, except through Jevica's invitations and campus guest
grants (Decisions 2 and 4). Every other refusal is the one given for a resident who
isn't here or isn't a contact. Contact actions, greetings, darts and axe invitations,
and travel toward a blocked resident are each asked about a resident who is never
present. The usual checks then answer, in their usual order, even for a malformed
request from a modified client. A campus grant toward a blocked resident names its
sender instead, so it gets the world's answer for that, after the world's own lease,
tenant, status and version checks: a tenant is told that resident can't be their guest,
and anyone else gets the refusal they would get anyway. A retry of a grant first sent
before the block is answered as a conflicting operation. A grant or invitation checked
just before a block was stored can reach the world after the block ended access; once
it succeeds the server checks again and ends it (`grantedPeer` in `server/blocks.js`,
`server/tests/blocks-campus-race.test.js`). Its sender's reply still shows the grant;
the next view doesn't. A failed check is logged as `block_recheck_failed`, and the grant
stands: without a known block nothing is separated. `server/tests/blocks-api.test.js` and
`server/tests/blocks-world.test.js` compare the two answers. The resident who made the
block sees it in their blocked list (`POST /api/blocks/list`). There is no separate
whisper: private messages are contact messages, covered above.

Not covered: public event listings, landmarks and builds stay visible to everyone. A
table game already in progress between them continues until one stands up. A campus
operator can still offer a lease, under the operator's name, to a resident who blocked
them. Moderation reports work in both directions.

## Routes

`POST /api/blocks/list`, `/api/blocks/add` and `/api/blocks/remove`, with `{ peerId }`
for add and remove. Like every mutation, they need a signed-in, approved, unbanned
session, the same origin and the CSRF token. Writes are limited to 12 a minute per
account. A resident who is neither in the world nor a contact can't be blocked: add
answers 404. The hosted deployment routes them through `vercel.json` and
`server/vercel-routing.js`, and the Vite dev server proxies them.

The block is kept once it's stored. If the contact can't be ended right after, add
answers 503 and asking again ends it. Invitations in the worlds end anyway, and until
then the contact stays out of both residents' contact lists and can't be invited to a
group. If ending invitations fails in a world, that's
logged without account ids and the block still stands. New invitations are refused on
every request anyway.

## In the client

`preview/src/player-blocks.js` holds the block list and two controls. One is a
Block/Unblock button in each roster row, beside Report: Block asks once more before it
takes effect, Unblock acts at once. The other is a blocked-residents list for
Settings → Account. `preview/tests/player-blocks.test.js` covers both. The module
isn't wired into the client yet, because `preview/src/multiplayer-client.js` and
`preview/src/main.js` belong to another task. Wiring it takes four calls:

1. When the town client signs in, attach its request function, then call `refresh()`;
   call `attach(null)` on sign-out:

   ```js
   sharedBlockList().attach((action, data) => api(`/api/blocks/${action}?world=${encodeURIComponent(worldId)}`,
     { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data ?? {}) }));
   ```
2. After the Report button, call `blockUI.rosterButton(row, player)`.
3. Where rows are removed, call `blockUI.forgetRow(id)`.
4. In the Account pane of `preview/src/sidebar.js`, add
   `group('Blocked residents', [createBlockedPlayersSettings({ blocks: sharedBlockList() })])`.

Until then a block can only be made through the routes.

## Storage and how a block reaches every socket

The hosted path keeps blocks in Redis with no expiry, like contacts. Each account has
a list (`blocks:v1:list:<sha256>`, peer id to the name shown), a reverse index
(`blocks:v1:by:<sha256>`) and a version counter (`blocks:v1:version:<sha256>`). The
standalone town keeps them in `BLOCKS_FILE` (default `.runtime/blocks.json`). That file
sits beside the waitlist and moderation files. It's written only when a list changes,
before the change applies, through a temporary file and an atomic rename, with mode
0600, so a failed write changes nothing. Account erasure removes the account's list,
index and version, and the account's place on everyone else's lists.

A socket loads the hidden set of its account before its first frame. A change made
through the same server reaches both residents' sockets there at once. A socket still
joining is included, and a read that started earlier never replaces a later one.
Every other socket checks its account's version every five seconds and reloads the
set only when the version moved. That includes sockets on another gateway, in another
world, or after a restart. The reverse index has no limit, so an account blocked by
many residents reads a long set when it joins and after each change.

## Decisions for Val

1. **Voice.** A block doesn't yet touch proximity voice. The client can already mute
   any player, and that mute is kept on the device. Options: leave voice to that mute;
   or have the server refuse to place blocked residents in the same LiveKit room
   space. The second needs voice-room changes and a new test.
2. **Blocking Jevica.** A resident can block one of Jevica's accounts, and that ends
   their office and home invitations. When Jevica then tries to invite that resident,
   the invitation is refused, so she can infer the block. A malformed invitation from
   her gets the same refusal, before the world's own validation. These invitations
   can't be made indistinguishable: inviting a resident who isn't present succeeds.
   Some services don't let residents block staff at all. Moderation and reports are
   not affected either way.
3. **Reach of a block involving Jevica.** It ends invitations in every world that is
   loaded on the server that receives it or has a stored checkpoint, as account erasure
   does. A world that can't be loaded at that moment keeps the old invitation until it's
   revoked; no new one can be made. Worlds are reached together, so the request waits
   for the slowest one, and each world reached stays loaded on that server, as with
   erasure. A block between two residents reaches the worlds loaded on that server and
   the default world, which serves the campus, if it is loaded or stored. A greeting or
   game invitation needs both of them in the world where the block is made; campus guest
   access doesn't.
4. **Campus grants.** A refused grant tells a tenant that this resident can't be their
   guest, as a refused invitation tells Jevica. A grant to an account that isn't present
   succeeds, so the two can't be made indistinguishable. Recommended: keep, as for
   offices and homes.
