# IPIC screening: an approved-film chooser for the host (#499)

- **Issue:** #499 (S2 under tracker #497). UI/contract engineer role.
- **Task:** `ipic-screening-chooser-499` (live register), owner `claude:river-oaks-4b (6191db50)`.
- **Branch / worktree:** `feat/screening-chooser-499-20261018` in `../river-oaks-screening-499`. It starts from main
  `153471bc` and merges #498's branch before any UI hunk changes.
- **Scope kept:** the existing Start command and server authority. No catalog server, uploads, URLs, queue,
  playlist, seek or automatic next film.

## Decisions

- **The server allowlist is the authority.** `SCREENING_MEDIA` is one module shared by the server
  (`parseScreeningCommand`) and the client, so the chooser cannot offer what the server would refuse.
- **The fixture stays allowlisted and out of the production chooser.** Production builds never offer it. Development
  builds offer it only with `?screening-fixtures=1`, labelled "(test)", so the journey can choose it the way a host
  would. A server gate that refused it in production would change existing semantics and every server test for little
  gain. A display filter is not treated as authorization: the server checks every Start.
- **The default is explicit:** `ipic-original-v1`, not whichever entry comes first.

## What was wrong on main `153471bc`

- `screeningCommand(view, 'start')` used the snapshot's film (`view.mediaId`) or the first catalog entry. A host could
  only replay the film that had ended, never choose another.
- A client that does not know the shared film's id (an older client after a new film is added) ignored it. It kept
  playing the previous film's frames against the new timeline, under the new film's revision.

## Checks

| Check | Result |
| --- | --- |
| `server/tests/screenings.test.js` + two-film and racing-host cases | 14/14 on main as well: the server already holds (guards) |
| Client regressions (`screening-contract.test.js`, `ipic-screening-ui.test.js`, `ipic-screening.test.js`) on main `153471bc` | **5 failed:** Start sent the snapshot's or the first film, not the chosen one; an unknown film kept playing the previous film's frames |
| Same, on the branch | Pass, 0 skipped |
| Hosted CI journey (Linux, Mesa), first run | Caught a 36 px `<select>` on Linux Chromium (only `min-height: 44px`); fixed with an explicit height |
| Hosted CI at `2bb8eaae` and later | The host's chooser shows 2 films with the short chosen ("0:53 · Silent · English captions"); the viewer has none; a choice alone changes nothing shared; the select and Start film are on screen, uncovered and at least 44 px tall at 390 and 320 px; the host chose the fixture after the short and started it with Start film |
| Isolated Redis (`REDIS_URL` on a private redis-server), screenings transport + screenings tests | 17/17, 0 skipped |
| Hosted CI at `4e092679` | All 10 checks green |
| Integrated soak on #520 `2df7a0a8` (with #498 and #500) | Passed: 10 cycles, each changing the film, 11/11 late joins within 500 ms |

## Gaps and owners

- **The second approved film:** #501 (Val's approval of the exact bytes). On approval it is registered here
  (`sources.json`, `SCREENING_MEDIA`) and #502 runs the two-film checks with it.
- **Keyboard, touch and VoiceOver on a device:** #502 device rows (Val).

## Next step

Wait for #501's approval; then register the film in this branch and rerun the chooser journey with two approved films.
Land after #513 with Val's approval: `pnpm run land 514`.
