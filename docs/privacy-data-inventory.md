# Privacy data inventory

Recorded 2026-10-24 for #292 at the revision that adds account erasure. It lists
what River Oaks keeps about a resident, where, for how long, and what deleting the
account does to it. Line references are to that revision. This is an engineering
inventory, not a privacy policy or legal advice; the published policy is Val's.

Account deletion starts with the signed WorkOS `user.deleted` webhook
(`server/workos-deletion.js`), which calls `createAccountErasure`
(`server/account-erasure.js:10`). It is wired in `server/town.js:151` (standalone)
and `server/redis-backend.js:93` (hosted). The order is fixed:

1. The character tombstone (`server/character-store.js:220`). From then on the
   account cannot sign in or join a world.
2. Every session is revoked and every socket closed (`server/auth.js:357`,
   `server/redis-auth.js:489`).
3. Every store below, and every world in the catalog, erases the account in
   parallel. If any step fails, the webhook answers 503 and WorkOS retries the whole
   run; repeating a finished run changes nothing.

## Server stores

"Erased" means the account's records are deleted and the account is removed from
other residents' records. "Kept" rows are deliberate and listed under Decisions.

| Data | Store (memory · Redis) | Retention without deletion | On deletion |
| --- | --- | --- | --- |
| Character drafts, revisions, selection | `server/character-store.js:236` · `:255` | Until deleted | Replaced by the tombstone `{deleted:true}`, keyed by a SHA-256 of the id |
| Sessions, CSRF tokens, sign-in state | `server/auth.js:73` · `server/redis-auth.js:218` | 7 days (`server/auth.js:13`, `server/redis-auth.js:12`) | Erased |
| Stored GitHub login | `server/github-names.js:79` · `:91` | Until deleted | Erased (`:87`, `:98`) |
| Email-code sign-in state | `server/magic-auth.js:88` | 10 minutes (`:6`) | Lapses; never names the account after use |
| Profile: tagline, bio, pronouns, interests; shops already visited | `server/profiles.js:36` · `:85` | Until deleted | Erased (`:59`, `:107`) |
| Contacts and direct messages | `server/social.js:41` · `:150` | Until deleted | Erased from both sides of every pair (`:108`, `:200`) |
| Groups: owned, memberships, invitations, messages | `server/groups.js:36` · `:212` | Until deleted | Owned groups deleted; elsewhere membership, invitations and messages removed, including groups already left (`:104`, `:255`) |
| Events hosted, RSVPs | `server/events.js:31` · `:119` | Until the event ends | Hosted events deleted; RSVPs removed (`:60`, `:142`) |
| Presence (world, last seen) | `server/presence.js:27` · `:86` | 90 seconds (`:4`) | Erased (`:66`, `:117`) |
| Saved designs | `server/design-library.js:52` · `:93` | Until deleted | Erased (`:78`, `:132`) |
| Office desk tasks | `server/office-desk.js:46` · `:62` | Until deleted | Erased (`:44`) |
| Look (avatar preferences) | `server/avatar-preferences.js:28` · `:91` | Until deleted | Erased (`:54`, `:107`) |
| Ride totals and leaderboard name | `server/cycling-miles.js:24` · `:60` | Until deleted | Erased (`:44`, `:93`) |
| Personal landmarks, per world | `server/landmarks.js:16` · `:64` | Until deleted | Erased in every world (`:41`, `:89`) |
| Problem reports (description, diagnostics, reporter) | `server/debug-reports.js:39` · `:59` | 50 newest, 30 days (`:7`) | The account's reports deleted (`:47`, `:76`) |
| Waitlist request: name, email, username; invites; audit | `server/waitlist.js:62` · `:406` | Until deleted | Erased; others' records keep an `erased-account` marker where the account decided or invited (`:239`, `:497`) |
| Voice leases | `server/voice.js:57` · `:162` | While in a call | Revoked and removed from the room (`:95`, `:196`) |
| Workplace tasks and drafts | `server/workplace.js:25` · `:81` | Workplace retention limit | Erased (`:477`); a busy workplace fails the step so it is retried |
| World state: player, chat lines, builds, inventory, wishes, home guests, office grants, campus leases, wanted stars, screenings, lantern walk, game tables | `server/world.js:117`, checkpointed by each room | Chat: last 40 lines (`:49`); builds until removed | Forgotten in every world (`server/world.js:591`). Builds others sit on are anonymized |
| Moderation bans, reports and audit | `server/moderation.js:5` · `server/redis-security.js:112`, `:120` | Until removed by an admin | Kept (Decision 3) |
| Rate-limit buckets and join tickets | `server/redis-security.js:81`, `:100` | At most 24 hours; tickets 60 s (`server/ticket-policy.js:7`) | Lapse |
| Crime cooldowns, attack receipts, strikes, fights and evades; police pursuits, surrenders and holds, per world | `server/crime.js:75`, `server/police.js:29` | Receipts 60 s (`server/crime.js:12`); cooldowns, finished strikes and evades within seconds (`:11`, `:16`) | Forgetting the account first runs its departure, which ends its fight and every police pursuit or hold at once. Wanted stars are cleared at once; the cooldown and a cancelled strike lapse within seconds |
| Room replies | `server/redis-room.js:18` | 15 seconds | Lapse |

## Client and desktop storage

The web client uses `localStorage`, `sessionStorage` and cookies only. It has no
IndexedDB, Cache Storage, script-readable cookie or service worker. Server erasure
cannot reach a device. Today sign-out (`preview/src/access-entry.js:434`,
`preview/src/multiplayer-client.js:392`) clears none of the per-account keys
below. Clearing them at sign-out and after in-app deletion is #292 increment C.

| Key | Where | Holds | Per account |
| --- | --- | --- | --- |
| `river-oaks-character-favorites-v2:<user id>` | `preview/src/character-studio.js:39` | Saved character looks | Yes, keyed by the account id |
| `river-oaks-voice` | `preview/src/voice-preferences.js:4` | Microphone choice, push-to-talk, muted player ids (up to 256) | Yes, other residents' ids |
| `river-oaks-graphics-reload` (session) | `preview/src/graphics-reload-state.js:3` | Settings tab and an unsent chat draft across one reload; read once, 10 minutes | Yes, the draft |
| `river-oaks-world-studio-v1` | `preview/src/studio/document.js:9` | World Studio region draft | Authored content |
| `river-oaks-creator-region-draft-v1[:<world>]` | `preview/src/region-draft.js:7` | Region drafts (admin) | Authored content |
| `river-oaks-studio-designer-v1` | `preview/src/studio/designer-panel.js:3` | Studio project id, brief, familiar's name | Authored content |
| `river-oaks-entered`, `river-oaks-signing-in` | `preview/src/access-entry.js:145`, `:71` | Entry and sign-in redirect flags | Device |
| Theme, graphics, debug layers, panels, guides, sounds | `preview/src/theme.js:11`, `preview/src/render-quality.js:13`, `preview/src/debug-tools.js:28`, `preview/src/sidebar.js:76`, `preview/src/play-dock.js:22`, `preview/src/walking-ui.js:214`, `preview/src/salon-guide-content.js:168` | Display preferences | Device |
| Cookie `river_oaks_session` (HttpOnly) | `server/auth.js:10` | Sealed session | Yes; expired at sign-out (`server/auth.js:335`) |
| Cookie `river_oaks_gate` (HttpOnly) | `server/asset-gate.js:10` | Signed asset pass | Yes; not cleared at sign-out, lapses with its TTL |
| Sign-in state cookies (HttpOnly) | `server/auth.js:11`, `server/magic-auth.js:5`, `server/email-verification.js:3` | One sign-in attempt | Cleared after use |

A problem report sends the names and lengths of the `localStorage` keys, never
their values (`preview/src/debug-report.js:216`).

The desktop shell keeps the same web storage in its `River Oaks` user-data folder
(`desktop/main.js:33`), plus the window position (`desktop/main.js:35`), the
Studio familiar's files (`desktop/main.js:205`) and an agent workspace folder
(`desktop/main.js:224`). Nothing in `desktop/` clears them; that shell is outside
this change.

## Processors

| Processor | Receives | Configured by | Where | Reached by deletion |
| --- | --- | --- | --- | --- |
| WorkOS (AuthKit) | Email address, sign-in codes and tokens; sends the sign-in emails | `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_WEBHOOK_SECRET` | `server/auth.js:223`, `server/magic-auth.js:153`, `server/redis-auth.js:356` | Its `user.deleted` event starts erasure. No code here deletes the WorkOS user yet; in-app deletion (increment C) will |
| GitHub API | The GitHub id of a GitHub sign-in, to read the public login | `GITHUB_TOKEN` | `server/github-names.js:42` | Nothing is stored there by River Oaks; the local copy is erased |
| LiveKit | A random participant identity, a room name, voice audio | `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RIVER_OAKS_VOICE` | `server/livekit-client.js:34`, `server/voice.js:257` | Rooms are live only; erasure removes the participant. No recording code exists |
| Cloudflare Turnstile | A challenge token; the browser loads Cloudflare's script | `TURNSTILE_SECRET_KEY`, `VITE_TURNSTILE_SITE_KEY` | `server/turnstile.js:7`, `preview/src/access-entry.js:192` | Nothing stored by River Oaks |
| Redis host | Every Redis store above | `REDIS_URL`, `REDIS_NAMESPACE` | `server/redis-backend.js:37` | Yes, the erasure steps |
| Vercel | Every hosted request (address, cookies) | — | `vercel.json`, `middleware.js` | Platform logs; not reachable from code |
| TypeSafe | Chauffeur vehicle state (admin only); local bridge game state | `TYPESAFE_API_KEY` | `server/chauffeur.js:72` | No account id is sent |
| ElevenLabs (local bridge) | Driver lines of up to 480 characters | `ELEVENLABS_API_KEY` | `src/river_oaks/elevenlabs_voice.py:68` | No account id is sent |
| Google Fonts | Address and browser on the landing page only | — | `landing-page/index.html:16` | No |

There is no analytics or error-reporting service, and no other email sender.

## Gaps

- The lantern walk's record round keeps lamplighters' display names with no
  account id, so erasure cannot attribute them (`server/lantern-walk.js`). It is
  one bounded record.
- A write authorized just before revocation can land after its store's erase step
  and leave one record. In-app deletion (#292, increment C) narrows this by
  erasing again after the provider deletion.
- Campus operators are staff ids configured in the environment, not resident data.
- Wish thank-you lines name the granting account, and only Jevica's owner accounts
  can grant wishes. Erasing one of them removes the lines with its display name,
  including any from another owner account with the same name.
- If LiveKit is unreachable when the account is erased, the voice lease still goes
  and the voice sweep removes the participant later (`server/voice.js:363`).
- The hosted world step loads each world that has a checkpoint; a world that
  cannot load fails the step, and WorkOS retries the whole run.
- A world owner that lost its lease can still hold ride metres it has not banked,
  and sends them when it shuts down. Erasure covers the current owner only.

## Decisions for Val

1. **The character tombstone.** It stores only a SHA-256 of the account id and
   `deleted:true`, so a replayed or delayed event cannot bring the account back.
   Recommended: keep.
2. **Short-lived data** (rate limits, tickets, email codes, room replies) lapses
   within 24 hours and is not erased early. Recommended: keep, and say so in the
   policy.
3. **Bans and the moderation audit.** They are kept so that a report or ban
   survives the reported account's deletion. A new sign-up gets a new WorkOS id,
   so a deleted and banned account can return. Recommended: keep the audit, and
   decide whether to add a hashed ban list keyed by email.
