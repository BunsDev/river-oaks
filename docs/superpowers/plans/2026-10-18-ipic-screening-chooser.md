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
- **The fixture stays out of the chooser and stays allowlisted.** Tests and tools still start it by direct command,
  as the journey does. A server gate that refuses it in production would change existing semantics and every server
  test for little gain. A display filter is not treated as authorization: the server checks every Start.
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
| Client regressions | Pending: after merging #498 |

## Next step

Merge #498's committed branch, then write the failing client regressions (chosen id in Start; unknown film is
unsupported, not the previous film), then the chooser UI.
