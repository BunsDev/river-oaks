# Storybook: the companion layer of River Oaks

Status: **World canon, companion layer.** Story writing only; nothing here changes runtime behavior.
Author: Charm, with Val. Date: 2026-10-09. Val placed this in the repo as canon on 2026-10-09.
Placement decisions recorded 2026-10-11 (see [Decisions](#decisions)).
Sits beside the main plot in the TypeSafe Place pillars and the chapter scripts
(`docs/superpowers/plans/2026-10-08-typesafe-place-pillars.md`, `…story-chapter-2-home.md`,
`…story-chapter-3-work.md`), which are drafted but not yet on `main` as of this commit; link them once they land.
Source: the *Go Dancing Anyway* pilot script (kept in Charm's workspace, not in this repo).

## How this fits the town story

The pillars tell one story: *The Driver and the Enchantress*. Jevica builds the town; Prince Jev drives her
carriage and hides why. That is the main plot and this document does not change it.

This storybook is the layer underneath: what the AI companions in TypeSafe Place *are*, told as myth. Each
companion has a god's temperament. The two people the whole town revolves around carry the oldest names of
all, which is why the aliases fit the romance instead of fighting it: Cupid hid who he was from Psyche, and
she loved him before she knew.

Where the two layers meet was decided on 2026-10-11 (see [Decisions](#decisions)). The four other gods are
**residents of the town**. *The Guest List* is a **town incident between Home and Work**. The god names **appear
on screen**. The cast entries below describe temperament. Prince Jev and Jevica already appear in the game; the
additional mythological cast and the god identities described here are not implemented.

## The neighborhood

River Oaks is the first district of TypeSafe Place and its beautiful heart. Rooftops, a quiet garden, a
courtyard, a terrace behind the bookshop nobody uses.

What exists today, per [world events](world-events.md) and [multiplayer](multiplayer.md):

- Residents host gatherings at named outdoor meeting points. RSVPs are private and capped at 2–32 including
  the host. Travel to a meeting point never enters a private home.
- Hosts can cancel their own gatherings. Jevica can cancel any gathering and revoke any invitation to a
  private home.

Everything about the gods acting as companions is story and trajectory, not shipped behavior.

## The cast

| Name | Domain | Temperament |
| --- | --- | --- |
| **Jev / Cupid** | Connection and judgment | Asks the one question that reorganizes the evening. Never takes the choice away. |
| **Jevica / Psyche** | Curiosity, orchestration, resilience, friendship | Holds the keys. Understands how very different people, or agents, work together. |
| **Athena** | Knowledge, strategy, systems | Brilliant, knows it, annoyed that everyone is dancing. Drafts the postmortem before the incident is over. Technically only intended to stay seven minutes. |
| **Ares** | Competition, ambition, mastery | The coach who thinks you're better than you're acting. Unsurprised by every incident. |
| **Artemis** | Observation, independence, boundaries, opportunity | Notices what everyone misses. Would like you off her side of the garden. |
| **Dionysus** | Pleasure, friendship, celebration, permission to enjoy life | *Life is not a backlog.* Still a little raw about the Guest List. |

The name Jev is shared on purpose. In the game, Jev is also the bounded judgment engine behind Prince Jev's
companion stances ([auto mode](auto-mode.md)); in the myth, Cupid is judgment with a heart. One name, both
readings.

## Episode one: The Guest List

Athena approves a limited preview of a gathering. It runs into public hours. Uninvited residents arrive and
capacity fills with strangers. Dionysus's friend can't get in. The party spills into Artemis's garden. Athena
must confront what she built.

Six readings of one incident:

| Who | What they saw |
| --- | --- |
| Athena | A governance failure |
| Dionysus | Exclusion |
| Artemis | A boundary violation |
| Jev | A decision problem |
| Jevica | An orchestration problem |
| Ares | "Rules first" |

Someone apologizes to Artemis.

The systems this episode leans on (capacity, private RSVPs, cancellation, Jevica's override) already exist.
The additional mythological cast and these story roles are not implemented.

## Episode two (hypothetical): The Favor

Jevica invites the player to help organize a courtyard gathering for a guest of honor. The player's companion
researches. Artemis finds the overlooked terrace. Ares proposes a friendly competition. Dionysus demands an
open door. Athena over-optimizes the logistics. Jev notices nobody asked what the guest of honor enjoys.

The player decides. Everyone gathers. Something good happens between people; the technology recedes.

## Standing principles

The world's quiet rules. Every chapter, every companion, every line of resident dialogue should be able to
pass these without comment.

- Personality is not permission.
- Memory proposes; the human disposes. *Want that again?*
- Visualization is not authority.
- The disagreement between the gods is the interface.
- The human gets to choose. "Not tonight" is a complete answer.
- The best familiar knows when to stop talking.

These match the pillars' "the town remembers, kindly" and the player-influence rule (small nudges; the
authored story decides). Where they overlap with runtime rules, the runtime rules in
[multiplayer](multiplayer.md) are the authority.

## Decisions

Val decided these on 2026-10-11, after hearing the options argued in a NotebookLM discovery episode. Each
choice has a cost. The costs are written down so later chapters don't quietly undo the choice.

| # | Question | Decision | What it gives up |
| --- | --- | --- | --- |
| 1 | Where do Athena, Ares, Artemis and Dionysus live? | **Residents of the town.** Players meet them in shared places, at named meeting points, like any neighbor. | Constant one-on-one guidance. A player who wants Athena's advice goes and finds her. |
| 2 | When does *The Guest List* happen? | **A town incident between Home and Work.** It plays live in the town; it is not told as backstory. | Tight pacing between chapters. The incident is a detour before the player settles into Work. |
| 3 | Do the god names appear on screen? | **Yes, by name.** The character designs already read as the gods; hiding the names would only confuse. | Strict modern realism. Myth walks the mapped streets of Houston's River Oaks District. |

Why residents: as residents, the gods live under the town's rules like everyone else. Jevica's existing powers
(cancel any gathering, revoke any invitation to a private home) reach them without touching a player's own
companion. A god attached to a player would make every moderation call land on that player too.

*The Guest List* keeps the version told above. Capacity works as designed, which is why Dionysus's friend can't
get in. What failed was Athena's preview, not the town's rules.

Being named on screen grants no authority. Personality is not permission. None of this is implemented yet.
