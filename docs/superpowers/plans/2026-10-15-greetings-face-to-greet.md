# Say hello: semi-transparent, and opened on purpose when you face someone

- **Task:** `greetings-face-to-greet` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/greetings-face-to-greet-20261015` in `../river-oaks-greetings-face`, from main `ee6a044a`.
- **Request:** Val, 2026-10-15: "consider the mechanics of the say hello and ui ux of it too please so it is
  semi-transparent and invoke the menu intentionally when facing the user yourself".

## Before

The greetings card appeared whenever any player was within reach (2.6 m) and in sight. It was an opaque card
with a person picker, Wave, Shake hands and Dance together. On phones it covered Play & rides; #441's CSS
only moved it.

## Change

- **`facedPeer(pose, peers)`** in `preview/src/greetings-ui.js`: of the players within reach, in sight and in the same room,
  the one within 40° of where you look, nearest to straight ahead. It uses the walking pose's yaw, which is the
  camera's: 0 looks north, and positive turns west.
- **Idle:** nothing shows. **Facing someone:** a small, semi-transparent prompt, "Say hello to <name> · E".
  **E or a tap** opens the menu for that person: Wave, Shake hands, Dance together and Close. Escape closes it,
  as does walking out of reach. An invitation replaces it. E is taken only while the prompt shows, so talking to
  residents keeps E otherwise.
- **An invitation or shared activity always shows**, as before, with Accept, Decline, Cancel and Stop.
- **CSS** (`preview/src/multiplayer.css`):
  - the card is 74% opaque and the prompt 62%, with the HUD's `--hud-filter` blur (none under software rendering);
  - the person picker's rules are gone;
  - on narrow screens the prompt yields to an open dock;
  - the prompt hides while seated in a cinema recliner (`body.theater-seated`, from the theater UX PR).
- `getPose` is passed from `multiplayer-client.js`.

## Journeys updated

- **`preview/e2e/greetings.js`** (shared, and run in hosted CI):
  - no card or prompt until bob is faced;
  - facing bob offers "Say hello to bob";
  - E opens his menu;
  - each invite goes through face, then E;
  - handshake, dance, the phone layout, decline and walk-away cancel are as before.
- **`preview/e2e/greetings-dock-runner.mjs`**: at nine sizes:
  - no card before it is opened;
  - the prompt is reachable;
  - E opens the menu, and every menu control and HUD control is reachable;
  - with the dock open (≤900 px), the prompt yields;
  - the invitation keeps Accept and Decline reachable over the open dock.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/greetings-facing.test.js`, written first | Failed (no export), then 1/1 (8 assertions on cone, nearest, behind, own spot) |
| `RIVER_OAKS_SHARED_JOURNEY=greetings node preview/e2e/shared-runner.js required` | Passed |
| `node preview/e2e/greetings-dock-runner.mjs` | Passed at 9 sizes, no problems |
| `pnpm run verify` (core) | Passed |
| Screenshots (software rendering) | The prompt pill and the translucent menu, at desktop and 390 px |
