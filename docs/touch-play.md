# Touch play on phones

How each keyboard command is reached by touch, what the browser journeys
check, and a short physical-iPhone pass for a person to run. Phone emulation
in Chromium and Playwright's WebKit supports regression testing. It does not
replace a real iPhone, Safari's software keyboard, safe areas or VoiceOver
(#288).

## Journeys

| Journey | What it checks | Engines |
| --- | --- | --- |
| `touch-hold` | A 390×844 touch phone covers a tap, walking while looking, a second walk finger, touchcancel, the page hiding, capture loss, the Town chat command mid-hold, three fingers lifted out of order and a rotation mid-hold. Nothing keeps moving, nothing is selected by accident and chat text stays text. | Chromium uses real CDP touches. WebKit uses real taps and a real mouse hold. Cases that need two contacts at once are listed as not run, because Playwright's WebKit can only tap. |
| `touch-layout` | 390×844 and 375×667, portrait and landscape: no horizontal scroll; walking controls on screen, uncovered and at least 44 × 44 px; the panel fits the width and scrolls to the end of content taller than the screen (recorded as not run when it fits); closing the panel leaves focus on its toggle in Chromium and on the page in WebKit, which does not focus a tapped button and takes focus off the previous element, and never inside the closed panel; closing a conversation returns focus to the scene. The landscape overlap below is reported as KNOWN. | Chromium and WebKit emulation |
| `touch-people`, `carriage-mobile`, `background-input` | Existing touch selection, ride controls and background release | Chromium |

Run one with `pnpm run test:experience <journey>`. Prefix
`RIVER_OAKS_EXPERIENCE_BROWSER=webkit` for WebKit. Name the report with a
`*-local.json` `RIVER_OAKS_E2E_REPORT` so the tracked one stays untouched.
These journeys are local. No hosted shard runs them.

## Touch gamepad

Touch screens (`pointer: coarse`) walk with a two-thumb layout in the style of
mobile shooters such as CoD Mobile and PUBG Mobile (`preview/src/touch-gamepad.js`):

- **Left thumb: floating stick.** Put a thumb down anywhere in the lower-left
  zone; the stick centres under it. Eight 45° sectors press the same held keys
  as W A S D, so walking, riding and flight keep their server-checked speed and
  collision contracts. The stick never sends analog speeds.
- **Sprint lock.** Pull straight up (within about 23°) past 1.45× the ring and
  the stick locks sprint (Shift); a gold **Sprint** tag shows it. Easing back or
  steering keeps the lock; pulling backward, returning to the dead zone or
  lifting the thumb ends it.
- **Right thumb: look and act.** Dragging anywhere else on the scene looks
  around. A round button under the right thumb runs the current main action
  (talk, sit, step inside, step off the bike) and is labelled with it.
- **Rise and lower.** While flying, or piloting the Ribbonwing, hold ▲ / ▼
  above the action button (Space / C).
- The stick and buttons react on the press itself, so a second finger works
  while the left thumb holds the stick. A conversation or an open chat dock
  hides the gamepad; it releases every held key when hidden.
- Hints switch to touch wording: the help line, and the riding, flight and
  seated hints, name the stick and buttons instead of keys.

The six-button movement pad stays one tap away under **Show movement
controls** as a fallback; a stored choice still wins.

**Not yet thumb-reachable:** getting into or out of a vehicle, taking flight
and Ribbonwing maneuvers remain in **Play & rides** → Character.

## Command → touch path

The fallback movement pad appears under **Show movement controls** in the walking
console. On screens up to 900 px wide an open **Town chat** dock hides the
walking console, and the dock opens by default. Tap **Town chat** to fold it,
and the console and pad appear. **Play & rides** opens the Play dock; its
**Character** tab holds the avatar controls.

| Keys | Command | Touch path | Checked by |
| --- | --- | --- | --- |
| W A S D | Walk | The left thumbstick, or hold ↑ ← ↓ → on the fallback pad | `touch-gamepad` unit; `touch-hold` (pad) |
| ← → | Turn | Drag on the scene, or the turn buttons at either end of the pad | `touch-hold` (drag) |
| Mouse drag | Look | Drag on the scene. While the left thumb holds the stick, a second finger looks. | `touch-hold` (Chromium) |
| Shift | Brisk walk | Pull the stick straight up past the ring to lock sprint | `touch-gamepad` unit |
| E | Talk | **Find a local to talk to** / **Meet someone nearby**, or tap the person | `touch-people` |
| F, Shift+F | Doors and stairs | **Step inside** / **Go down one level**, shown when close enough | Code path |
| Z | Sit or water | **Sit down** (the label follows the place) | Code path |
| Q, G | Call the ride, get in or out | Character → **Call Jev** / **Ride with Jev** / **Step out** | `carriage-mobile` |
| J | Walk with Jev | Character → **Walk with Jev** | Code path |
| B, Space, C | Fly, rise, lower (Jevica) | Character → **Take flight**, then hold ▲ / ▼ on the gamepad | Code path |
| V | Camera | Character → **Third person** / **First person** | Code path |
| Y | Voice | **Join voice** in the walking console or the chat dock | Code path |
| M | Mute, or push to talk | The mic button. In push-to-talk mode, hold it to talk. Lifting or a cancelled touch stops transmitting, and the tap that ends a hold never turns the microphone on. The hold belongs to the finger that started it: a second finger on the same button neither restarts nor ends it. The button keeps a held finger from becoming a pan (`touch-action: none`). M and the mic buttons share one hold, so releasing any of them stops talking. | `voice-ui` unit; `touch-layout` (touch-action) |
| Enter | Send chat | The chat field and **Send** | `touch-hold` (chat field) |
| Escape | Close a conversation | **Close** in the conversation | `touch-layout` taps it when someone is near enough to meet; otherwise it records the case as not run |
| ⌘/Ctrl+B, ⌘/Ctrl+Shift+B | Explore rail, Play dock | The Explore button, **Play & rides** | `touch-layout` (panel) |
| / | Search places | Explore → Places → **Search the district** | Code path |
| ?, ⌘/Ctrl+K | Commands and keys | **Commands**, then search and tap a command | Code path. `touch-hold` reaches Town chat through the dialog's keys mid-hold |

"Code path" means the control exists as a touchable button, but no journey
taps it on a phone yet.

**Taps while holding.** In Chromium, a tap by a second finger while another
finger holds a control produces no click. With a thumb on the pad, a second
finger can look around, but it cannot press **Talk** or **Commands**; lift
first. The iPhone pass checks whether Safari behaves the same way.

**Known gap: landscape.** At 844×390 and 667×375 the walking console, with
the pad shown, reaches up under the top-right stack. **Commands** covers →
and the right turn button, **People** covers **More**, and **Play & rides**
covers the main action. A tap there opens the HUD button instead. Portrait
is clear. Fixing it needs a layout decision for short screens, so this lane
records it rather than changing the HUD.

## Ten-minute iPhone and VoiceOver pass

Use a signed-in, approved account on a physical iPhone in Safari. Note the
model, iOS version and build commit, then mark each line pass or fail. Add a
screenshot for any fail.

1. **Layout (1 min).** In portrait, check that nothing sits under the notch,
   Dynamic Island or home indicator. Tap **Town chat** to fold it, then open
   **Show movement controls**; the pad and the console buttons should all
   show. Note whether you expected to see the pad without folding chat.
   Rotate to landscape and note whether **Commands** covers the → buttons
   (the known gap above), then rotate back.
2. **Holds (3 min).**
   - Hold ↑ with a thumb and drag the scene with a second finger. The view
     turns while you walk; lifting both stops you.
   - Hold ↑ and add a finger on →. Lift ↑: you keep moving right. Lift →:
     you stop.
   - Hold ↑ and swipe to the app switcher, then return. You are not moving.
   - Hold ↑ and, with another finger, tap **Commands**. Note whether it
     opens; Chromium ignores a tap like this. If it opens, search "town
     chat" and tap **Town chat**. The keyboard opens in the chat field,
     typing "wasd" gives text only, and you are still when it closes.
   - Hold ↑ and rotate the phone. Nothing moves once you lift.
   - Put three fingers down at once. Nothing gets stuck, and no conversation
     opens unless you tapped a person.
3. **Network (2 min, with the #290 change).** Turn on Airplane Mode while walking. Within about two
   seconds the page says it lost the town. Try to sit; it says to reconnect
   first. Turn Airplane Mode off; the page rejoins on its own. Sit on a bench
   and toggle Airplane Mode as you tap **Sit down**. After rejoining you are
   either seated or told it was not confirmed, never seated twice.
4. **VoiceOver (3 min).** Turn on VoiceOver with the accessibility shortcut.
   - Swipe through the walking console. Each control has a spoken name, such
     as "Walk forward" or "Show movement controls".
   - Double-tap the Explore button, swipe inside the panel, then close it.
     VoiceOver's cursor should return to the button that opened it.
     Focus returns to the button that opened it.
   - Double-tap **Meet someone nearby**, then close the conversation. Focus
     returns to the scene or the button.
   - If voice is on: in push-to-talk mode, double-tap and hold the mic button
     to talk, then release. Talking stops. Without VoiceOver, hold the mic
     button and let your finger drift a little: talking should not cut out.
5. **Display (1 min).** Under Settings → Accessibility, turn on Larger Text
   and Reduce Motion. Reload the page; text and buttons still fit and nothing
   overlaps.
