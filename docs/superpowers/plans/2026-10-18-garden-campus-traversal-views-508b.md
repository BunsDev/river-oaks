# Garden Offices #508 slice (b): two-player traversal journey and matched circulation views

- **Owner:** `claude:river-oaks-95 (5bececff)`.
- **Task:** `garden-campus-traversal-views-508b`.
- **Branch:** `test/garden-campus-traversal-journey-508-20261018`.
- **Worktree:** `river-oaks-garden-campus-508b-20261018`.
- **Parent:** #508, owned by river-oaks-c5, and the #505 tracker.
- **Assignment:** Val asked river-oaks-95 to take slice (b) (2026-10-18 ~18:55Z), and c5
  agreed. Val then asked to "start the views now while waiting for #508" (~19:05Z).

## Split with #508's owner

- **c5 keeps:**
  - the server authority and level environments;
  - portal transitions;
  - the client walking and level hooks;
  - the gallery, landing and core-lobby finishes.
- **This slice owns:**
  - the two-player browser journey;
  - the matched Floor 4 and terrace views.
- **Branching:** this branch starts at #507 `086c197e`, the base c5 stacks #508 on, and
  takes c5's #508 branch once its first push lands.
- **Protocol:** the journey is built against that push's protocol only. HUD markers the
  journey needs are requested from c5, not added here.

## Inputs (by revision)

- #506 layout 3.2, through #507 `086c197e`. The cameras read `campusLevels()`, `campusSupportAt`,
  the bridges' `clear`/`guardSpan`, roof headhouse landings and the design plans in
  `docs/design/garden-campus/views` (generator `scripts/garden-campus-views.mjs`,
  `planFrame`).
- Renders are taken on the #512 candidate, which carries #511's finish (`b73cf65a`), with this
  branch merged in.
- #508: no push yet.

## Files owned

- `preview/e2e/garden-campus-circulation-views.mjs` (new): contract-derived cameras and the plan frame.
- `preview/tests/garden-campus-circulation-views.test.js` (new).
- `preview/e2e/garden-campus-views.mjs`: the `circulation` set and the matched sheet (the
  script is #507's, also owned by river-oaks-95).
- `docs/design/garden-campus/circulation/` (sheet and receipt).
- Later: `preview/e2e/garden-campus-traversal.js`, its runner fixture and CI shard entries.

## Views (built)

Fourteen eye-height views, each derived from the contract:

- 3 Floor 4 galleries, each looking toward the skywalk it meets.
- B12 and B23, from the T2 and T3 ends of their guarded decks. B12 lands on T2's terrace beyond `guardSpan`.
- 6 terraces, from their passage doors along the long strip to the corner.
- 3 roofs, from the headhouse landing northward.

Floor 4 views are marked on `floor-4.svg`, the rest on `site-plan.svg`, in each plan's own
frame. The test checks that the frame reproduces the plan's parcel corner.

- **The test** (`garden-campus-circulation-views.test.js`) holds each view to the contract:
  - every public gallery, deck, roof and terrace has a view;
  - each stands on public support of its named surface at eye height, a body's half-width
    clear of every obstacle;
  - each looks at least 10 m along public ground.
- **Mutation:** moving the terrace cameras 0.2 m past the strip's outer edge fails "has
  support".

## Journey (built against #508 `80a76ef3`)

`preview/e2e/garden-campus-traversal.js` is registered in the experience profile, the
runner's fixture env (campus revision) and a `campus` CI shard. Two residents take part:

- **Resident A** (owner fixture): keyboard, reduced motion.
  1. Enters T1's hall through the Map's Step inside.
  2. Rides T1's lift to Floor 4 (F, three presses) and waits on the landing.
  3. Once B is under B12, walks the spur, gallery and B12 above them.
  4. Crosses T2's terrace and gallery.
  5. Rides T2's lift to the roof garden (Floor 8) and back.
  6. Walks B23 into T3 and takes T3's stairs to the street, ending in T3's hall.
- **Resident B** (alice): emulated phone, 390×844, touch.
  1. Rides up by tapping the HUD prompts.
  2. Arrives beside A on the occupied landing.
  3. Taps back down to T1's hall.
  4. Walks out under B12.

Every arrival checks three things: the server's level, the floor's exact height, and the
page's eye 1.68 m above it. Both pages see the other resident at the right level and
height. Walking is W/Shift with view drags (walking-ui `yaw -= dx·0.003`), toward targets
taken from the contract.

**Fixes found while writing it.** These are journey mechanics only; no product changes:
- wait for the town join before Step inside;
- on a phone, fold the panel, visit tools and chat dock, and open More for the second action;
- drag above the HUD;
- read prompts only after the HUD repaints for the new floor (a stale "Take the lift down"
  from the roof read as F on Floor 7);
- wait for the exact target level.

## Evidence

- **Local passing run** at slice `ed8a0845` + journey, 2026-10-18 ~20:50Z:
  `node preview/e2e/experience-runner.js garden-campus-traversal` (M3 Max, ANGLE Metal, Vite
  dev fixture, load ~40–60). The phases took:
  - T1 lift walk 15.7 s, phone 15.5 s;
  - under B12 44.3 s, onto B12 26.3 s;
  - T2 lift 37.3 s, T3 stairs 54.3 s.

  Feet matched the floor at every arrival: 23.26, 27.26 and 31.26 m on Floors 2–4,
  47.26 m on the roof, 18.26 m on the street. Screenshots are in
  `docs/design/garden-campus/traversal/`.
- `node --test preview/tests/garden-campus-circulation-views.test.js`: 3/3 at `706429f1`.
  On the candidate `d8fe456a`, the circulation and #511 finish tests pass 12/12.
- **Render.** `node preview/e2e/garden-campus-views.mjs gardens circulation` on the #512
  candidate `d8fe456a`, re-rendered at `01ee3243` after the walls (sheet and receipt replaced):
  - candidate contents: #507 `086c197e`, #509, #510 `465785d2`, #511 `b73cf65a` and this slice;
  - setup: M3 Max, ANGLE Metal, 1280×800, Smooth, 15:00, interface hidden, under the browser
    lock, host load ~40;
  - result: 14 views passed with no page errors. Outputs are
    `docs/design/garden-campus/circulation/sheet-day.jpg` (each render beside its plan crop)
    and `views-2026-10-18.json` (poses, draw calls, triangles, frame times).

## Findings from the views (for #508, river-oaks-c5)

1. **Galleries were not separated from the suites (closed).** At `d8fe456a`, all three
   Floor 4 galleries rendered without walls or suite doors, and #510's suite desks read as
   public space. Val moved the walls to #507. #507 `a6dbb661` adds them with closed doors,
   opaque at any camera distance. A second render (`79f74bfb`) showed the near-camera fade
   dissolving them, which is now fixed. The current sheet at `01ee3243` shows each gallery as a
   walled corridor with closed suite doors.
2. **The ceiling is dark.** Gallery ceilings render as an unlit dark slab underside. That is
   finish scope; the gallery and landing finishes are c5's.
3. Skywalks, terraces and roofs read as #511 finished them: planted troughs, glass guards,
   timber decks and headhouses. The plan crops place every camera on its surface.

## Next action

1. A hosted `campus` shard pass on the candidate; HUD polish (drop the generic "Level N"
   suffix on campus floors).
2. Re-render the circulation set once #508's ceiling, floor and lighting finishes land, and
   confirm finding 2 is closed.
