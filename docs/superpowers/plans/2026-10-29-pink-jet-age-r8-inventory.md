# Pink Jet-Age R8 increment 1: HUD control inventory and token contrast baseline

- **Issue:** #746 (package R8 under epic #738), first acceptance item only
- **Task id:** `pink-jet-age-r8-inventory` (live register)
- **Owner:** `claude:cody-pja-r8-20261029`
- **Branch:** `feat/pink-jet-age-r8-inventory-20261029`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r8`
- **Baseline head:** `7cc1fb871d41c6ec0f166d89e4ef559f17728e5e` (fetched `origin/main`, 2026-10-29)

## Objective

Inventory the current HUD control families and their states (default, hover/focus,
disabled, pending, error, blocked, private, offline), the colour tokens behind them per
theme and transparency variant, raw colours that bypass the tokens, and every place
TypeSafe pink is used as text. Pin today's text contrast in a node regression so the
coming Pink Jet-Age skin cannot quietly regress it. **This slice changes no colours.**
It does not implement the pink HUD skin: the finish switch (`readFinishPreference()` in
`render-quality.js`, PR #753) is not on main yet.

`docs/design/pink-jet-age/` is not on main (the issue's SVG lives at a branch commit),
so this inventory is part of the ledger.

## Files owned

- `preview/tests/hud-token-contrast.test.js` (new)
- `docs/superpowers/plans/2026-10-29-pink-jet-age-r8-inventory.md` (this ledger)

## Checks

| Command | Why |
| --- | --- |
| `node --test preview/tests/hud-token-contrast.test.js` | The new regression |
| `pnpm run verify` | Core gate (test-only and docs change; no browser profile needed) |

## Method (the regression)

`preview/tests/hud-token-contrast.test.js` reads the token sheets in their `main.js`
import order (`style`, `playground-theme`, `district-theme`, `immersive`, `sidebar`,
`visual-finish`, `retro-finish`, `rail-navigation`, `hud-glass`, `game-hud`,
`settings-dialog`, `play-rail-menu`, plus the sign-in gate's `access-theme`). It keeps
custom properties declared on bare `:root[...]` selectors and resolves them by
specificity then order for eight scenarios: light/dark × default, reduced transparency
(`@media (prefers-reduced-transparency: reduce)`), no backdrop filter (`@supports not`),
and software rendering (`data-rendering=software`). `var()` fallbacks, `rgb()` with
alpha and `color-mix(in srgb, …)` are resolved.

A translucent sheet is bounded exactly as `preview/e2e/walking-controls-contrast.js`
bounds it: the layer stack is composited over a pure black and a pure white world and
the lower ratio is kept. The backdrop filter's brightness (1.16/0.78 for `--hud-filter`,
1.18/0.8 for `--liquid-filter`) and the town-gate veil are ignored, so for translucent
surfaces the bound is conservative.

Every pair below is a text/surface combination a real rule paints (cited by
file:line). Thresholds: 4.5 for text (no HUD text here reaches the 18.66px bold / 24px
large-text size), 3 for focus rings (WCAG 1.4.11). Disabled controls are exempt
(WCAG 1.4.3) and not asserted.

Guards: the cascade list must match `main.js`'s CSS import order; no token a pair reads
may be declared under an unmodelled at-rule condition; `--accent` must resolve to
retro-finish's teal; each known gap must still fail (a fixed gap fails the suite until
its entry is removed, so it becomes enforced).

## Results

Run on the baseline head: 275 tests, 240 pass, 35 todo (known gaps), 0 fail.

`pnpm run verify` (core) passed on baseline `7cc1fb87` plus this diff (uncommitted, receipt
`.runtime/agent/core.json` `passed`): tooling 289/289; preview 4624 tests, 4588 pass, 1
skip, 35 todo (this file's gaps; node's spec reporter lists failing todos under "failing
tests" with `fail 0`); server 1077 pass, 283 Redis skips; desktop 127 pass, 5 skips;
ruff clean; Python 170 passed; offline demo its documented expected exit 2. Redis,
browser and dependency audit are outside core and were not run (no browser surface changed).

### Pairs and ratios (default glass; reduced transparency in brackets where it differs)

| Pair | Rule | Light | Dark |
| --- | --- | --- | --- |
| `sheet-ink` `--ink` on `--hud-glass` | hud-glass.css:98; game-hud.css:43,115 | 6.88 [10.32] | 7.28 [13.78] |
| `sheet-hud-muted` `--hud-muted` on glass (place, More, chat subtitle) | hud-glass.css:218-219; game-hud.css:121 | 4.72 [7.09] | 4.74 [8.98] |
| `sheet-muted` legacy `--muted` on glass (chat status, empty chat) | game-hud.css:131-132 | **3.34** [5.02] | 5.21 |
| `tile-ink` `--ink` on `--hud-tile` | hud-glass.css:208; play-rail-menu.css:41; game-hud.css:126 | 6.30 | 6.24 |
| `tile-hud-muted` `--hud-muted` on tile (pane body, disabled send) | play-rail-menu.css:43,67; hud-glass.css:281 | **4.32** [6.45] | **4.06** [7.67] |
| `tile-hover-ink` | hud-glass.css:211; play-rail-menu.css:11 | 5.86 | 5.50 |
| `raised-ink` `--ink` on `--hud-raised` (pane buttons, pills, chat input, held pad) | play-rail-menu.css:44; hud-glass.css:214,275; game-hud.css:129 | 11.02 | **4.46** [7.78] |
| `keycap-ink` | hud-glass.css:126-128,145-147 | 10.02 | 4.81 |
| `context-chip` `--ink` on 18% `--hud-action` | play-rail-menu.css:35 | 5.67 | 6.31 |
| `chat-accent` `--accent` on glass/tile | game-hud.css:123,127 | **3.56** [5.30] | 5.24 |
| `chat-jump` `--accent` on `--accent-soft` | game-hud.css:133 | 5.15 | 5.56 |
| `action-fill` `--hud-on-action` on `--hud-action` (primary prompt, selected Play tab, office enter, chat send) | hud-glass.css:202; play-rail-menu.css:12,56; game-hud.css:130 | 5.27 | **3.67** (opaque) |
| `action-keycap` on 16% white over `--hud-action` | hud-glass.css:217 | **3.79** (opaque) | **2.86** (opaque) |
| `community-primary` `--on-accent` on `--accent` | playground-theme.css:22; hud-glass.css:174 | 6.50 | 11.89 |
| `places-error` raw `#b3261e` / `#ffb4ab` on glass | places-guide.css:42,138-139 | **3.90** [5.86] | 5.05 |
| `movement-legend` raw `#c9c5d2` on glass | visual-finish.css:238 | **1.01** [1.52] (opaque) | 5.06 |
| `sheet-focus` `--hud-focus` ring (3:1) | hud-glass.css:109-113; game-hud.css:141-142 | 4.08 | 5.47 |
| `map-button-ink` `--liquid-ink` on liquid tint | game-hud.css:53-55 | **4.16** [11.42] | **2.55** [14.39] |
| `map-button-keycap` `--muted` on liquid tint | game-hud.css:49,53-55 | **1.74** [4.77] | **1.69** [9.54] |
| `gate-town-muted` `--liquid-muted` | multiplayer.css:13,32 | **3.22** [8.83] | **1.77** [9.95] |
| `gate-town-well` `--liquid-ink` on `--liquid-well` | multiplayer.css:36,43 | 7.40 | **2.32** [11.31] |
| `gate-town-primary` `--liquid-on-accent` on the gradient's light stop | multiplayer.css:41 | **4.14** (opaque) | 9.07 |
| `gate-town-kicker` raw `#7d2449` / `#f2a6c8` | multiplayer.css:27-28 | **2.94** [8.05] | **1.47** [8.27] |
| `settings-ink` on `--panel` | game-hud.css:90 | 10.23 | 9.73 |
| `settings-muted` (header, idle tabs, footer) | game-hud.css:95,101,108 | 4.98 | 6.97 |
| `settings-hud-muted` (intro, group titles) | settings-dialog.css:8,11 | 7.03 | 6.34 |
| `settings-segment-idle` / `-hover` / `-pressed` | settings-dialog.css:21,23,25 | 6.39 / 7.86 / 11.32 | 5.38 / 6.18 / 5.67 |
| `settings-tab-selected` `--accent` on `--accent-soft` | game-hud.css:102 | 5.15 | 5.56 |
| `settings-destructive` raw `#a33a32` / `#ff9f94` on tile | settings-dialog.css:78,91-92,110-111,125-126,189-190 | 5.30 | 4.93 |
| `settings-link` (`--hud-action` / `--hud-focus`) | settings-dialog.css:95-96 | 4.92 | 8.54 |
| `settings-focus` ring (3:1) | game-hud.css:141 | 6.02 | 7.24 |
| `signin-ink` / `-muted` / `-quiet` on `--gate-bg` (one theme) | access-gate.css:6,43,47,51,135 | — | 16.81 / 8.59 / 5.38 |
| `signin-pink-kicker` `--gate-pink` on `--gate-bg` | access-gate.css:36 | — | 7.99 |
| `signin-on-pink` `--gate-on-pink` on pink | access-gate.css:87,110,115 | — | 6.86 |

Bold = below threshold. Software rendering gives the same values as reduced
transparency; no backdrop filter is within 0.8 of them and fails nothing reduced
transparency passes. Every value is printed by the test's `measured ratios (report)`
diagnostic.

### Known gaps (todo in the test; colours unchanged)

**Below threshold on an opaque surface (defects regardless of the world behind):**

1. `action-fill`, dark, every variant: 3.67. `--hud-action` `#3f8f7f` with
   `--hud-on-action` `#f4fbf8` (hud-glass.css:39-40). This is the walking console's
   primary prompt, the selected Play tab, office enter and chat send: the most
   prominent action in the HUD.
2. `action-keycap`, both themes: 3.79 light / 2.86 dark (hud-glass.css:217). The keycap
   is `aria-hidden`, but it is visible text.
3. `movement-legend`, light, every variant: 1.01 to 1.52. `.walking-help` keeps a raw
   `#c9c5d2` (visual-finish.css:238, specificity 0,3,0) written for the old dark
   console; hud-glass.css made the console light-glass in light theme and never re-coloured
   it. Visible when the movement pad is open above 650px wide (walking.css:6).
4. `gate-town-primary`, light, every variant: 4.14 at the gradient's light stop
   (multiplayer.css:41); the bottom stop passes.

**Below threshold only under the black/white bound (pass with reduced transparency;
measure in the browser before calling them defects):** `sheet-muted` light 3.34,
`tile-hud-muted` light 4.32 / dark 4.06, `raised-ink` dark 4.46, `chat-accent` light 3.56,
`places-error` light 3.90, `map-button-ink` light 4.16 / dark 2.55, `map-button-keycap`
light 1.74 / dark 1.69, `gate-town-muted` light 3.22 / dark 1.77, `gate-town-well` dark
2.32, `gate-town-kicker` light 2.94 / dark 1.47. The liquid-glass tints (town gate, Map
button) are only 52-70% opaque by design ("at least half opaque", hud-glass.css:44), so
they depend on their filter and veil; the e2e contrast journey does not cover them.

### Pink Jet-Age role projections (report only, `PINK_JET_AGE` in shared/city-kit/catalog.js)

| Use | Ratio | Meets |
| --- | --- | --- |
| ink `#24242A` on ivory `#F7F1E8` (sheet text) | 13.74 | 4.5 |
| ink on ivory glass at 80% (black/white bound) | 8.60 | 4.5 |
| ink on mint glass `#BFE2DE` (tile) | 11.13 | 4.5 |
| ink on chrome `#BCC5C8` (raised control) | 8.79 | 4.5 |
| garden `#4A6A55` on ivory (secondary text / link) | 5.37 | 4.5 |
| ivory on garden (action fill) | 5.37 | 4.5 |
| **pink `#F486A1` on ivory (pink as text)** | **2.13** | no |
| **pink on mint glass** | **1.73** | no |
| **ivory on pink (light text on a pink fill)** | **2.13** | no |
| ink on pink (dark text on a pink fill) | 6.45 | 4.5 |
| **pink vs ivory (focus ring)** | **2.13** | no (3) |
| garden vs ivory (focus ring) | 5.37 | 3 |
| ivory on ink (dark sheet text) | 13.74 | 4.5 |
| mint glass / chrome on ink (dark secondary) | 11.13 / 8.79 | 4.5 |
| pink on ink (pink as text, dark) | 6.45 | 4.5 |
| **garden on ink (dark)** | **2.56** | no |
| pink vs ink (focus ring, dark) | 6.45 | 3 |

So for the skin: pink can be a fill under **ink** text, or text/rings on **ink**, but
never text, a focus ring or a fill under ivory/white text on the pale surfaces. Garden
works as the light-theme action/link colour and not on ink. This agrees with the
issue's "TypeSafe pink is an accent, not a readable foreground for every pale surface".

## Inventory

All paths are under `preview/src/` unless shown. "Signal" says whether a state is
conveyed by colour only or also by text, icon or ARIA.

### Structural facts

- **`--accent` is teal at runtime.** retro-finish.css:2-3 (`#286768` / `#b8e4ca`) loads
  after visual-finish.css:10,25 (`#913b68` / `#efb4d0`) and playground-theme.css:3-4
  (`#ad267e` / `#e2a1c9`). `--on-accent` exists only in playground-theme.css. The test
  pins this.
- **Three accent systems coexist:** `--accent` (teal), `--hud-action` / `--hud-focus`
  (hud-glass.css:20-22, 39-41, green-teal), and `--liquid-accent` (hud-glass.css:59,75).
  Pink survives only in raw hex and in `--places` inside `#control-panel`
  (sidebar.css:2-3, `#963966` / `#f3acd0`).
- **Game-HUD mode hides the rail's identity and nav** (game-hud.css:7; sidebar.js:51-52);
  `.access-tools` moves to Settings > Account (sidebar.js:135). No JS sets
  `aria-selected` on `.experience-nav` or `data-tone` for sections, so `--section-color`
  rules (sidebar.css:4-6,12-14; hud-glass.css:167-168,175-176) are dormant.
  `.play-rail-nav` rules (rail-navigation.css:4,7-8; hud-glass.css:187-189) have no
  element; the live tabs are `.play-rail-tab`.
- **Theme:** `public/assets/boot/first-paint.js:11-19` sets `data-theme` before paint;
  theme.js:10-45 owns it at runtime (`data-theme-changing` for two frames, `aria-pressed`
  on the switch). `data-rendering=software` comes from hardware-acceleration.js:18-22.
- **The sign-in gate has no light theme**: `--gate-*` (access-theme.css:9-14) have one
  value each.

### Families × states

| Family | Default | Hover / focus | Disabled | Pending | Error | Blocked | Private | Offline |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Explore space, Map button, People/Settings launchers | game-hud.css:9-14,38-55; hud-glass.css:92-99 | Map lens motion only (game-hud.css:68-70); launchers: none. Focus hud-glass.css:109-113, game-hud.css:141-142. Expanded: outline game-hud.css:71,77 + `aria-expanded` (sidebar.js:78) | `#visit-destination`/`#enter-destination` opacity .45 (district-theme.css:22,59); global `button:disabled` (style.css:2; visual-finish.css:154) | — | Directory "No matching destinations" text (district-ui.js:13-14) | — | Enter becomes "Invitation required" + disabled (district-ui.js:17-18): text | `#connection` text (main.js:263,820); `.live-dot` static colour, never toggled (style.css:2,11) |
| Play dock (`.visit-tools`, `.play-rail-tab`) | visual-finish.css:105-108; play-rail-menu.css:4-8,41-44; play-dock.js:8-20,43-47 | Tabs play-rail-menu.css:11; pane buttons :45; toggle none. Focus hud-glass.css:109, play-rail-menu.css:46. Selected: fill + bar (play-rail-menu.css:12,14) + `aria-selected` (play-dock.js:69) | Pane buttons opacity .55 (play-rail-menu.css:47); empty tabs hidden (play-dock.js:110) | `aria-busy` portrait opacity (visual-finish.css:143; player-avatar.css:19) + "Saving character…" (player-avatar.js:200,233,287) | — | — | Office "Invitation required", enter disabled (office-ui.js:231); refusals office-ui.js:11 | — |
| Walking console (`#walking-hud`) | hud-glass.css:92-99,198,266-269; walking-ui.js:28-36,76 | Other actions hud-glass.css:211; pad :213; focus :109-113 (old pink ring walking.css:15 superseded). Held pad: colour/border only (hud-glass.css:214; walking-ui.js:265,270) | Talk disabled = hidden (walking-ui.js:415-416); Enter disabled for invite-only (:432) | `aria-disabled` opacity .72 + `cursor:progress` (walking.css:17; walking-ui.js:39,420,424) | `.walking-notice` `role=status` `aria-live` (visual-finish.css:248-262; hud-glass.css:223; walking-ui.js:28,100-104,184-188): text | "The way through is blocked right now…" (walking-ui.js:184; travel-message.js:4-10): text | "`<Store>` · Invitation required", disabled (walking-ui.js:432,438) | — (the town gate inerts the app) |
| Commands (`.commands-toggle`, `dialog.rail-commands`) | rail-navigation.css:12-31; hud-glass.css:92,116-132,180; `aria-keyshortcuts` (rail-navigation.js:17) | Results rail-navigation.css:23; toggle none. Focus hud-glass.css:110-112 | Disabled targets removed from the list (rail-navigation.js:22-29,78) | — | "No matching commands…" `role=status` (rail-navigation.js:12,94) | — | — | — |
| Settings dialog and quality | game-hud.css:86-111; settings-dialog.css:6-162 | Tabs: no hover. Segmented hover settings-dialog.css:23; pressed :24-27 + `aria-pressed` (theme.js:27-28; render-quality.js:144). Selected tab: bar + colour + `aria-selected` (game-hud.css:102; sidebar.js:140). Focus game-hud.css:141 | opacity .55 (settings-dialog.css:113,128; moderation-reports.js:31; account-deletion.js:57-58) | Quality readout "…" (render-quality.js:135); "Deleting your account…" (account-deletion.js:68) | Raw red text + words (settings-dialog.css:91-92,110-111,125-126,189-190; "Overdue" moderation-reports.js:90) | Blocked list: text, `role=status`, no CSS (player-blocks.js:111-151) | — | Force-closed when the gate locks (multiplayer-client.js:78) |
| Places guide and map | places-guide.css:15-140; world-map.css:1-112; kind icons + text (places-guide.css:96-112) | Many hover rules (places-guide.css:21-124; world-map.css:48). Selected `aria-selected`/`aria-pressed` (places-guide.css:64,80). Focus places-guide.css:50,76; world-map.css:19,85,90 | opacity .5 `cursor:wait` (places-guide.css:121,152; world-map.css:91; places-ui.js:59,88) | "Heading to X…" text (places-ui.js:45) | `data-tone=error` raw red + text (places-guide.css:138-139; places-ui.js:20,45,63,87,92-94) | "That spot is blocked…" in roster notice (multiplayer-client.js:455) | Only an enter refusal "This home is private…" (main.js:868); nothing on the map | Peers cleared (multiplayer-client.js:357); no style |
| People roster, chat, block, report | multiplayer.css:56-69,113-175; hud-glass.css:272-281; game-hud.css:113-135 | multiplayer.css:160; hud-glass.css:276. Focus multiplayer.css:174, game-hud.css:141 | opacity .5 (multiplayer.css:161); chat send hud-glass.css:281; disabled until connected (multiplayer-client.js:53,318,357) | "Sending…" (town-chat.js:56); Report disabled in flight (multiplayer-client.js:180) | Roster notice `role=status` (multiplayer-client.js:46,180,182,284,299) | Block → "Confirm block" → Unblock with matching `aria-label`, announced (player-blocks.js:68-71,92,97-99): text; World-rules emergency stop raw `#a3242f` (multiplayer.css:237-241) | "Private home guests" / "Private messages…" headings (social-ui.js:35,93) | Roster `data-connected` set (multiplayer-client.js:80) but no CSS reads it |
| Community dialogue | community-dialogue.css:2-145; community.css:24-59 | Accent border (community-dialogue.css:134); pressed topic + `aria-pressed` (:81; community-ui.js:355); focus :135 | Dashed border + muted + reason text (community-dialogue.css:132-133; community-ui.js:297,333,378-390) | `.community-topics[aria-busy=true]` (:82) never set true (community-ui.js:357 writes `'false'` only) | — | — | — | Buttons disabled when offline (community-ui.js:297,333,378-386): `disabled` only |
| Voice | voice.css:4-6,14-16; keycaps voice-ui.js:10-17 | voice.css:7,17; pressed fill + `aria-pressed` + text (voice.css:8,18,27; voice-ui.js:72,74,84) | Hidden when unavailable (voice-ui.js:65) | `aria-disabled` opacity .6 `cursor:progress` (voice.css:9,19; voice-ui.js:68,73) | `role=status` message (voice-ui.js:27,76) | Autoplay: "Enable audio" button (voice.css:20; voice-ui.js:75) | — | Connection lost → rejoining, `aria-disabled` (multiplayer-client.js:362) |
| Town gate (connection) | multiplayer.css:4-54 (liquid glass) | button hover :45-46; focus :54 (3px `--liquid-accent`) | — | Status well + bead while no action (multiplayer.css:35-38; off under reduced motion :49 and software :52-53) | Texts from connection-policy.js:41-58 ("Reconnecting…", "Connection lost. Rejoining…", "This account cannot join the town."); retry/refresh (multiplayer-client.js:218-222,366) | "This account cannot join" text | — | Gate is `role=dialog` `aria-modal` and inerts `.app-shell` (multiplayer-client.js:74-86): text, no colour state |
| Sign-in gate (`access-gate.css`) | access-gate.css:4-144 | Hover :21,91,97,109-124,209; focus 2px `--gate-pink` :22,125,136,210 | `#939599` text (:114,116) | "Checking your access…" / "Saving…" / "Opening the district…" + pulse (index.html:51; access-entry.js:142,178; access-gate.css:69-76) | Text + retry (access-entry.js:156-158,183,209-253) | "Your request wasn't approved" (access-entry.js:21,121,129-130) | Waitlist card (access-entry.js:116-133) | Same as error |
| Office desk / Computer | office-desk.css:1-23 (light only, `color-scheme:light`, all raw hex) | `filter:brightness(.96)` (:3); focus 3px `#bc8841` (:3); selected via `aria-current`/`aria-pressed`/`aria-selected` (:5,15,19) | opacity .45 (:3) | `data-state=saving/dirty` bullet + "Saving…"/"Unsaved changes" + `aria-busy` (:8; office-desk-ui.js:48,52-53) | `data-state=error` `#914f3e` + `role=alert` (:8; office-desk-ui.js:27,52-55,147) | — | `.desk-private` "Private to you" / "Separate Computer sign-in" (:4; office-desk-ui.js:17,87) | "Offline · Computer is keeping changes in this browser" (office-desk-ui.js:9); the bar bullet is pink `#f486a1` in every state (:20) |
| Loading, graphics recovery, hardware warning | style.css:2; playground-theme.css:37; graphics-recovery.css:1-17; hardware-acceleration.css:16-35 | Retry/report buttons hud-glass.css:293-294 | Recovery button `aria-disabled` with no CSS (graphics-recovery-ui.js:40) | "Restoring graphics…" live region (graphics-recovery-ui.js:5,33-38); `data-state` has no CSS | `.loading-state.error` mark colour changes only in dark: in light playground-theme.css:37 overrides it (style.css:2,11; main.js:256-263) | — | — | — |

### Raw colour that bypasses tokens

1,272 raw hex literals across `preview/src/**/*.css` (`#[0-9a-fA-F]{3,}\b`). HUD-relevant
counts: style.css 102, visual-finish.css 75, office-desk.css 63, playground-theme.css 45,
world-map.css 42, places-guide.css 32, retro-finish.css 32, access-gate.css 29,
world-portal.css 27, multiplayer.css 26, walking.css 26, access-theme.css 19,
game-hud.css 17, hud-glass.css 16, sidebar.css 14, immersive.css 11, settings-dialog.css 8,
play-rail-menu.css 4, rail-navigation.css 2. Zero: voice, wishes, graphics-recovery,
cycling-leaderboard, ui-motion, bird-cams-ui.

Raw **text** colours still in effect on HUD surfaces: walking.css:1 (`.walking-hud`
`#f8f5ed`, title over the world with a scrim at visual-finish.css:224-227);
visual-finish.css:238 (`.walking-help` `#c9c5d2`, gap 3); multiplayer.css:27-28 (gate
kicker), :110 (`.remote-player-label` white on `#372534d9`), :237-239 (emergency stop),
:254 (`.crime-wanted` `#b8860b`); settings-dialog.css destructive reds; places-guide.css:138-139;
hardware-acceleration.css:19,35; visual-finish.css:119,121,132 (player reference,
monogram, flight button); retro-finish.css:8-9 (`#player-carriage`); office-desk.css
(whole palette); access-gate.css:14-40,70,114,116,130. Superseded raw values remain in
walking.css:1,9-12, playground-theme.css:41-45, visual-finish.css:146-148,
retro-finish.css:5-7, district-theme.css:32,53,62 and immersive.css:54.

### TypeSafe pink as foreground

| Where | Pink | On | Status |
| --- | --- | --- | --- |
| access-gate.css:36 `.access-kicker` | `--gate-pink` `#f68ca4` | `#151517` | Active, 7.99: passes (dark surface) |
| access-gate.css:39 `.access-scene-title em` | `#f68ca4` | photo + scrim (:27) | Active, not measured (image) |
| access-gate.css:33,59,80,89,98 | `#f68ca4` | `#151517` | Active glyphs/icons |
| multiplayer.css:27-28 `.multiplayer-welcome .access-kicker` | `#7d2449` / `#f2a6c8` | liquid tint over the world | Active, bound gap (2.94 / 1.47) |
| office-desk.css:20 Computer bar `p::before` bullet | `#f486a1` | `#fbfbf5` | Active (7px glyph, 2.31 on a pale surface; the same bullet whatever the state, so offline is text only) |
| office-desk.css:19 Computer tab underline | `#f486a1` | pale | Active (non-text indicator) |
| sidebar.css:2-3 `--places` | `#963966` / `#f3acd0` | world-map surface / outline | Active (focus outline world-map.css:85,90) |
| district-theme.css:32, visual-finish.css:146-147, playground-theme.css:43, immersive.css:54, district-theme.css:53,62 | various pinks | walking console | Superseded by hud-glass.css |

`--gate-pink` (`#f68ca4`) is not the TypeSafe pink role (`#F486A1`); the two differ by a
few units per channel. No pink is used as text on a pale HUD surface today, except the
office Computer bullet and the town-gate kicker over light liquid glass.

### Existing contrast coverage

- `preview/e2e/walking-controls-contrast.js` (390×844, light/dark × normal/hover/held/focus):
  the six movement pad buttons and `#walking-notice` only (scope at :75); not the primary
  action, More, `#walking-place`, `.walking-help` or voice.
- `preview/e2e/email-access.test.js:79-98`: sign-in field borders ≥ 3:1, focus outline ≥ 2px.
- `preview/tests/theme.test.js`: theme preference logic only.
- Before this slice no test read `--hud-*`, `--liquid-*` or `--gate-*`.

## Gaps and unverified scope

- No colours changed; the four opaque-surface gaps and eleven bound gaps above are open.
- The bound ignores the backdrop filter and veil. The bound gaps need an in-browser
  measurement (extend `walking-controls-contrast.js`-style sampling to the chat dock,
  Map button and town gate) before they are called defects.
- Only rules on bare `:root` are modelled; component-scoped tokens (`--places`,
  `--map-*`, `--desk-*`, `--section-color`) are inventoried, not measured.
- Images (gate scene title over a photo), gradients other than the two cited, and text
  over the open world (`.walking-title`) are not measured.
- Inventory states come from source reading, not a browser session; no screenshots, no
  human keyboard/VoiceOver review.

## Next step

R8 increment 2, after #753 lands the finish switch: a pink HUD treatment behind
`?finish=pink-jet-age` that consumes the roles above (ink on pink fills, pink only on
ink, garden for light-theme actions), fixes the four opaque gaps in both finishes, and
removes their `KNOWN_GAPS` entries so they become enforced. Then extend the browser
contrast journey to the primary action, chat dock and Map button.
