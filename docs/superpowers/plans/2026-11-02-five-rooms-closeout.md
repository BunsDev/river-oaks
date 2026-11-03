# Five Rooms closeout (goal, Val 2026-11-02)

**Objective:** main trustworthy, #842 finished, one acceptance packet for Val, PR triage, retirement. No new gameplay.

**Task:** `five-rooms-closeout-20261102`, owner `claude:river-oaks-38 (4dbeca)`. Took over `five-rooms-on-main-goal-20261102`, `five-rooms-qa-825-20261101`, `ci-streak-pr-drain-20261102` and `five-rooms-production-delivery-20261102`: their sessions have no process, and their transcripts stop at the host reboot (2026-11-02 22:54Z). That reboot also ended the `verify full` run on 017a46aa, which left no recorded result.

## Main health

- #875 merged as `51ffe701`. It corrects the window to 20 runs and 10 first-attempt failures; the draft had missed scheduled run 41413331829.
- `ribbonwing-passenger` stopped at 3.57 m in 41501249712 and 41568969184, at the same point both times. `preview/tests/hover-landing.test.js` reproduces it: at that point, heading 0.30 lands and 0.44 stops near 3.6 m. The hosted heading is unknown; the failure message now records it.

## Evidence on main `fe2463e2`

The run used a `git archive` snapshot (commit `8ed13661`), with isolated Redis, from 05:38Z to 06:46Z on 2026-11-03.

| Command | Result |
| --- | --- |
| `pnpm run verify full` | Passed, 19 stages in 51 min at load 8-15. Tooling 307/0; preview 5262 tests, 5231 pass, 1 skip, 30 todo; Redis server 1452/0; desktop 132 tests, 127 pass, 5 skip. |
| `node preview/e2e/experience-runner.js five-rooms` | Passed in 342 s. Not yet part of the `verify full` suite at this SHA; #884 added it. |
| Same, `RIVER_OAKS_EXPERIENCE_BROWSER=webkit` | Passed in 421 s. |
| `RIVER_OAKS_FINISH=classic` and `pink-jet-age`, `depth-layers` | Passed, 0 new pairs. |
| `node preview/e2e/five-rooms-cameras.mjs` | 120 views, none blank, 102 pink violations and 1 unresolved. Arrival frame: Classic 1635, Pink 1617 calls against the provisional 1874. |

The first `verify full`, on `0c040286`, was stopped in its shared stage: #876 superseded that SHA and Val tried to restart. It is not a pass.

## Findings

- Pink review, filed on #839 and #835: 37 are `glow-usable` frames the audit fails to recognise, 38 are unlit trim and Ribbon edges, 27 are older materials.
- `tree-17` at the Shade Garden entrance, filed on #840. The journey's foliage note measures from the eye, not the feet.
- Landscape: 5 aprons, 0 courts, 0 beds, 6 dropped, 36 pending Val's rulings.
- Cameras v13 and v14 look at ground under the IPIC escalators; v16 stands 58 m from its entrance; v21 stands too far back.
- `five-rooms` didn't fit in the experience stage (1055 s used of 1200 s, journey 342 s), so #884 gave it its own stage.

## Limits

No human visual or accessibility review, no device proof, no signed-in production walkthrough, no occupied rollback. The client's night stops at 19:00. All browser evidence used a local fixture.

## Other sessions

River-oaks-0e landed #876 as `fe2463e2` under its own goal, as it reported. Its head carries Codex's recovery candidate plus the later delta this session handed over.

## Next

River-oaks-0e added the `experience-five-rooms` stage in #884 (`f7d22cff`, same tree as `f6a5abb0`); `verify full` passed all 20 stages on `f6a5abb0`, as it reported. #842 closes on that. Val's remaining decisions are in the acceptance packet.
