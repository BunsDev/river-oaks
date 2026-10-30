# Hosted CI flake ledger

One row per failure signature seen in the `Verify` workflow on `main`, its cause and the change that fixed it. A rerun that passes is not a fix: a signature stays open until a change removes its cause, and the evidence names the run, job and log line that showed it.

The goal (2026-10-29) is twenty consecutive `Verify` runs on `main` that pass at the first attempt, with every preview shard inside its 20-minute budget. Timeouts are not lengthened, checks are not weakened and baselines are not rebased to make a run pass.

## Window classified on 2026-10-29

The last 30 `Verify` runs on `main` (2026-10-28 11:38Z to 2026-10-29 21:45Z): 19 passed and 11 failed, none rerun. Every failed run had one or two real failing jobs plus the aggregate `preview` job, which only reports them. Twelve failing jobs, seven signatures:

| Signature | Job | Runs | Cause | Status |
| --- | --- | --- | --- | --- |
| `stack-activation-rehearsal.test.js`: `alice snapshot on river-oaks-gardens-3@7` | preview checks | 4 (40722990438, 40762513366, 40768823845, 40909115071) | The room's 7 s request budget paid for the boot-time migration, and a load longer than the 5 s lease could never pass the commit fence (#754). | Fixed by #756 (`6945444c`, 2026-10-29 16:29Z). All four runs predate it; none since. |
| `<walk>: stalled` within 0.21 m of the waypoint, after many slow presses (`bayou-heights-return` alice home, `bayou-terraces` alice footbridge) | preview experience (heights-return), (terraces) | 2 (40960481577, 40756805527) | The page reads held keys once per frame. On the CPU-rendered runner a frame can take a second, while key events arrive in milliseconds, so the walk driver's 30–48 ms slow presses were released before any frame read them and moved nothing: 12 and 94 presses without covering the last 6 cm. | Fixed by #768: each slow press lasts at least one and a half of the page's frames, measured afresh at every observation (`walk-driver.js`; `walk-driver.test.js` reproduces the stall at 1 fps with 5 ms input latency). #768's first version measured one frame per walk and kept doubling the hold; its own hosted rerun then stalled `woodland-heights` "owner green" 0.32 m short after 145 turns, overshooting at every press (run 40991211161). The revision and a changing-frame-rate test replace it. |
| `store-intro`: `movement works after skip` | preview experience (places) | 1 (40953140219) | The same defect: a 180 ms S press shorter than a CPU-rendered frame. | Fixed by the first PR: the press lasts at least two measured frames. |
| `garden-campus-traversal`: `One resident on B12 stands over the other on the street` | preview experience (campus-traversal) | 1 (40960481577) | `walkTo` decides arrival from the client's pose, and the check reads both players from the server snapshot immediately after; the last stride is not yet in the snapshot. | Open: next PR waits for the server to hold each walker's arrival before comparing. |
| `bayou-terraces`: `owner greenway: stalled`, 92 m from the target, speed 0 | preview experience (terraces) | 1 (40919256081) | The walk back starts from the server's stand-up spot and heads straight for a waypoint on the far side of the chess table; the failure screenshot shows the owner pressed against the table's chair. The older `stand_before_moving` refusal in the record was sent during the game, before the stand. | Open: why the stand spot or the straight line differs between runs is not yet shown. |
| `player-blocking-interface`: `You blocked sage-dev.` never shown (45 s locator timeout) | preview shared (worlds-and-creator) | 2 (40709671541, 40948188481) | The failure screenshot shows the first-click prompt and the button back on "Block": the double-click's second click did not confirm. A block-list re-attach between the clicks (it clears the notice, rebuilds roster rows and cancels a pending confirmation) fits the evidence. | Open: the trigger is not yet reproduced. |
| `campus-leases-transport.test.js` (redis): `alice: socket closed (4009) before its first snapshot` | preview checks | 1 (40681496315) | The gateway closed alice's first socket as "joined in another tab" or "joined another world" before its first snapshot. | Open: not yet reproduced. |

## How to add a row

Read the failing job's log (`gh api repos/BunsDev/river-oaks/actions/jobs/<id>/logs --allow-escape-sequences`) and its failure artifact before rerunning anything. Record the signature as the log prints it, the job, the run ids, the cause as far as the evidence shows it, and the fix PR. A cause that is a guess says so.
