# Shared voice: LiveKit Cloud setup and live acceptance

The shared-voice code is complete on `main`: the voice service, the LiveKit
client, the reconciler, the browser voice UI, spatial audio and the desktop
microphone permission. Turning it on for a deployment needs a LiveKit Cloud
project and four settings on that environment, then a two-browser acceptance.
This page is the checklist for that work. It is written so it can be handed
to a person or an agent as a task; read [multiplayer](multiplayer.md#shared-voice)
and [the voice plan](superpowers/plans/2026-10-13-shared-voice.md) first, and
follow the repository `AGENTS.md` (task register, worktrees, no secrets in
logs or commits).

## 1. Create the LiveKit Cloud project

1. Sign in at <https://cloud.livekit.io> and create a project for the
   environment you are enabling (one project per environment; production gets
   its own). A name like `river-oaks-preview` keeps the sessions list readable.
2. In the project's settings, note the project URL. It looks like
   `wss://<project>-<id>.livekit.cloud`. The server accepts only a bare
   `wss://host[:port]/` URL with no path or query
   (`server/livekit-client.js`, `URL_PATTERN`).
3. Create an API key. LiveKit shows the secret once. Keep the key and secret
   in a password manager and in the deployment's environment only. They must
   never appear in chat, a file in the repository, a log, a pull request or an
   issue.
4. Leave the project's defaults. The server creates rooms on demand, named
   `<namespace with ":" replaced by ".">.<worldId>.<space>`, and the sweep
   deletes empty ones; no webhooks, egress or SIP are needed.

## 2. Set the environment

On the deployment (Vercel: `vercel env add <NAME> preview`, or the dashboard),
for the **preview** environment first:

| Variable | Value |
| --- | --- |
| `RIVER_OAKS_VOICE` | `on` |
| `LIVEKIT_URL` | the `wss://…livekit.cloud` URL from step 1.2 |
| `LIVEKIT_API_KEY` | the key from step 1.3 |
| `LIVEKIT_API_SECRET` | the secret from step 1.3 |
| `RIVER_OAKS_VOICE_NAMESPACE` | leave unset on the hosted gateway (defaults to `REDIS_NAMESPACE`) |

`CRON_SECRET` already exists; the per-minute `/api/voice-sweep` cron in
`vercel.json` uses it. Do not add any `VITE_*` variable for voice: the browser
never receives the key or secret, only short room-scoped tokens from
`/api/voice/*`.

Redeploy after changing the environment so the function picks the values up
(push an empty commit to a scratch branch, or redeploy the latest preview).
Confirm the four names are present with `vercel env ls preview`; never print
values.

## 3. Verify on the preview

1. Open the preview, sign in with two different accounts in two browsers (or
   a browser and a private window), and walk both into the same outdoor space
   of the district.
2. The walking console offers **Join voice** (Y). "Voice unavailable" means
   the function did not see all three LiveKit settings: check the names and
   that the deployment is newer than the environment change. A 503 from
   `/api/voice/join` means the URL failed the `wss://` rule or the key and
   secret do not match.
3. Join from both accounts, allow the microphone, and speak. Each side hears
   the other, and speech pans and attenuates with distance. Mute (M) and
   push-to-talk work. When one account leaves, the other hears nothing. Walk
   one account indoors: the pair splits into different rooms (interior versus
   outdoor space) within a few seconds.
   On the plaza, take the music stage (X) with one account while the other
   stands at the far side of the plaza. The performer stays clearly heard: full
   volume within 14 m of the stage, fading to silence at 40 m. Ordinary speech
   is silent by 25 m (`voiceReach` in `preview/src/voice-spatial.js`).
4. In LiveKit Cloud's sessions list, rooms appear with the naming above and
   empty rooms disappear within about two minutes of the last leave.

## 4. Record the acceptance

1. Work in a worktree from `main` on a branch such as
   `feat/voice-acceptance-<date>` and claim a task in the register
   ([workflow](project-management/workflow.md)). Earlier voice tasks are
   `shared-voice-livekit`, `shared-voice-reconciler`, `shared-voice-client`,
   `shared-voice-spatial` and `shared-voice-desktop`.
2. Write the measured results into `data/reports/voice-revocation.json`: the
   time from a leave or revoke to the peer being removed. The targets are
   about 2 s with a live lease holder and up to about 127 s with no instance
   alive for the world. Add a dated section to the voice plan listing the
   environment used, the account types, what was heard and the room names
   seen. The report must not contain the key, the secret or the project host.
3. Open a pull request with that evidence and land it with
   `pnpm run land <pr> --owner "<session>"`, the shared lander, not a direct
   merge.
4. Commits are signed and carry only the repository's provenance trailer; no
   model or vendor is credited as an author.

## Guardrails

- Diagnose settings by name and length only; never read a secret back.
- Do not enable `RIVER_OAKS_VOICE=on` in production in the same change. That
  decision follows the acceptance report.
- If a sign-in to LiveKit or the deployment platform needs an interactive
  step, stop and ask the account owner; do not work around a login.

Report back with: the deployment used, the variable names set (never values),
the two-browser results step by step, the measured revocation times, the pull
request number, and anything that did not work.
