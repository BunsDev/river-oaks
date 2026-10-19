# Phone HUD: the greetings card covered Play & rides (2026-10-15)

Task `greetings-dock-overlap` · branch `fix/greetings-dock-overlap-20261015` · worktree `../river-oaks-greetings-dock-20261015` · owner claude:river-oaks-1b (b929a625).

#368's screening soak found this (#407, `findings`), and the #359 lead status (2026-10-15 11:05Z) listed it as item 5, for "HUD owners". No register task or open PR owned these files.

## Objective

Whenever another resident is nearby, the nearby greetings card appears. It is `.nearby-greetings`, z-index 14, centred at the top. It must not cover the controls a phone visitor needs to tap. On `main` it covered the **Play & rides** toggle and **Commands**, and in narrow windows the open play dock's tabs too.

## Change

`preview/src/multiplayer.css` only. The card's look, content, focus and behaviour are unchanged, and so is the dock.

- **Portrait phones** (`max-width: 700px` and `min-height: 501px`): the card sits at 184 px, below the right-hand column: Play & rides at 76–120 px and Commands at 132–176 px.
- **Up to 900 px wide, with the play dock open:**
  - The **idle** card ("Say hello", with its person picker showing) yields (`visibility: hidden`) and returns when the dock closes. This follows the HUD's existing rule that panels yield, as in `.game-hud:has(.table-game-panel[open]) .visit-tools`.
  - An **invitation or a shared activity** does not yield, so Accept, Decline, Cancel and Stop stay reachable.
  - The first version hid every card while the dock was open. That would have hidden **Stop** in the `greetings` journey's phone step (bob's dock is open from desktop width), so it was narrowed before any commit.
- Wider windows and short landscape phones keep today's placement.

## Regression: `node preview/e2e/greetings-dock-runner.mjs`

The runner opens two pages, alice and bob, on one loopback town, so alice's greetings card shows. It dismisses the software-rendering banner, as a person would.

At nine sizes (320×640, 390×844, 600×900, 700×900, 768×1024, 800×900, 844×390, 1024×768 and 1280×800) it does three things:
- Hit-tests the centre of each control with `elementFromPoint`: Map, People, Settings, Commands, Play & rides, the town chat header and every greetings control. That is 15 controls per size.
- Taps Play & rides as a person would, with a real Playwright click.
- With the dock open, hit-tests the dock's tabs.

Then, at 390×844 with alice's dock open, bob invites her to dance:
- Her Accept, Decline and Play & rides must be reachable.
- She declines with a real tap.
- The idle card must then yield to the open dock again.

The receipt and screenshots go to `output/playwright/greetings-dock/`. This checks the UI layout only, with software rendering. It is not device proof.

## Checks

| Command | Result |
| --- | --- |
| Runner on `main` (CSS unchanged) | **Failed as expected:** 13 problems. 320 and 390: Play & rides and Commands covered by the card, and the tap was intercepted by the card's label. 600: Play & rides covered and the tap intercepted. 700, 768 and 800: the open dock's Camera tab covered, and at 700 also Cycling. 844×390: a tap timed out at 2.5 s waiting for a stable toggle, though its centre was reachable (see the next row). |
| Runner with the first fix (blanket yield), runs 1–3 | Nothing covered at any size. One run timed out at 2.5 s at 700 px ("waiting for element to be visible, enabled and stable"), the same as `main` at 844. The tap budget is now 10 s, and runs 2 and 3 passed at load averages 37–49. |
| Runner with the final fix (only the idle card yields), run 4 (Chromium 156.0.8078.4, SwiftShader) | **Passed:** nothing covered at any of the nine sizes, and every tap opened the dock. Invitation over the open dock: the card stayed at 184 px, Accept and Decline were reachable, Play & rides was reachable, the decline cleared the invitation, and the idle card then yielded. |
| `node preview/e2e/experience-runner.js greetings` (the existing journey, including its 390 px Stop step) | **Passed** |
| `pnpm run verify` (core), on the final fix | **Passed:** agent 109/109; preview 3177, plus 1 skip and 1 todo; server 572, plus 148 Redis skips (core runs without Redis); desktop 69/69 |

## Not covered

- Real phones, Safari and human review. The probe uses software rendering at emulated sizes.
- **Design review.** On a portrait phone the card now opens lower, over the scene, rather than over the top controls. While an invitation is showing over an open dock, it covers part of the dock's tab row until it is answered or expires.
- The probe is a standalone local runner, like the IPIC runners, and is not in hosted CI or an agent profile. `config/agent-workflow.json` is being edited by #407.

## Next action

Open the PR and land it with `pnpm run land <pr> --owner claude:river-oaks-1b`. Then retire the worktree with `project:prune`.
