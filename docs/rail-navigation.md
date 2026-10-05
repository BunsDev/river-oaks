# Rail navigation and keyboard review

Scope: left People / Places / Settings rail, right play rail, multiplayer content,
contextual walking / conversation / bird HUDs, and their keyboard handoffs.
Also inspected the world studio's region inspector and the developer debug panel.

## Findings and implementation

- Left rail: add Cmd/Ctrl+B, retain the selected tab and each tab's scroll position,
  expose direct tab navigation, and return focus safely when closing.
- People: nearby residents and meeting actions lead; town chat, contacts, and
  groups follow before optional neighbor-help scenarios.
- Places: current position, map, meeting spots, landmarks, destination search,
  shared worlds, then events. Keep lists as keyboard alternatives to the map.
- Settings: appearance and graphics first; atmosphere, voice connections,
  resident behavior, layers, and district evidence in labeled disclosures.
- Play rail: Cmd/Ctrl+Shift+B, stable activity ordering, quick section jumps,
  remembered open/closed choice, and context-aware current activity feedback.
- Power users: searchable Commands menu (Cmd/Ctrl+K or ?), Alt+1/2/3 tabs,
  / destination search, and visible context-specific gameplay key reference.
- Shortcuts must not fire while typing, composing text, using AltGraph, or inside
  other modal dialogs/auth gates. Modifier shortcuts must not fire gameplay actions.
- Escape dismisses the current navigation surface before gameplay handlers;
  returning to the world is explicit. No activity-based reshuffling of controls.
- Compact windows show one competing rail/conversation at a time when explicitly
  requested. Bird rides and builder mode survive dismissing navigation surfaces.
- Region inspector: precise coordinates, item selection, then item fields. Native
  modal ownership protects its shortcuts; the inspector reflows below the map on
  narrow screens. Its layout already follows the editing task, so it stays intact.
- Debug panel: F3 remains its independent developer shortcut. Layer toggles lead,
  cursor/selection evidence follows, and expensive mesh detail stays disclosed.
  Debug UI remains separate from player-facing commands.

## Navigation keys

| Key | Action |
| --- | --- |
| Cmd/Ctrl+B | Toggle left exploration rail |
| Cmd/Ctrl+Shift+B | Toggle right play rail |
| Cmd/Ctrl+K | Search commands |
| ? | Commands with current gameplay keys expanded |
| Alt+1 / Alt+2 / Alt+3 | People / Places / Settings |
| / | Focus destination search |
| Arrow keys / Home / End | Select a tab while the tab row is focused |
| Escape | Dismiss current rail/menu and return focus |
| H | Toggle clear view |

All shortcuts have button alternatives. The Commands menu filters unavailable
actions from the current solo/shared mode and server-confirmed capabilities.
Clear view and Show controls live in Commands (?), with H as their shortcut;
Commands remains visible when the visit cards are hidden.

## Game UI guidance

Applied Xbox guidance rather than assuming all AAA games share a shortcut scheme:

- [XAG 112: UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112):
  consistent order, predictable focus, alternate ways to find content, persistent
  return paths, and reflow without two-dimensional scrolling.
- [XAG 107: Input](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/107):
  keyboard alternatives and simple, single-press menu controls. Mouse/touch
  equivalents remain available; shortcut chords are optional accelerators.

This implements rail navigation, not a claim of full XAG compliance, controller
support, or comprehensive gameplay remapping.

## UI review

### Predictable focus and navigation

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| HIGH | preview/src/keyboard-input.js:2 | System chords could activate gameplay actions | Gameplay ignores modifier chords and composition | Keyboard navigation must not change gameplay accidentally |
| HIGH | preview/src/rail-navigation.js:100 | Focus could leave the new command dialog | Tab wraps; Escape restores focus; other modals retain ownership | Predictable focus and a reachable return path |
| MEDIUM | preview/src/play-dock.js:30 | Long activity stack; jumps could focus hidden controls | Fixed activity navigation above scrolling cards; jumps focus available controls | Stable hierarchy and visible focus |

### Task hierarchy and reflow

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| MEDIUM | preview/src/multiplayer-client.js:46 | Town administration preceded nearby residents | Meeting actions lead, public chat follows, account exits come last | The immediate task precedes secondary tools |
| MEDIUM | preview/src/sidebar.js:72 | Lighting preceded common appearance/graphics controls | Common settings lead; secondary controls use labeled disclosures | Progressive disclosure keeps frequent decisions easy to find |
| MEDIUM | preview/src/rail-navigation.css:3 | Short screens and shortcut labels could overlap chrome | Separate navigation/card scrolling and reserved space for HUD controls | Reflow preserves readable labels and reachable controls |

Motion verification: navigation changes are immediate; the existing reduced-motion
behavior remains covered by the UI-polish browser journey. Hover and focus styles
reuse the district's tokens, with 44px command buttons and coarse-pointer activity
targets. Loading, unavailable actions, empty command searches, and focus recovery
were inspected through source and browser acceptance.

## Verification ledger

- [x] Browser: modifier isolation, typing/composition/modal guards, both rails,
  commands filtering and execution, focus return, persistence, tab navigation,
  per-tab scrolling, clear-view recovery, contextual hints, mobile/short desktop.
- [x] Existing sidebar, UI polish, places, HUD, avatar and multiplayer journeys.
- [x] Unit tests, production build, and diff checks.
- [x] Rendered review of desktop, compact, mobile, and dark-theme layouts.

Validation on October 5, 2026:

- `npm test`: 666 passed, zero failures.
- `node preview/e2e/experience-runner.js rail-navigation`: 66 browser assertions,
  including mobile portrait/landscape and short desktop controls.
- Existing sidebar, Places, UI polish, HUD/quality, and avatar journeys passed.
- `node preview/e2e/shared-runner.js development`: public/private chat, groups,
  world events, and guest capability-aware navigation passed.
- `RIVER_OAKS_SHARED_JOURNEY=rail-shared node preview/e2e/shared-runner.js development`:
  16 owner assertions passed, including builder preservation, character focus,
  and the real region-editor modal.
- Lyra's opaque velvet wrap covers the rear beneath the sheer train in both
  upright forms; indexed-geometry coverage checks and rear renders passed.
- `npm run build` passed; the existing large-chunk warning remains.
- `git diff --check` passed.

Local evidence: `output/playwright/rail-verification.json`, the acceptance JSON
files beside it, and `rails-*.png` rendered captures. These are loopback browser
fixtures with full WebGL rendering, not hosted sign-in or live provider acceptance.

UI-polish verdict: **Approve** for the inspected navigation surfaces. No HIGH
findings remain in that scope.

Independent code review found modal gameplay leakage and composing-Escape
fallbacks. Both were fixed and covered by browser acceptance before delivery.

Human VoiceOver and controller acceptance are outside this verification.
