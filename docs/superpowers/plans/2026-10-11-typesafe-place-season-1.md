# TypeSafe Place Season 1 content plan

## Objective

Store the reviewed Season 1 social plan for *The Gods Have a Group Chat: The
Guest List* in the repository, so production and posting work from one copy.

## Files owned

- `docs/marketing/typesafe-place-season-1/TypeSafe_Place_30_Day_Content_Calendar.xlsx`
- `docs/marketing/typesafe-place-season-1/TypeSafe_Place_Season_1_Production_Guide.md`
- `docs/superpowers/plans/2026-10-11-typesafe-place-season-1.md`
- `docs/project-management/tasks.json` (this task's entry only)

## Changes from the October 9 source files

The source files were Val's October 9 workbook and guide. Charm reviewed them
and Val approved each change below on October 11, 2026.

- Relaunch on Monday, October 12. Light Days 3, 10 and 17 are cut and banked.
  The October 31 party episode and the November 7 season end are unchanged.
- The season is 27 episodes and 54 planned uploads (17 story, 6 light,
  4 recap). The Results sheet has 108 snapshot rows.
- The Calendar sheet gains Post #, Owner, Edit due and Hook delivery columns.
- Every caption ends with `AI-made fictional series 🩷 #TypeSafePlace
  #TheGuestList`. Days 8 and 22 add "(the assistant too)" and Day 27 adds
  "(the companion too)".
- Day 23 and Day 27 Instagram captions drop redundant "fictional" hedging.
- Hooks for Days 5, 9, 14 and 29 now agree with their scripts, and the Day 21
  voiceover ends on its hook.
- Day 16 plants Ares's puzzle-challenge strategy, which Days 23 and 27 pay off
  (length 25s → 30s).
- Day 20 is explicitly the second rehearsal. On Day 23, Jev takes host duty
  instead of the welcome.
- The guide's two broken Markdown tables (§4 and the reference catalog) are
  fixed.

## Checks

- Workbook reopened with openpyxl and LibreOffice: table ranges, status
  validation, conditional formatting and dates were checked on every sheet.
- Guide: every brief date, hook-delivery line and caption was counted after
  each edit. No stale October 9 schedule references remain except the
  relaunch note and the date the sources were checked.
- Repository: `git diff --check` and the secret guard (results in the PR).

## Gaps

- No media has been rendered. Posting needs finished Day 1 video and access to
  the publishing accounts.
- The Owner column is empty.
- Success targets and a repurposing plan are not defined yet.

## Next step

Val reviews the PR. After it merges, production follows Batch A in guide §3.

## Update, 2026-10-11 evening: season starts October 11

Val approved Day 1 (Oct 8 lounge, fresh voices) and asked for the season to
start on October 11. Day 1 was rendered that evening in Charm's workspace and
is not part of this repository.

- **Calendar.** Day 1 moves to Sun Oct 11 (Status Ready). Banked Day 3,
  *Researching the Vibe*, returns on Mon Oct 12 as Post 2. Day 2 keeps Oct 13,
  and every later post keeps its date. The Guest List stays on Oct 31 and the
  season still ends Nov 7. Post # now runs 1–28, with 56 planned uploads.
- **Why not shift every post a day earlier.** That would put The Guest List on
  Oct 30, under the Day 21 recap card that says "October 31". Guide §4 says
  banked days come back "if a slot opens", and starting a day early opens
  exactly one. Day 3 is a 10s text-only Light loop, the cheapest of the three.
- **Workbook.** Calendar table A7:M35; status validation and formatting I8:I35.
  ProductionCopy gains Day 3's 15 rows (A7:D427), and SeriesReferences moves to
  B432:D522. PostResults gains Day 3's four rows (A7:N119). The Dates,
  Publishing status and Planning notes 3, 5 and 11 are updated.
- **Guide.** Updated the relaunch note, the §1 arc dates, the §2 counts, the
  §3 launch rule (including the revert rule if Day 1 does not post on Oct 11),
  the §4 table and the banked list. Day 01 and Day 03 have new planned-post lines.

### Checks (this update)

- The workbook was diffed against the previous revision with openpyxl. Outside
  Day 1, Day 3 and Post #, every Calendar field is unchanged. Production differs
  only by the inserted Day 3 rows and the five notes listed above. Results
  differs only by the four inserted Day 3 rows. Each row keeps its style,
  including the fill that alternates by Day parity. Dates run Oct 11 to Nov 7
  with no gaps.
- The Guide §4 table was checked against the workbook Calendar for all 28 rows
  (Post #, Day, date, format, episode).
- `git diff --check` and the secret guard (results in the PR).

### Next step

Val reviews the Day 1 cut and posts it tonight. If it does not post on Oct 11,
revert to the Oct 12 plan (Day 1 on Oct 12, Day 3 banked again). Then Val
reviews and merges this PR with the guard script.

## Update, 2026-10-12 00:55 CDT: back to the October 12 plan

Day 1 did not post on October 11. Val chose "post Day 1 tonight instead", which
is the revert rule recorded above. Day 1 posts Mon Oct 12, Day 3 is banked
again, and nothing else moves.

- **Workbook.** Restored to the October 12 plan at 69719c2 (sha256 `b6334e33…acef`,
  which the revert script requires). Then five cells changed: Day 1 Status Ready,
  Day 1 Owner, the Calendar header note, Publishing status, and Planning note 11.
  Day 3's rows from the Oct 11 move-up are gone again.
- **Guide.** Restored to the 69719c2 text, plus three notes: the October 11–12
  history, and Day 3 marked built and ready as a bonus in the banked list and
  in its brief.

### Checks (this update)

- The workbook was diffed cell by cell (values and styles) against the 69719c2
  revision with openpyxl: exactly those five cells differ. Every table range
  matches, and the Calendar runs Mon Oct 12 to Sat Nov 7 with 27 posts.
- The guide diff against 69719c2 is the three added notes only.
- `git diff --check` and the secret guard (results in the PR).
