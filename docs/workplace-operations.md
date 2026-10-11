# Workplace: flags, kill switch, rollback and retention

This covers operating the first workplace slice (#214): one fixture companion, one `event_plan` grant and a draft-only plan. The code lives in `server/workplace.js`, `server/workplace-api.js` and `preview/src/workplace-*.js`. Statements cite the test that shows them where one exists. Statements marked *(code)* come from reading the code and have no dedicated test.

## Flags

| Flag | Where | Default | Effect |
| --- | --- | --- | --- |
| `RIVER_OAKS_WORKPLACE=1` | Service environment (town and Redis gateway) | off | Builds the workplace service and mounts `/api/workplace/<action>`. When off, every action returns 404. |
| `VITE_WORKPLACE=true` | Client build | off | Mounts the panel in the People roster. Vite reads it at build time, so changing it needs a rebuild. |

**The server flag is the kill switch.** The client flag only hides the panel and grants nothing: when the server flag is on, an authenticated, approved session can call the API directly. Both flags are listed, off, in `.env.example`.

## Turning it off

1. Unset `RIVER_OAKS_WORKPLACE` (or set any value other than `1`) and redeploy or restart the service. A process started without the flag returns 404 for every `/api/workplace/*` action (`two live gateways racing one task …` in `server/tests/adversarial-workplace.test.js`). It builds no workplace service, so it creates no timer and advances no task *(code)*.
   - During a rolling deploy, instances still running with the flag on keep serving and keep their timers until they stop. The switch takes effect only when the last such instance is gone.
   - Switching off while a task is mid-flight is not tested.
2. Optionally rebuild the client with `VITE_WORKPLACE` unset to remove the panel.

Stored data is left in place, but each key's expiry keeps counting down while the flag is off. Turning the flag back on restores each owner's saved draft and finished tasks (same test). A task that was running when the flag went off resumes from its last checkpoint only when its owner next reads the workplace. A newly started instance doesn't look for unfinished tasks, so nothing recovers without the owner coming back *(code)*. The time it was off doesn't count against its deadline. A gap longer than the 10 s step lease counts as one recovery, however long it lasts. A task fails with `worker_lost` only after a fourth such gap (`a reader returning after a long absence …` and `a lost runner recovers …` in `server/tests/workplace.test.js`).

## Rolling back the code

Reverting the workplace PR removes the routes; the Redis keys stay. A later re-deploy of the same storage version (`v1`) reads them again. If a rollback must also discard data, delete the keys described below in the target namespace only. Do this as a deliberate operator action, never from a test or a cleanup script.

## What is stored, and for how long

Everything lives under the deployment's Redis namespace, `{REDIS_NAMESPACE}`. In local town mode it lives in process memory and is lost when the process restarts.

| Key | Holds | Lifetime |
| --- | --- | --- |
| `{ns}:workplace:v1:owner:<sha256(userId)>` | One owner's companion, grant, tasks (including each private brief), drafts with receipts, notices and recent request ids | Each write resets the key's expiry to the full retention period (30 days). An owner who stops writing loses the whole key 30 days after their last write. |
| `{ns}:workplace:v1:stations` | Which station is held, by a hashed owner, until when | Station leases last 30 minutes and renew on reads; the key expires after 60 minutes without a write *(code)*. The public view is exactly `{id, occupied, mine}` (`the public occupancy view carries exactly …`). The key spans the whole namespace, so every world shares the two stations. |

Inside an owner's document:

- A **draft** stops being served 30 days after it was created. Deleting it also removes the task, brief, notice and request id that produced it (`deleting a draft forgets its brief …`).
- A **finished task** (completed, failed or cancelled) keeps its brief for 30 days after it finished, and at most 8 finished tasks are kept, oldest removed first *(code)*. The owner can't delete a cancelled or failed task's brief directly; it goes when retention or the count cap removes it.
- **Served versus stored.** Expired drafts and briefs are removed from the document only when the owner next reads or writes. Every write also resets the whole key's expiry to 30 days. So an expired item can stay in storage, unserved, for up to about twice the retention period. Example: a draft created on day 0, then one unrelated write on day 29, keeps the key until day 59.
- An **active task** (queued, running or paused) stays until it finishes. The owner can cancel it, revoking cancels it, and a lapsed grant cancels it on the next read or re-grant.
- At most 3 drafts of at most 256 KiB each. At most 8 notices *(code)*.

The 30-day retention, 7-day grant and the other limits are `WORKPLACE_LIMITS` in `preview/src/workplace-contract.js`. They can only be changed in code: `town.js` and `world-gateway.js` pass no overrides. **The 30-day default, and whether storage may outlast it as described above, need Val's decision before hosted enablement.**

There is no single "erase my workplace" action. An owner can delete each draft, and revoking stops work. Full erasure of one owner today means an operator deletes that owner's key.

## Access changes during work

Every request passes the town's session, waitlist, ban, origin and CSRF gates. Work stops when access ends in two ways:

- **When access ends.** A ban through the moderation route, or a waitlist decision that ends approval, revokes the grant at once and cancels queued, running and paused work with reason `access_revoked`. An idle grant is revoked too. This happens on both servers (`a ban or an ended waitlist approval stops paused work and idle grants …`, and the Redis case `… mid-task stops unattended work …`).
- **At each unattended step.** The service timer has no request behind it, so before each step it asks whether the owner is still approved and not banned. This catches a ban written to the moderation store some other way, but only for a task that has a live timer on that instance. If the check itself fails, for example because the moderation store is unreachable, the step doesn't run (`server/tests/workplace.test.js`).
- **Restoring access** doesn't revive the grant or the cancelled work. The owner must grant again and submit again.

On a serverless host with no timer, steps advance only on the owner's authorized reads, and the request gate already refuses banned or unapproved owners.

## Not covered

- Live WorkOS sessions, hosted Redis under production load, and multi-region behavior.
- The art pass, uncoached player sessions and device performance budgets (#221, owned by Val).
- Unattended recovery: no instance looks for unfinished tasks on startup.
- Any external effect. The fixture adapter writes nothing outside the owner's document, and each receipt records `externalWrites: 0` and `paidCalls: 0`.
