# Shared-town development guide

Start with [the current setup](multiplayer.md) and run `pnpm run dev`, then open the loopback address printed by Vite. Browser and desktop play use the shared town and its access gate. The local Python bridge is optional for supported decision and speech tools. Solo mode, the economic Scenario lab, auto visits, invasion and telekinesis are retired.

## Walk and meet people

WASD moves, dragging looks around, arrows turn, Shift moves faster and E talks to someone within reach. **Meet someone nearby** approaches an available resident; closing a conversation restores walking focus. **Step inside** or F at a doorway enters its furnished room, and F at its exit returns to the street. Z uses a nearby seat or planter. See [keyboard navigation](rail-navigation.md), [touch controls](touch-play.md) and the in-game Commands reference for the current context-sensitive actions.

Residents retain their occupations, authored dialogue and shared-world routines. Cultural encounters are fictional portrayals, not scans, likenesses or assertions that public figures live at private addresses. [World direction](world-direction.md) describes the current human appearance catalog, Jevica's bubble flight and the supported vehicles. The server owns permissions, shared movement, visits and community activity state.

The Map and Places controls expose available destinations. Region availability and access depend on the world's active revision; a local preview does not activate a production revision. See [world streaming](world-streaming.md) for traversal and [the architecture map](architecture.md) for runtime ownership.

## Optional local speech

Follow [the local speech setup](../README.md#optional-free-local-speech), then select **Kokoro · local neural voices** under **Settings → Audio**. Pinned model files stay in ignored `data/models/kokoro/`. Initial setup requires the documented downloads; local synthesis then uses the CPU. **Device voices · local only** uses installed local English voices when available.

Speech defaults off. Muting, changing the speaker, hiding the tab or closing the conversation cancels pending playback. The local worker and cache are bounded; missing models or busy synthesis produce an explicit unavailable/busy result. The [recorded local benchmark](../data/reports/local-voice-benchmark.json) describes its original sample, not current universal latency or subjective voice quality.

## Verification and limits

Use [the verification profiles](agent-workflow.md), [testing guide](testing.md) and the relevant browser journey for a change. Dated reports and screenshots prove only their recorded revisions and scope. Unit tests and the production build do not establish rendered quality, human accessibility, live auth, packaged/native operation or production acceptance.

Map footprints, inferred heights, authored interiors and artistic vegetation have different provenance and acceptance limits. Consult [visual fidelity](visual-fidelity.md), [storefront references](storefront-reference-audit.md) and [vegetation](vegetation.md). Browser work does not establish equivalent Unreal behavior; [native acceptance](engine-acceptance.md) remains a separate gate.
