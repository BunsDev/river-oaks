# Resident dialogue UI follow-up

Scope: the resident conversation overlay in the live district preview. Preserve the existing uncommitted resident-life, navigation, voice, and simulation work. Keep dialogue authorship, Jev reaction provenance, fictional portrayals, and simulated support explicit.

- [x] Clarify resident identity and close control.
- [x] Separate conversation, support, and scenario information into cards.
- [x] Make conversation topics touch-friendly, selected, and busy-aware.
- [x] Explain support prerequisites, resource costs, cooldowns, and outcomes; allow starting/resuming from the dialog.
- [x] Put synchronized voice controls and status beside the conversation.
- [x] Keep header/footer reachable around a scrollable body; verify keyboard and small screens.

Verification: offline unit tests for UI/domain availability parity; mocked browser end-to-end checks for conversation, failure, support, resources, pause/resume, voice cancellation, persona disclosure, themes, scrolling, and focus; production build. No live Jev credits or voice-model download required.

## Verification recorded on 2026-09-17

- `npm test`: 106 passed, zero failures. The new presentation tests compare support availability with the actual simulation gates and cover cooldowns, resources, and resolved requests.
- `npm run build`: passed. Vite still reports the existing large Three.js chunk warning.
- `preview/e2e/community-dialogue.js`: passed in Chrome against the live Vite preview with intercepted decision and voice endpoints. Covers asking, starting/resuming, supply costs/cooldowns/resolution, dispatch reservation, duplicate prevention, reset, topic loading/fallback/stale responses, voice synchronization/failure/cancellation, fictional portrayal/source disclosure, and focus restoration.
- Ten responsive/theme combinations passed: 1440×1000, 1280×720, 390×844, 320×568, and 844×390 in dark and light. Header/footer stay visible, content scrolls independently, targets remain at least 44 px, and no horizontal overflow was found. Screenshots are written to `output/playwright/dialogue-{theme}-{width}x{height}.png`.
- Independent keyboard review confirmed busy topics keep focus, repeat activation does not send duplicate requests, and Escape closes the conversation. Disabled support actions transfer focus to the support card.
- Existing `preview/e2e/volunteer-visits.js`: passed with mocked `continue` reactions and the real district/navigation worker. The helper traveled 29.06 m and arrived within 1.443 m before helping; conversation hold, pause, storm hold, completion, and reset all passed with no browser errors. A repeated `greet` fixture was unsuitable for this journey because greetings intentionally pause movement.
- `git diff --check`: passed.

The browser script follows the existing `async (page) => ...` harness convention and installs its own network fixtures before navigation. It requires the Vite preview at `http://127.0.0.1:5173/`; it does not need live Jev inference or a local voice model. Actual voice synthesis and device-voice playback were not exercised by this UI check.
