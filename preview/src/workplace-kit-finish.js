// Kit finishes for the coworking studio fixture (#221 under #738/#744): the shared city-kit
// finish names (shared/city-kit/catalog.js KIT_FINISHES) mapped onto the materials
// workplace-office.js already builds, as the District, Gardens and IPIC tables do.
//
// Render-only. A finish replaces colour fields (and the palettes the procedural surfaces are
// painted with) of materials the office already has. Material names stay, so every mesh keeps
// its name, zone, geometry, placement and light; routes, sockets, the doorway and the measured
// cameras are identical under every finish, and the office tests hold both finishes to the
// plan. `classic` is the default and changes nothing: office-scene.js and office-world-scene.js
// pass no finish, so a legacy office visit renders exactly as before. The fixture page opts in
// with `?finish=pink-jet-age` (preview/e2e/fixtures/workplace.js).
//
// Privacy is unchanged by any finish: every screen, hologram and monitor in this room is a
// procedural placeholder painted from these palettes alone. No owner state, brief, draft or
// companion name is an input to the room (workplace-kit-finish.test.js), so a public view of
// the studio can never carry private work.
import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';

const freeze = value => Object.freeze(value);

export const WORKPLACE_KIT_FINISHES = freeze({
  classic: freeze({ label: 'Classic', materials: freeze({}), surfaces: freeze({}) }),
  'pink-jet-age': freeze({
    label: 'Pink Jet-Age',
    // workplace-office.js `named.<key>` field overrides. Colour-like fields are set on the
    // existing THREE.Color; numbers replace the field.
    materials: freeze({
      floor: { roughness: 0.3, clearcoat: 0.5 }, // terrazzo (surfaces.floor): a satin stone, not a mirror
      graphite: { color: '#efe7dc' }, // the ceiling: ivory plaster
      lacquer: { color: '#f3ece2' }, // skirting, desk pedestals and cabinetry: ivory lacquer
      satin: { color: '#efe6da' }, // east and back walls, door header
      graphiteFlute: { color: P.ivory }, // the fluted entrance wall
      gold: { color: P.chrome, metalness: 0.5, roughness: 0.3 }, // every trim, bezel, portal and mullion: satin chrome (fully metallic read as dark lines against ivory)
      ivory: { color: P.ivory }, // the fluted west wall
      pearl: { color: P.ivory }, // the desk tops: readable, matte-ivory work surfaces
      blackGlass: { color: '#cfe0dc' }, // the review table top: mint glass
      coolLight: { color: '#eefcf8', emissive: '#cdeee6' }, // light lanes, keyboards, table disc: mint-white
      smoked: { color: P.mintGlass, opacity: 0.45 }, // the cabinet shelves
      holoLine: { color: P.chrome }, // the orbital hologram's wire globe and rings
      holoBeam: { color: P.mintGlass },
      leather: { color: P.pink, sheenColor: '#fff3f6' }, // the chairs: the selective pink upholstery of #744
      velvet: { color: '#f2c4cf' }, // the review rug: a soft rose
      ceramic: { color: '#f1ebe3' }, // the planter and vases
      foliage: { color: P.garden },
      cabinetGlow: { color: '#efe6da', emissive: '#ffd9c2', metalness: 0.15 }, // the storage niches
    }),
    // The procedural surfaces' palettes (classic keeps each generator's own colours).
    surfaces: freeze({
      // Ivory terrazzo in place of obsidian: a warm ground with chips of chrome grey, pink and garden green.
      floor: freeze({ ground: '#ece4d8', grout: '#d9cfc2', chips: freeze(['#bcc5c8', '#f0b7c6', '#9fb3a5', '#fbf7f1']) }),
      // The backlit feature wall and review monolith: rose quartz, not honey onyx.
      feature: freeze({ ivory: '#faf5ee', band: '#f3d6dd', vein: '#d9a3b3' }),
      // A dusk skyline over the garden city: no stars, ivory towers, mint and warm windows, chrome halos.
      skyline: freeze({ top: '#8fb0d9', mid: '#d7c3d6', horizon: '#f3cbd3', glow: '#fff0dc', stars: 0,
        towers: freeze([freeze({ tone: '#e9dfd8', windows: false }), freeze({ tone: '#d8ccc6', windows: true }), freeze({ tone: '#c9bcb8', windows: true })]),
        window: freeze({ cool: '#bfe2de', warm: '#fff1dc', alpha: 0.55 }), spire: '#bcc5c8', halo: '#e8eef0' }),
      // The desk screens' placeholder interface: mint-ivory lines instead of cyan.
      interface: freeze({ ink: freeze([214, 240, 232]) }),
    }),
  }),
});

/** The office finish name for an untrusted preference: unknown or malformed is classic. */
export const workplaceKitFinishName = name => typeof name === 'string' && Object.hasOwn(WORKPLACE_KIT_FINISHES, name) ? name : 'classic';

/** The finish spec for an untrusted preference; never throws. */
export const workplaceKitFinish = name => WORKPLACE_KIT_FINISHES[workplaceKitFinishName(name)];
