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

## Journey plan (waits for #508's first push)

See the #505 tracker, "#508 slice (b) plan":
- continuous Floor 4 route with keys;
- above and below B12 at once;
- an occupied landing;
- one terrace and one roof;
- touch controls and reduced motion;
- rendered feet against `campusSupportAt`.

## Evidence

- `node --test preview/tests/garden-campus-circulation-views.test.js`: 3/3 at `706429f1`.
  On the candidate `d8fe456a`, the circulation and #511 finish tests pass 12/12.
- **Render.** `node preview/e2e/garden-campus-views.mjs gardens circulation` on the #512
  candidate `d8fe456a`:
  - candidate contents: #507 `086c197e`, #509, #510 `465785d2`, #511 `b73cf65a` and this slice;
  - setup: M3 Max, ANGLE Metal, 1280×800, Smooth, 15:00, interface hidden, under the browser
    lock, host load ~40;
  - result: 14 views passed with no page errors. Outputs are
    `docs/design/garden-campus/circulation/sheet-day.jpg` (each render beside its plan crop)
    and `views-2026-10-18.json` (poses, draw calls, triangles, frame times).

## Findings from the views (for #508, river-oaks-c5)

1. **Galleries are not separated from the suites.** All three Floor 4 galleries render without
   the gallery or spine walls and the closed suite door frames. #510's suite desks read as one
   open floor with the public gallery. This is the agreed #508 scope (circulation walls and
   suite door frames). It blocks release: until it lands, the campus shows private suites as
   open public space.
2. **The ceiling is dark.** Gallery ceilings render as an unlit dark slab underside. That is
   finish scope; the gallery and landing finishes are c5's.
3. Skywalks, terraces and roofs read as #511 finished them: planted troughs, glass guards,
   timber decks and headhouses. The plan crops place every camera on its surface.

## Next action

1. When #508's first push lands, merge c5's branch here and build the two-player
   journey against its protocol.
2. Re-render the circulation set once #508's gallery walls, suite door frames and finishes
   land, and confirm findings 1 and 2 are closed.
