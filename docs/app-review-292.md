# App Review readiness (#292)

Recorded 2026-10-24, at the revision that adds report confirmation and the support
contact. It is stacked on in-app deletion (#666), blocking (#665) and erasure (#661).
It compares what River Oaks does today with the App Review guidelines that #292 names.
Apple's text was read on 2026-10-24 from the
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) and
[Offering account deletion in your app](https://developer.apple.com/support/offering-account-deletion-in-your-app/).

This is an engineering reading, not legal advice and not a promise of approval; Apple
decides. The native iOS host doesn't exist yet (#286), so anything that depends on
the binary is marked **native**.

## Summary

| Guideline | What it asks | Where River Oaks is | Status |
| --- | --- | --- | --- |
| 1.2 | Filter objectionable content | A server-side filter screens town chat, direct messages, groups, events, profiles and usernames before they're stored, on both servers (this change). Voice isn't filtered | Met in source; the list and the mode are Decision 1 |
| 1.2 | Report offensive content, respond in time | Residents can be reported from the roster, including one who has left. A report keeps the quoted text and the reported account's last chat lines, records when it should be answered by, is posted to the moderators' inbox (`MODERATION_NOTIFY_URL`), and stays listed in Settings → Account → Reports until a moderator closes it (this change). Messages, events and groups can't be reported | Met in source; the inbox, its owner and the response time are Decision 2 |
| 1.2 | Block abusive users | The server enforces blocks (#665), except voice. The roster now offers Block/Unblock and Settings → Account lists blocked residents | Integrated in source; fixture verification and native acceptance remain distinct |
| 1.2 | Published contact information | Settings → Account → Support, once `VITE_SUPPORT_CONTACT` is set (this change). Not on the sign-in or waitlist pages | Needs a value; **gap** before approval |
| 5.1.1(v) | Delete the account in the app | In-app deletion behind a default-off flag (#666), webhook erasure (#661) | Met in source, off |
| 5.1.1(v) | Revoke social credentials; no social tokens kept off the device | WorkOS can return the resident's GitHub token, which the server then uses | **Decision** |
| 5.1.2 | Consent before sharing personal data, including with third-party AI | No resident data reaches an AI provider in the hosted game; processors listed | Met in source, disclosures pending |
| 4.8 | An equivalent sign-in beside a third-party one | GitHub and email codes; no option that keeps the email private | **Decision, blocking** (#287) |
| 4.2 | More than a repackaged website | A 3D multiplayer game, but the iOS probe loads the hosted page | Unknown, **native** (#286) |
| 2.5.2 | No downloaded code that changes features | The hosted page supplies the game's code today | Unknown, **native** (#286) |
| 4.7 | Hosted mini apps and plug-ins meet 1.2, 5.1 and age rules | TypeSafe Computer embed (off); World Studio agent (desktop only) | Keep both out of iOS v1 |

## 1.2 User-generated content

What residents create that others see:
- town chat, up to 280 characters with a one-second cooldown (`server/world.js`);
- direct messages between contacts, up to 280 characters (`server/social.js`);
- groups: a name, a description and messages (`server/groups.js`);
- public events: a title of up to 64 characters and a description of up to 400,
  listed for everyone and not hidden by a block (`server/events.js`);
- profiles: tagline, bio, pronouns and interests (`server/profiles.js`);
- usernames, which residents choose; names that pass for Jevica are refused
  (`preview/src/resident-names.js`);
- live proximity voice, when `RIVER_OAKS_VOICE` is on (`server/voice.js`).

Builds are catalog items placed in approved spaces, with no free text. World Studio
drafts stay on the device.

**Filtering. Met in source; the policy is Decision 1.** Every text field is limited in
length and refuses control characters; everything but direct messages also refuses
direction overrides. Apple asks for "a method for filtering objectionable material from
being posted", so a server-side content filter (`server/content-filter.js`) now screens
every field in the list above, apart from voice, before any store sees it:

- **Where.** The chat command at both gateways, before blocks are screened; `send` in
  `social-api.js`; `create` and `send` in `groups-api.js`; `create` in `events-api.js`;
  `save` in `profile-api.js` (tagline, bio, pronouns and each interest); and `setUsername`
  in both waitlist stores. The world and the client are unchanged. A refused write is
  400 with `{ error, reason: 'filtered' }`; a refused chat line is the socket result
  `chat_filtered`. The resident sees "That message can’t be sent here." or "That text
  can’t be used here." (names: "That name can’t be used here.").
- **How it matches.** Whole words and short phrases from `config/content-filter.json`,
  after folding case, accents, look-alike digits and symbols (`k1ll`, `f@g`, Cyrillic
  and Greek look-alikes), zero-width characters inside a word, letters spaced out one
  by one (`k i l l`) and a run-together phrase (`killyourself`). A plain `-s` plural of a
  term matches; other forms are listed on their own. Not folded: letters spaced in
  groups (`ki ll`), repeated letters (`kiiill`) or leetspeak beyond the look-alike table.
  Nothing inside a longer word matches, so ordinary words that contain a term are left
  alone. Text longer than 4,000 characters is refused unscreened rather than passed
  (every field's own cap is far lower). Images aren't screened: residents can't post any.
- **Policy.** `refuse` lists the terms; `mask` names the fields where a match is
  replaced by asterisks (`∗`) instead of refused (never usernames). The shipped list holds
  severe slurs and direct threats, as a starting point. `RIVER_OAKS_CONTENT_FILTER=off`
  turns the filter off; `RIVER_OAKS_CONTENT_FILTER_FILE` replaces the list with a file
  of the same shape, and a missing or malformed file stops the server at start.
- **Tests.** `server/tests/content-filter.test.js` (matching, masking, configuration)
  and `server/tests/content-filter-routes.test.js` (every field over HTTP and WebSocket
  on the town, and on the hosted gateway with Redis).

Voice can't be filtered as it happens; blocking, the device mute and reports cover it.
The filter matches words, not meaning: reports and blocking handle the rest.

**Reports. Met in source.** The roster's **Report** button
(`preview/src/multiplayer-client.js`) sends the socket command
`{ type: 'report', playerId, reason }`, and may add `text`, the line the reporter is
pointing at. Both servers accept `disruption`, `harassment` or `cheating`, about anyone
but the reporter who is connected, who spoke in the town's recent chat (someone who has
left), or who has a username; an id nobody here has had is refused. A blocked resident
can be reported, and can report. The limit is three a minute per reporter, counted
differently: the town counts every attempt, refused ones included; the hosted path
counts saved reports per clock minute, so up to six can land across a minute's end.
The shared path is `submitReport` in `server/moderation-reports.js`.

Each saved report has an `id`, carries `content` (the quoted text, cleaned and cut to
280 characters, and the reported account's last three chat lines, together at most
1,200 bytes), and records `respondBy`, `MODERATION_RESPONSE_HOURS` after it was saved
(24 by default).

| Server | Where a report goes | Test |
| --- | --- | --- |
| Standalone town | A `report` line in `${MODERATION_FILE}.audit.jsonl` (`server/moderation.js`), with `userId` for the reported resident; closed reports in `MODERATION_FILE` | `server/tests/reports.test.js` |
| Hosted | The shared Redis audit list `<prefix>:audit` (`server/redis-security.js`), with `targetId` for the reported resident; closed reports in `<prefix>:reports:closed` | `server/tests/reports.test.js`, with Redis |

**Moderators are told.** After the save, the report is posted as JSON
(`{ type: 'report', id, at, reason, reporter, reported, content, respondBy }`, both
accounts as `{ id, name }`) to `MODERATION_NOTIFY_URL`, with `MODERATION_NOTIFY_TOKEN`
as a bearer token (`server/moderation-notify.js`). The endpoint is whatever reaches the
moderators: a chat tool's incoming webhook, an email relay, a ticket queue. River Oaks
has no outbound email of its own (sign-in codes are WorkOS's), so the provider behind
the URL is Decision 2. Sends are bounded to 20 in ten minutes across all reporters,
time out after five seconds, never follow a redirect, and never change the reporter's
answer: a failed send is logged by report id, and the report stays saved and listed.
Nothing is sent when the URL is unset. The reporter reads "Report saved."; the client
shows the server's text, so its owner's file doesn't change.

Still missing:
- **The button always sends `disruption`** and no `text`. The file is owned by
  `outdoor-residents-admin-controls-20261024`; a reason choice and a quote are for
  that task.
- **Only residents can be reported.** A direct message, a group or a public event
  can't be.
- **Saved reports can be lost unread.** The hosted list keeps the newest 10,000 bans,
  unbans and reports together. The town renames its log to `.previous` at 5 MB,
  replacing the one before. The inbox notice is the copy that outlives both.

**Moderators read reports in the app.** `GET /api/moderation/reports` reads where each
server already saves reports: the town's audit log and the log it rotated at 5 MB, or
the hosted Redis audit list. It returns the newest 200, with both accounts' shown
names, the reported account's id, and whether that account is banned or is staff. The
reporter is sent only as a shown name, which for an account without a username includes
its id. A report about the moderator reading is left out before the newest 200 are
taken, so it doesn't push a row off their list; any other moderator sees it.
Each listed report carries its `id`, `content`, `respondBy` (a report saved before
response targets reads as due 24 hours after it was saved), `overdue`, and `closed`
(`{ at, by }` or null). Open reports come first, newest first, then closed ones.
Settings → Account → Reports shows
them to approved accounts in `MODERATOR_USER_IDS`, up to 30 reads a minute each;
anyone else gets `{ moderator: false }` and sees nothing, even when a request fails. Each
row shows the quoted text and the chat lines as text, when to respond by (or that it is
overdue, or who closed it), and offers Ban…, which asks once, or Lift ban, through the
existing `/api/moderation/ban`, and **Close report**, which posts the id to
`/api/moderation/reports/close` with the session token. A closed report keeps its
line in both logs, is audited as `report_closed`, and is listed last; closing an id
that no saved report has is a 404. A moderator can't ban their own account, and the
ban route refuses to ban a moderator, a waitlist admin or one of Jevica's owner
accounts, so the list offers no Ban for them; lifting a ban on one still works. Tests:
`server/tests/moderation-reports.test.js` (both servers, Redis for the hosted one),
`server/tests/moderation-notify.test.js` (the inbox over a local HTTP server, bounds,
the shared intake), `preview/tests/moderation-reports.test.js` and the routing cases in
`server/tests/vercel-routing.test.js` and `server/tests/hardening-router-admission.test.js`.

**Blocking. Integrated in source.** [Player blocking](player-blocking.md) (#665) is enforced
on the server. It covers chat, gestures, greetings, contacts, direct messages,
profiles, group messages, invitations, travel, private places and Garden campus guest
access, and it holds across reconnects and worlds. Residents can now use Block/Unblock
beside Report in the player roster and manage their blocked list in Settings → Account.
The multiplayer client owns authenticated attachment, reconnect refresh and teardown;
the Account pane offers refresh and reports failures without false success. Session
and attempt fences prevent stale replies or a pending sign-out from rebinding another
session's list. The implementation and fixture evidence are recorded in
`docs/superpowers/plans/2026-10-27-player-blocking-ui-292.md`; live auth, hosted routing,
physical-device and human accessibility acceptance are separate. This integration
does not close this App Review issue or authorize an iOS release. Voice isn't covered:
the device mute is the only control today
([Decision 1 there](player-blocking.md)).

**Contact. Needs a value, and a gap before approval.** `VITE_SUPPORT_CONTACT`, set at
build time, is an email address or an https link (`preview/src/support-contact.js`).
It's shown in Settings → Account → Support. Without a value, or with an example
domain, nothing is shown. Settings exists only once a resident is approved and
in the world, so signed-out, waitlisted, rejected and banned residents can't see it.
A rejected resident reads "Contact the district team if you think this is a mistake."
with no contact given. Those pages are in `preview/src/access-entry.js`, owned by
`touch-network-288-290`, which can call `createSupportContact` there. App Store
Connect needs a support URL too (Decision 3).

## 5.1.1(v) Account deletion

- **Erasure (#661).** When WorkOS sends `user.deleted`, every store and world forgets
  the account, apart from reports, bans and the moderation audit
  ([privacy data inventory](privacy-data-inventory.md)). Each request is recorded and
  run again a minute later, for a write already in flight, and retried until it
  succeeds.
- **In-app deletion (#666).** Settings → Account → Delete account deletes the WorkOS
  user, signs out, runs erasure and clears what the device keeps
  ([account deletion](account-deletion.md)). It's off until
  `RIVER_OAKS_ACCOUNT_DELETION=1`, and with WorkOS it also needs
  `WORKOS_WEBHOOK_SECRET`, and on Vercel `CRON_SECRET` and the production deployment.

Apple asks apps to say what's kept and how long the rest takes. The page says the
account is deleted at once, and that anything left is removed by the erasure's
second run and retries, within minutes when every store answers. The policy has to say what stays: reports, bans and the moderation audit
(inventory Decision 3).

**Social credentials. Decision.** Apple says an app must let people revoke
social-network credentials from inside it, must not keep social-network tokens off
the device, and may use them only to connect from the app while it's in use. With
WorkOS's "Return GitHub OAuth tokens" setting on, WorkOS hands the resident's GitHub
token to the server at sign-in. The server then calls GitHub with it to read the
username (`server/auth.js`, `server/github-names.js`). River Oaks keeps the GitHub
id, the login and the check time, never the token. But WorkOS holds the token off
the device, and the server, not the app, uses it.

Whether GitHub counts as a social network here is a reading of Apple's text. Either
way, the safer setting is to turn token return off. The code already falls back to
`GITHUB_TOKEN`, or an unauthenticated lookup by GitHub id. In-app revocation is then
Delete account; a resident can also revoke the GitHub app from GitHub's settings.
Decision 7.

**Native.** The iOS host has to reach Settings → Account. If Sign in with Apple is
added (4.8), deletion must also revoke the Apple tokens through Apple's REST API.

## 5.1.2 Data use and sharing

The [inventory](privacy-data-inventory.md) lists every processor. No analytics,
advertising or tracking code exists, so App Tracking Transparency isn't needed
unless the native host adds an SDK.

No resident's personal data goes to an AI provider in the hosted game:
- **The chauffeur** (admin only) sends vehicle state to TypeSafe, with no account id.
- **The World Studio agent** runs only in the desktop app, through the resident's own
  Claude or Codex command-line tool.
- **The Python bridge** (TypeSafe, ElevenLabs) is local development.

Any future feature that sends a resident's data to an AI provider needs that
resident's explicit permission first.

Problem reports leave the device only when the resident presses **Send**. They're
redacted, and the screenshot is optional ([problem reports](debug-reports.md)).

Still Val's: the privacy policy and the App Store privacy answers, drafted from the
inventory.

**Native.** The privacy manifest, required-reason APIs and the signatures of any
SDKs in the archive (#286, #293).

## 4.8 Login services

The web offers email codes (WorkOS) and GitHub (WorkOS). The iOS probe accepts GitHub
only ([iOS feasibility](ios-feasibility.md#origin-and-auth-investigation)). GitHub is
a third-party login. So Apple also asks for an equivalent option that collects only
name and email, lets the resident keep their email private, and doesn't track them
for ads.

Email codes collect only the email and don't track, but they can't keep the email
private. Two readings:
- **Add Sign in with Apple**, or another login that hides the email. WorkOS lists
  Apple as a provider; check that this account can use it. Deletion then has to
  revoke Apple tokens.
- **Offer only email codes on iOS.** River Oaks' own account system may then fall
  under the exception for apps that use only the company's own sign-in.

Decision 4, owned by #287.

## 4.2 Minimum functionality and 2.5.2 downloaded code

River Oaks is a 3D multiplayer town: movement, chat, voice, games and places. It's
more than a website in function. Today the iOS probe loads the hosted
`https://typesafe.place/play`, so the game's JavaScript comes from the server and
changes with every deploy:
- **4.2** warns against apps that are a website in a wrapper.
- **2.5.2** forbids downloading code that adds or changes features.

Unknown. The route in [iOS feasibility](ios-feasibility.md) that bundles the client
in the app, and loads only data and assets from the server, answers both more
safely. It needs the origin, cookie and CSRF contract that #286 and #287 own.

4.2.3(ii) asks an app to tell residents the size of a large first download. The
world's models and textures come from the network, and their size on a phone is
unmeasured (#286).

## 4.7 Hosted software and plug-ins

Two features run software that isn't part of River Oaks' own code:
- **TypeSafe Computer** in the office desk ([office Computer embed](office-computer-embed.md)).
  It's hosted elsewhere, and the deployed frame policy blocks it today. On iOS it
  would need its own filtering, reporting and blocking, no native APIs, no data
  shared without consent, and an age-rating check (4.7.1–4.7.5).
- **The World Studio agent** runs only in the desktop app, so it doesn't reach iOS.

Recommended: leave Computer out of iOS v1 (Decision 5).

## Before submission

| Item | Owner | Status |
| --- | --- | --- |
| Privacy manifest, required-reason APIs, SDK signatures in the archive | #286, #293 | Not started; no binary |
| App Store privacy answers and the privacy policy | Val | Draft from the inventory |
| Age rating: chat and voice with other residents | Val | Not answered |
| Reviewer access: an approved waitlist account that signs in without a live inbox, with no public bypass | #293 | Not started |
| Review notes: where Delete account, Report, Support and the moderators' Reports list are, and Block once it's wired in | #293 | This page lists them |
| Support URL in App Store Connect | Val | Needs the contact |
| Deletion on in production, with `user.deleted` delivery checked | Val | Off |
| Business model | Val | No purchase code exists; record that v1 is free, if it is |

## Decisions for Val

1. **Content filter.** The filter is built and on by default. Decide the list in
   `config/content-filter.json` (keep, cut or extend the shipped slurs and threats) and
   whether any field, chat in particular, should mask instead of refuse (`mask`).
   Recommended: keep refusing, keep the list short, and let reports and blocking
   handle the rest.
2. **Moderation.** Who reads reports, how fast, and where a threat or child-safety
   report goes. In the US, a provider that finds apparent child sexual abuse material
   must report it to NCMEC. The routing is built: set `MODERATION_NOTIFY_URL` (and
   `MODERATION_NOTIFY_TOKEN`) to whatever reaches the moderators, since River Oaks
   sends no email of its own; a chat tool's incoming webhook is the least to set up,
   an email relay (a Marketplace provider, or a Zap that mails) if email is wanted.
   Set `MODERATION_RESPONSE_HOURS` to the promised response time (24 by default; the
   list marks a report overdue past it). Recommended: name an owner and keep the
   24-hour target. Name at least two moderators: a report about a moderator is shown
   only to the others, so with one, nobody sees it in the app.
3. **Support contact.** The address or page for `VITE_SUPPORT_CONTACT` and App Store
   Connect.
4. **Sign-in on iOS (4.8).** Add Sign in with Apple, or offer only email codes there.
5. **Hosted software on iOS.** Bundled or hosted game code (2.5.2, 4.2), and
   whether Computer ships in v1. Recommended: bundle, and leave Computer out.
6. **Age rating and business model.** The rating answers, and whether v1 is free.
7. **GitHub tokens (5.1.1(v)).** Recommended: turn off "Return GitHub OAuth tokens"
   in WorkOS, so no resident's GitHub token leaves GitHub and WorkOS.
