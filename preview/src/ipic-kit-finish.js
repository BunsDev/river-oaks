// Kit finishes for the IPIC interior (#744 under #738): the shared city-kit finish names
// (shared/city-kit/catalog.js KIT_FINISHES) mapped onto materials ipic-materials.js already
// builds, as the District (district-kit-finish.js) and Gardens (garden-campus-kit-finish.js)
// tables do.
//
// Render-only. A finish replaces colours, and the lounge carpet's painted palette, of
// materials the interior already has. Material names stay, so every mesh keeps its name
// (`<zone>: ipic-<material>`); roughness, metalness, maps and every part, collider, seat,
// camera and light are identical under every finish. `classic` is the default and changes
// nothing. The client opts in with render-quality.js readFinishPreference.
//
// Only materials the auditorium never draws change, so the theatre stays as photographed:
// its confetti carpet, black, glass, screen, house lights, and the cognac leather and timber
// it shares with the lounge keep their classic look under every finish. Escalator steel and
// the yellow step edges are safety finishes and never change.
import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';

const freeze = value => Object.freeze(value);

export const IPIC_KIT_FINISHES = freeze({
  classic: freeze({ label: 'Classic', colors: freeze({}), carpet: null }),
  'pink-jet-age': freeze({
    label: 'Pink Jet-Age',
    // ipic-materials.js `m.<key>` colour overrides.
    colors: freeze({
      sofa: P.pink, // the lounge sofa: the selective pink upholstery of reference 744-02
      pillow: P.ivory,
      bronze: P.chrome, // lift doors, pendant bars, guardrail rods, the throwing line, back-bar rail
      red: '#8e2a4e', // the Tuck Room's back-bar wall: deep rose (the HUD skin's light accent)
      // Reception walls, coffers and the well's ceilings. A shaded ivory: the lobby's
      // downlights and cove wash a pale finish out to white (see receptionStone).
      plaster: '#d9cfbf',
    }),
    // The lounge carpet's painted palette (classic: ipic-materials.js IPIC_LOUNGE_CARPET),
    // a warm ivory ground with rose swirl lines, and its untextured colour.
    carpet: freeze({ base: freeze([236, 226, 212]), pattern: freeze([196, 106, 130]), flat: '#e3d6c6' }),
  }),
});

/** The IPIC finish name for an untrusted preference: unknown or malformed is classic. */
export const ipicKitFinishName = name => typeof name === 'string' && Object.hasOwn(IPIC_KIT_FINISHES, name) ? name : 'classic';

/** The finish spec for an untrusted preference; never throws. */
export const ipicKitFinish = name => IPIC_KIT_FINISHES[ipicKitFinishName(name)];
