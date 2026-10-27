# Activating Bayou Market Commons

This runbook covers switching the shared town to the Bayou Market Commons revision (`east-garden-commons-market-1`), watching it, and rolling it back. It follows the revision rollout in [garden-campus.md](garden-campus.md#switching-the-campus-on-redis-town). Every step below was rehearsed end to end through the real Redis gateway, tickets and WebSockets (see [Evidence](#evidence)). Nothing here has been run against production. Changing production configuration or deploying needs Val's explicit go.

## Go/no-go before the switch

All of these must hold for one release commit:

1. **Build:** the integrated expansion build (#623, which carries #582/#583) is merged on `main` through the merge guard, and hosted Verify is green on the release commit.
2. **#587 gate:** passed on that build, covering:
   - traversal into the Commons and back with no loading break, hitch or pop-in;
   - frame time within the District baseline on desktop and on the phone-sized viewport;
   - walked-away assets released;
   - keyboard, touch, announcements, reduced motion and contrast;
   - the two-player journey, locally and on a hosted preview.
3. **Rehearsal:** this rehearsal passes on the release commit, from both starting revisions, against an isolated Redis.
4. **Val's sign-off:** Val's human visual approval and the agreed physical-device results are recorded. They are Val's to give and are never simulated.
5. **Production state:**
   - The operator has confirmed production's current `RIVER_OAKS_DISTRICT_REVISION` is `river-oaks-gardens-3`, and knows the current `RIVER_OAKS_DISTRICT_EPOCH`. If production is still on the garage, finish the campus rollout to the Gardens first and let it settle. The Commons only rolls back to the Gardens (below), so starting from the Gardens keeps a rollback to the town residents already know.
   - Someone who can roll back is watching for the first 30 minutes.

## Switch

1. Deploy the release commit with the district configuration unchanged. Confirm the town is healthy.
2. On every gateway, set:
   - `RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-market-1`
   - `RIVER_OAKS_DISTRICT_EPOCH` = the current epoch + 1 (never lower, never reused)

   Then replace the processes (redeploy).
3. The first coordinator on the new configuration migrates the town once. It logs exactly one `{"event":"district_commons_checkpoint_migrated","from":"gardens","to":"commons","moved":0}`. `moved` counts residents relocated by the migration and is normally 0 on activation.
4. **During the overlap:**
   - An old deployment still serving sockets relays to the new coordinator. Its visitors see the new town, and their pages reload onto the new build.
   - If an old deployment is left running alone, it refuses to coordinate and logs `town_admission_failed` with `"reason":"district_superseded","district":"newer_district_epoch"`. It never takes the town back and rewrites nothing.

## Verify (first 30 minutes)

- `GET /api/world-data?world=river-oaks`, signed in, returns `"districtRevision":"east-garden-commons-market-1"`.
- Two accounts walk from the District arrival onto Market Street and back. One lights a lantern, and both see it lit. Chat and existing creations are unchanged.
- **Logs:**
  - one migration event;
  - `district_superseded` only from old deployments, stopping once they drain;
  - no `checkpoint_invalid`, no rise in `town_admission_failed` with reason `unavailable`.

## Rollback triggers

Roll back if any of these happen:

- `checkpoint_invalid` appears.
- `district_superseded` continues after the old deployment has drained. This means gateways disagree on configuration; fix the configuration and redeploy.
- Admission failures (`unavailable`), client errors or disconnects rise above the pre-switch baseline.
- Residents report being stuck, falling or losing creations.
- Frame time on the agreed devices exceeds the agreed budget.

## Rollback

1. On every gateway, set:
   - `RIVER_OAKS_DISTRICT_REVISION=river-oaks-gardens-3`
   - `RIVER_OAKS_DISTRICT_EPOCH` = the epoch in use + 1

   Then replace the processes.
2. The first coordinator logs `{"event":"district_commons_checkpoint_migrated","from":"commons","to":"gardens","moved":N}`. Here N is the number of residents who were in the Commons; each is moved to clear District ground. Accounts, chat, creations and District positions are unchanged. The Lantern Walk is left behind with the Commons.
3. The superseded Commons deployment, if still running alone, refuses to take the town back (`district_superseded`).

**The rollback target is always `river-oaks-gardens-3`.** A rollback straight to `river-oaks-garage-1` is not supported. It fails closed: the town is unavailable, admission logs `"reason":"checkpoint_invalid","checkpoint":"invalid_envelope"`, and nothing is rewritten. Recover by setting `river-oaks-gardens-3` with another epoch raise.

**Re-activation** after a rollback is the same switch, with another raise.

## Evidence

`server/tests/commons-activation-rehearsal.test.js` rehearses this whole runbook through the real Redis gateway, from both `river-oaks-gardens-3` and `river-oaks-garage-1`. It covers a plain restart (control), activation, overlap and refusal, rollback (including a mistaken garage rollback), refusal of the superseded Commons, and re-activation. It compares accounts, chat, creations and positions at every switch.

Run it against a disposable loopback Redis only; the test refuses any other host:

```sh
redis-server --port 6390 --bind 127.0.0.1 --save '' --appendonly no &
REDIS_URL=redis://127.0.0.1:6390 RIVER_OAKS_REHEARSAL_RECEIPT=.runtime/activation/rehearsal-{from}.json \
  node --test --test-force-exit server/tests/commons-activation-rehearsal.test.js
```

The receipt lists each phase's revision, epoch and durable view, every check, and the migration log lines. The rehearsal does not cover:

- production Redis size or latency;
- Vercel's process replacement timing;
- live WorkOS sign-in;
- residents in garage-only spaces (garage levels and seats) at activation, which the Gardens precondition avoids;
- hosted multiplayer load.

Those are why the switch still needs a monitored window.

# Activating Bayou Heights

Bayou Heights (`bayou-heights-1`, [place doc](level-design/expansion/bayou-heights.md)) composes on the Commons. It is switched on, watched and rolled back the same way as the Commons above, with these differences. Nothing here has been run against production either, and it needs Val's explicit go.

## Go/no-go

- Everything in [Go/no-go before the switch](#gono-go-before-the-switch) for its own release commit. This includes the #587 gate for Heights, measured against the District baseline under the #626 paired protocol.
- **Production state:** production is on `east-garden-commons-market-1` and has settled. Heights rolls back to the Commons, so starting from the Commons keeps a rollback to the town residents already know.
- `server/tests/heights-activation-rehearsal.test.js` passes on the release commit against an isolated Redis.

## Switch and verify

- Set `RIVER_OAKS_DISTRICT_REVISION=bayou-heights-1` with the epoch raised, then replace the processes. The first coordinator logs exactly one `{"event":"district_heights_checkpoint_migrated","from":"commons","to":"heights","moved":0}`. A Gardens or garage checkpoint also restores, logged with `"from"` naming the Commons migration's source, but the Commons precondition above avoids it.
- `GET /api/world-data?world=river-oaks` returns `"districtRevision":"bayou-heights-1"`.
- Two accounts walk from the District over Market Street and the Lantern Footbridge onto Nineteenth Street and back. Each crossing names the place in the walking notice.
- The overlap and rollback triggers are the same as for the Commons.

## Rollback

- **To the Commons** (the default): set `RIVER_OAKS_DISTRICT_REVISION=east-garden-commons-market-1` with another epoch raise. The first coordinator logs `{"event":"district_heights_checkpoint_migrated","from":"heights","to":"commons","moved":N}`.
  - N counts players moved: anyone east of the footbridge, or airborne where the Commons cannot fly them, onto clear Commons ground by the bridge.
  - Players seated at the icehouse table stand first, following ordinary departure rules, and that table's game ends. Other tables, accounts, chat, creations and positions elsewhere are unchanged.
- **Straight to Gardens:** set `river-oaks-gardens-3` with an epoch raise. The migration chains through the Commons and logs `"from":"heights","to":"gardens"`. Everyone east of the District edge ends on District ground.
- `moved` counts players only. Residents do not route into Heights yet. When they do, the Heights rollback must relocate them too.

## Evidence

`server/tests/heights-activation-rehearsal.test.js` rehearses:
- activation from the Commons;
- standing, seated and airborne occupants in Heights;
- a stale Commons deployment, both relaying and refusing alone;
- rollback to the Commons;
- refusal of the superseded Heights deployment;
- re-activation;
- the chained rollback to Gardens.

Run it like the Commons rehearsal above, against a disposable loopback Redis. The same limits apply.
