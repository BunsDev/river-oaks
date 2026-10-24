# When the network drops

What the play client does when the network goes away mid-action, and how
that is checked (#290). Phones lose the network often: a lift, a tunnel, a
Wi-Fi handover. The client never guesses an outcome and never sends an action
twice.

## Outcomes

Every consequential action ends in one of three states, using the contracts
that already exist:

| Outcome | Town command (`multiplayer-client.js`) | Office desk (`office-desk-model.js`) |
| --- | --- | --- |
| Completed | The town's result arrives. | The server answers with the saved desk. |
| Refused | `command()` while disconnected resolves "Reconnect before taking an action." Nothing is sent. | The server answers with a reason (`desk_conflict`, `invalid_desk`, …). The status reads "Not saved". |
| Unknown | A socket lost with the command pending rejects with "Disconnected. Your action was not confirmed." No result within 8 s reads "The town did not confirm this action." | A request that was sent but never answered is `unconfirmed`. The status reads "Not confirmed". **Try again** repeats the same `operationId`, and the server's receipts keep it from applying twice. |

After an unknown outcome, the town's next snapshot tells the page what
happened: whether the player is inside the shop, or seated. Nothing is
replayed automatically.

## Admitting the loss

- **Connection.** The town sends a snapshot every 200 ms. Online, a visible
  page that hears nothing for 8 s over five checks holds a dead socket
  (`connection-policy.js`). When the browser itself reports offline, 750 ms of
  silence is enough, so the page admits the loss within about two seconds
  instead of eight to thirteen. A socket that keeps delivering, such as one to
  a local server, is kept.
- **Access.** While a resident plays, the page rechecks access every 15 s, and
  again as soon as the browser is back online. Any answer from the server
  (signed out, another account, not approved, an error) still sends the page
  back through the gate. A check that gets no answer at all keeps the
  district: reloading then would only show the browser's offline page.

## Checking it

`preview/e2e/network-transitions.js` (Chromium, local only) proxies the town
socket through Playwright. The town applies each action, then the line is cut
as its result comes back, and the context goes offline.

- Cases: travel into a shop, sitting on a bench, an office-desk save whose
  reply is lost, and a second drop while the page is rejoining.
- Checks: the page admits each loss within 2 s; it says the outcome was not
  confirmed; it refuses new actions while offline; it sends nothing twice; and
  it never reloads.

Run it with:

```sh
RIVER_OAKS_E2E_REPORT=network-transitions-local.json pnpm run test:experience network-transitions
```

The local report name keeps the tracked report untouched. Emulated offline is
not airplane mode on a phone. The phone pass for #288 (`docs/touch-play.md` on
that branch) includes an Airplane Mode step.
