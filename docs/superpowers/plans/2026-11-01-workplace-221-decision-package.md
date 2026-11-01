# #221 decision package for Val: enable, merge into campus desks, or retire

Companion to [the reconciliation ledger](2026-11-01-workplace-221-pink-jet-age.md). This is the
third finish-line item of the 2026-10-22 goal prompt on #221. It decides nothing: every option
below needs Val's choice, and the code stays as it is (both flags off) until then.

Source facts are from `decb4e9a` and the checks in the reconciliation ledger: the slice's
authority, privacy, retention, erase and sweep suites pass (77/77 on Redis), both journeys pass,
and the fixture now carries the approved visual direction behind `?finish=pink-jet-age`.

## 1. What the slice is, next to what shipped since

| | Workplace slice (#214–#238, off) | Campus private desks (#505, #510; in production) |
| --- | --- | --- |
| What a player gets | A named companion that drafts one private `event_plan` from a brief, under a 7-day grant; a draft-only artifact with a receipt | A private desk document: up to 24 human-written tasks (title, notes, result, five links) |
| Where it lives | The People roster ("Your companion") and a labeled fixture room; two *logical* stations shared across every world | Garden Offices workstations and the private desk in the Gardens campus |
| Routes | `/api/workplace/<action>` (`server/workplace-api.js`), `/api/workplace-sweep` (cron) | `/api/office-desk/read|save|remove` |
| Storage | `{ns}:workplace:v1:*`, exact 30-day retention per task, `forget` and `erase` | Desk document outside world checkpoints, until tasks are removed |
| Flags | `RIVER_OAKS_WORKPLACE=1` (kill switch) and `VITE_WORKPLACE=true`, both off | none; live |
| Overlap | The word "desk": "Go to a desk" seats the companion at a logical station, not at a campus desk a player can walk to | — |

- **#496 (10-18)** removed personal-office provisioning and the shared-workspace APIs. The
  workplace never depended on them: its stations are logical leases, not rooms, and
  `docs/offices.md` already states the two features are independent. Nothing in the slice
  calls a removed route (`server/workplace.js` imports only `node:crypto` and the shared
  contract; its store, access checks and places listing are injected by `town.js` and
  `world-gateway.js`).
- **Route conflicts:** none. The prefixes differ and `server/vercel-routing.js` lists the desk
  routes only; the workplace routes mount under their own prefix when the flag is on.
- **Stale documentation:** `docs/workplace-operations.md` still says the furnished room serves
  "private office visits accessed through the district's office lobby". That layout is the
  retired legacy office (penthouse in production since 10-15); the sentence is true only for
  old checkpoints, which end safely on restore. One-line fix, in whichever option is chosen.
- **The one real duplication is conceptual**, not technical: two different things a player can
  call "a desk". That is the strongest argument against enabling the panel as it stands.

## 2. Retention: the one setting Val must choose before any hosted enablement

Today: `WORKPLACE_LIMITS.retentionMs = 30 days` in `preview/src/workplace-contract.js`, exact at
rest per task (`server/tests/retention-workplace.test.js`), changeable only in code.

| Option | What changes | For | Against |
| --- | --- | --- | --- |
| A. Keep 30 days | nothing | Already tested end to end; a player who drafts on Friday finds it after a holiday | Longest hold of a brief that names a guest of honor and their likes |
| B. 7 days, matching the grant | one constant; re-run the retention suite | Brief and draft live no longer than the permission that produced them; simplest story to tell a player | A player who delegates and comes back in two weeks finds "brief no longer kept" (the panel already says so plainly) |
| C. Until `forget`/`erase`, capped at 90 days | one constant plus a visible "kept until you delete it, at most 90 days" line in the panel | Matches the campus desk's "until removed" model | Longest retention of personal text; needs the panel copy change and a receipt update |

Recommendation if the slice is enabled or merged: **B**. If it is retired, the question goes
away with the data (there is no hosted data: the workplace has never been enabled on a
deployment, so `workplace:v1:*` exists only in local development stores).

## 3. Uncoached player sessions (three players, about 30 minutes each)

Run with both flags on in a local or preview build, the People roster closed at the start, no
prompting beyond the card. Record what the player says aloud, what they click, and the time to
each outcome. The six scenarios the 10-11 decision named:

1. **Delegate.** Card: "Someone new is moving in next door. See if you can get help planning a
   small welcome." Observe: do they find "Your companion" without a hint; do they read the
   permission card; do they understand "Draft only, nothing is published".
2. **Leave.** Card: "You have something else to do for a minute." Observe: do they expect the
   draft to continue; do they come back to a ready draft or to confusion.
3. **Inspect.** Card: "Check what it actually did." Observe: do they open "What actually ran";
   do `0 external writes, 0 paid calls` and the public-places read mean anything to them.
4. **Pause.** Card: "You changed your mind for now, but not for good." Observe: Pause vs Cancel.
5. **Revoke.** Card: "You no longer want it drafting anything." Observe: do they find Revoke
   on the permission card; do they understand the running draft stopped and saved nothing.
6. **Decline.** Card (a fresh account): "You get the offer and you are not interested."
   Observe: Not tonight vs No thanks; do they feel they lost anything.

Then two questions, verbatim: "Would you use this again in the town?" and "Did it feel like a
chore or like company?" The 10-11 decision asked whether the workplace strengthens the social
experience rather than creating chores; three "chore" answers are an answer.

## 4. Human accessibility review (screen reader, keyboard, touch)

Automated measurements so far (reconciliation ledger): every control ≥ 4.5:1 in both themes
after one CSS rule, buttons 36 px with a fine pointer and 44 px with a coarse one, keyboard
journey passes (brief typed and submitted by keyboard; focus moves to an opened draft). None
of that is human acceptance. Checklist for one VoiceOver session on this Mac and one on a
physical phone:

- [ ] The section is announced as "Your companion" (landmark `section` with `aria-labelledby`).
- [ ] Each card group announces its name: Where your companion is, Planning offer, Permission,
      Current task, Saved drafts, Your workplace data.
- [ ] Status lines (`role=status`) are announced once per change and are not repeated by the
      2-second poll while a task runs.
- [ ] The brief's five fields read their labels; the number field reads its range; Enter submits.
- [ ] Opening a draft moves focus to the draft heading and "Close draft" returns focus to Open.
- [ ] "Erase my workplace…" is a two-step action and the confirmation is readable before it is
      actionable.
- [ ] Keyboard only: every control reachable in order; focus never lost after Pause, Resume,
      Revoke or Delete re-render the live region (`data-focus-key` restore).
- [ ] Touch (physical phone, People sheet open): no control under 44 px, no horizontal scroll
      at 360 px width, the brief usable with the on-screen keyboard.
- [ ] Reduced motion: nothing in the panel animates (there is no animation to turn off; confirm).
- [ ] Dark theme and the Pink Jet-Age HUD skin (#788, when merged) keep every ratio ≥ 4.5:1.

## 5. Enablement and rollback, and the two checks still owed on a preview deploy

From `docs/workplace-operations.md` (unchanged):

- **Enable on a preview deployment (Val-authorized only):** set `RIVER_OAKS_WORKPLACE=1` and
  `CRON_SECRET` in that environment, build with `VITE_WORKPLACE=true`, deploy.
- **Kill switch:** unset `RIVER_OAKS_WORKPLACE` and redeploy. Every action returns 404; data
  stays and keeps expiring. Rebuilding without `VITE_WORKPLACE` removes the panel.
- **Owed, never run on a real deployment:**
  1. **Cron drain.** With the flag on and `CRON_SECRET` set: submit a brief, close the tab, and
     confirm from the next owner read that the task completed within about two minutes with
     exactly one draft and one notice. Then call `GET /api/workplace-sweep` without the header
     (expect 401) and with the flag off (expect 404).
  2. **Kill switch mid-task.** Submit a brief, flip the flag off mid-run (redeploy), confirm
     every action returns 404 and no step advanced; flip it back on and confirm the task
     resumes from its checkpoint and finishes once.
  Both are read-only on real data (one fixture owner), cost no inference, and can be scripted
  against the preview origin with the fixture session once Val authorizes that deploy.

## 6. The choice

**Enable.** Keep the slice as the practice companion it is, behind the same flags, on a
preview deployment first. Needs: Val's retention choice (B), the two deploy checks above, the
uncoached sessions and the human review. Carries the "two kinds of desk" confusion unless the
companion's station language changes.

**Merge into campus desks.** Let the companion draft *into* a player's campus desk (a task with
notes and the plan as its result) and drop the logical stations and the roster card. This is a
new capability touching `office-desk` write paths and the desk's human-authored contract, so
it is a separately scoped task under #214's deferred list, not a change to #221.

**Retire.** Remove the code behind the flags: `server/workplace.js`, `server/workplace-api.js`,
the cron route and `vercel.json` cron entry, `preview/src/workplace-{ui,contract}.js` and
`workplace.css`, the panel mount in `multiplayer-client.js`, the two journeys and the runner
entry, the `workplace` CI shard, and the eight server suites and three panel/office suites.
Keep `workplace-room.js` (`planWorkplaceRoom`, `AVATAR_ENVELOPE`, `findRoute`): the office
contract, campus layouts, IPIC routes and the penthouse import it. `workplace-office.js` and
the finish can stay as the legacy layout's art or go with the slice. Data: nothing hosted to
delete; the `{ns}:workplace:v1:*` key family is documented so a stray local store is
recognizable. Docs: retire `workplace-operations.md` to history and fix the `offices.md` line.

**Recommendation:** run the three uncoached sessions first; they are the cheapest evidence and
the 10-11 decision already turns on them. If they do not show that the companion adds to the
social experience, **retire**: campus desks now cover "a desk of my own" in production, and the
remaining value of the slice (a bounded delegated task with consent, receipts and a kill switch)
is better kept as the tested pattern it documents than as a second desk concept in the roster.
If they do show value, **enable** on a preview deployment with retention B and the two owed
checks, and treat "merge into campus desks" as the next scoped capability.

## Decisions for Val

1. Retention: A, B or C (section 2).
2. Schedule the three uncoached sessions and the two human reviews (sections 3 and 4), or
   decline them and decide from the automated evidence alone.
3. Authorize a preview deployment with the flags on for the two owed checks (section 5), or
   defer them until after the sessions.
4. Enable, merge or retire (section 6).
