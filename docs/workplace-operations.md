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

Stored data is left in place, but each key's expiry keeps counting down while the flag is off. Turning the flag back on restores each owner's saved draft and finished tasks (same test). A task that was running when the flag went off resumes from its last checkpoint once the flag is back on: on a long-lived service, the sweep picks it up within 5 s (see **Unattended recovery** below); on Vercel, it resumes on the owner's next read. The time it was off doesn't count against its deadline. A gap longer than the 10 s step lease counts as one recovery, however long it lasts. A task fails with `worker_lost` only after a fourth such gap (`a reader returning after a long absence …` and `a lost runner recovers …` in `server/tests/workplace.test.js`).

## Rolling back the code

Reverting the workplace PR removes the routes; the Redis keys stay. A later re-deploy of the same storage version (`v1`) reads them again. If a rollback must also discard data, delete the keys described below in the target namespace only. Do this as a deliberate operator action, never from a test or a cleanup script.

## What is stored, and for how long

Everything lives under the deployment's Redis namespace, `{REDIS_NAMESPACE}`. In local town mode it lives in process memory and is lost when the process restarts.

| Key | Holds | Lifetime |
| --- | --- | --- |
| `{ns}:workplace:v1:owner:<sha256(userId)>` | One owner's companion, grant, task and draft metadata (status, steps, ids, the public places captured for the task), notices and recent request ids. No brief, draft or receipt text. | Each write resets the key's expiry to the full retention period (30 days). An owner who stops writing loses the whole key 30 days after their last write. |
| `{ns}:workplace:v1:work:<sha256(userId)>:<taskId>` | One task's private text: the brief, plus the draft and receipt once it completes | Exact. Unfinished: 30 days from submission. Finished: 30 days from when it finished. Deleted with the task. An unrelated write never extends it (`server/tests/retention-workplace.test.js`). |
| `{ns}:workplace:v1:stations` | Which station is held, by a hashed owner, until when | Station leases last 30 minutes and renew on reads; the key expires after 60 minutes without a write *(code)*. The public view is exactly `{id, occupied, mine}` (`the public occupancy view carries exactly …`). The key spans the whole namespace, so every world shares the two stations. |

Inside an owner's document:

- A **draft** is deleted from storage 30 days after it was created. Deleting it also removes the task, brief, notice and request id that produced it (`deleting a draft forgets its brief …`).
- A **finished task** (completed, failed or cancelled) keeps its brief for 30 days after it finished, and at most 8 finished tasks are kept, oldest removed first *(code)*.
- **Forget:** the owner can delete any finished task with the `forget` action ("Forget" in the panel). It removes the brief, any draft and receipt, the notice and the request id in one save.
- **Exact at rest.** Private text is stored in the per-task key, and that key's expiry is set from the task's own times, never from the owner's latest write. A draft created on day 0 is gone from storage on day 30, even if the owner wrote on day 29 and never visits again. Its metadata stays in the owner document until the next read or write tidies it; the metadata holds no private text.
- **An unfinished brief** expires 30 days after submission too. A task paused past that point fails with `brief_expired` when resumed, and drafts nothing.
- **Earlier documents:** a document written before per-task keys keeps its briefs inline until it expires. The workplace has never been enabled on a hosted deployment, so this affects only local development data.
- An **active task** (queued, running or paused) stays until it finishes. The owner can cancel it, revoking cancels it, and a lapsed grant cancels it on the next read or re-grant.
- At most 3 drafts of at most 256 KiB each. At most 8 notices *(code)*.

The 30-day retention, 7-day grant and the other limits are `WORKPLACE_LIMITS` in `preview/src/workplace-contract.js`. They can only be changed in code: `town.js` and `world-gateway.js` pass no overrides. **The 30-day default needs Val's decision before hosted enablement.**

There is no single "erase my workplace" action. An owner can forget each finished task and delete each draft, and revoking stops work. Full erasure of one owner today means an operator deletes that owner's `owner:` key and their `work:` keys.

## Access changes during work

Every request passes the town's session, waitlist, ban, origin and CSRF gates. Work stops when access ends in two ways:

- **When access ends.** A ban through the moderation route, or a waitlist decision that ends approval, revokes the grant at once and cancels queued, running and paused work with reason `access_revoked`. An idle grant is revoked too. This happens on both servers (`a ban or an ended waitlist approval stops paused work and idle grants …`, and the Redis case `… mid-task stops unattended work …`).
- **At each unattended step.** The service timer has no request behind it, so before each step it asks whether the owner is still approved and not banned. This catches a ban written to the moderation store some other way, but only for a task that has a live timer on that instance. If the check itself fails, for example because the moderation store is unreachable, the step doesn't run (`server/tests/workplace.test.js`).
- **Restoring access** doesn't revive the grant or the cancelled work. The owner must grant again and submit again.

On a serverless host with no timer, steps advance only on the owner's authorized reads, and the request gate already refuses banned or unapproved owners.

## Unattended recovery

Every save of an owner document also updates a due index, `{ns}:workplace:v1:due`. It's a sorted set of owners whose task is queued or running, scored by when the next step is due. The update happens in the same atomic script as the save. Pausing, finishing or cancelling removes the owner, so a paused task is never swept.

A **long-lived** gateway (`server/redis-start.js`, any deployment where `VERCEL` isn't `1`) sweeps every 5 s. It takes up to 50 overdue owners and, for each one, checks access (approved and not banned), then runs the next step. That step goes through the same compare-and-set as every other runner, so several instances sweeping the same task still land each step once.
- A task orphaned by an instance that died finishes on another instance, with nobody reading (`a live Redis gateway finishes a task orphaned by another gateway …` in `server/tests/sweep-workplace.test.js`).
- An owner who lost access has their work stopped (`access_revoked`).
- An index entry for a document that expired or was deleted is removed, but only if nobody re-scored it in the meantime.

On **Vercel**, a function invocation can't keep a timer. Instead, Vercel Cron calls `GET /api/workplace-sweep` once a minute (`crons` in `vercel.json`; the team is on Pro, which allows that rate), and the route **drains**: it steps every overdue task to completion, all owners in parallel, within a 20 s budget. The minute-long gap before the call counts as one lost-runner recovery, and the drain then keeps within the lease. A task the budget doesn't finish stays in the index for the next call (`server/tests/cron-workplace.test.js`).
- The route exists only with the workplace on and `CRON_SECRET` set. Without the secret it returns 404, and with a wrong or missing `Authorization: Bearer <CRON_SECRET>` header it returns 401. The comparison is constant-time.
- With `RIVER_OAKS_WORKPLACE` off, the Vercel entry answers the cron with 404 before it starts the backend, so the per-minute call costs almost nothing.
- **Before enabling on Vercel:** set `CRON_SECRET` in the project's environment variables. Vercel sends it on cron calls. Without it, tasks advance only on owner reads. The in-memory town keeps everything in one process, so a restart loses its data, and it has no sweep either.

The due index holds raw user ids, because the access check needs them. The waitlist and moderation stores already hold user ids server-side, and the index is never exposed through any route.

## Not covered

- Live WorkOS sessions, hosted Redis under production load, and multi-region behavior.
- The art pass, uncoached player sessions and device performance budgets (#221, owned by Val).
- The Vercel cron route on a real deployment: tested locally against a live Redis gateway, not on Vercel itself.
- Any external effect. The fixture adapter writes nothing outside the owner's document, and each receipt records `externalWrites: 0` and `paidCalls: 0`.
