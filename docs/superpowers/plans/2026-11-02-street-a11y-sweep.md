# Street accessibility sweep (v0.3.0 goal item 5)

Objective: run a keyboard, focus and announcement sweep of the street HUD, places guide, map,
dialogs and venue entries in Chromium and WebKit, using the office probe pattern. Fix every
reproduced defect with a regression.

Branch `fix/a11y-sweep-20261102`; register task `a11y-sweep-v030-20261102`.

## Files owned

- `preview/src/action-cue.js` (new)
- `preview/src/walking-ui.js`
- `preview/src/places-ui.js`
- `preview/tests/action-cue.test.js`

## Method

The probes are in `.runtime/sweep/` (local only, not committed).

- `tab-sweep.mjs` walks the street page's tab order twice: once at rest and once with the map
  and every section expanded. In Chromium it presses Tab; in WebKit it presses Option+Tab,
  because WebKit skips buttons on plain Tab. It then activates every safe button by keyboard and
  checks four things:
  - focus never falls to `<body>`;
  - an opened dialog takes focus;
  - Escape closes the dialog;
  - focus returns to the control that opened it.

  Buttons that sign out, delete, report, travel or start voice are skipped.
- `cue-probe.mjs` records every write to a non-`off` live region while the player arrives at a
  seat.

## Results on main `b67597cf`

Tab sweep in Chromium 156 and WebKit 27.2:

- 18 tab stops at rest and 29 expanded. Every stop has a name and is visible.
- 9 buttons activated at rest and 12 expanded, covering:
  - Commands, People and Settings;
  - movement controls, the play tab, flight and the character studio;
  - Map, places guide, Arrive and Step inside;
  - previous and next destination.
- No focus falls to `<body>`. Every dialog takes focus, closes on Escape and returns focus to its
  opener. After Step inside, the store intro takes focus and Escape returns focus to the canvas.
- No page errors.

Defects reproduced (cue probe, matched controls, both engines):

1. The street action button ("Sit on the bench Z", "Step inside F" and so on) appears with no
   announcement. Screen-reader users get no cue that an action is in reach. The office cue from
   #863 covered only the office.
2. `#places-here` (`aria-live=polite`) is rebuilt with `replaceChildren()` every 500 ms even
   when the words do not change. It logged 10 mutation records in 2.5 s on an unchanged
   "You're near Alice + Olivia (10 m)", which re-queues the same place for a screen reader on
   every tick.

`#world-rules-risk` rewrites as often, but it sets `aria-live=off` on purpose, so it was not
changed.

## Fix

- `createActionCue` adds a polite sr-only `#walking-cue` that names the contextual action once it
  has been in reach for 600 ms, for example "In reach: Sit on the bench. Press Z." Passing actions
  are not spoken, the same action is not repeated, and leaving clears the cue silently.
- `writeLive` makes `#places-here` rewrite only when its words change.

## Evidence after the fix

| Probe | Engine | Cue heard | `#places-here` records |
|---|---|---|---|
| main | Chromium 156 | none | 10 |
| main | WebKit 27.2 | none | 10 |
| fix | Chromium 156 | "In reach: Sit on the bench. Press Z." ×1 | 2 (one rewrite) |
| fix | WebKit 27.2 | "In reach: Sit on the bench. Press Z." ×1 | 2 (one rewrite) |

The unit regressions in `action-cue.test.js` pass 4/4. One of them failed first: the HUD
repeating the same action every frame used to restart the cue's timer forever. The first browser
run of the fix caught that bug.

## Gaps

- No human screen-reader pass. That needs Val (VoiceOver and NVDA).
- The sweep skips travel, voice, report and block buttons, which have their own journeys.
- Touch controls (#830) were not swept.
