import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';

// Pink Jet-Age roles for the original District: its shell, storefront trim, street furniture,
// rooftop lights and walk-in interiors (#740, under #738). Classic is retired (#913), so these
// are the District's own colours, not a finish over the earlier teal and brass palette.
// Each role follows the mapping the city kit already uses under Pink Jet-Age
// (shared/city-kit/catalog.js KIT_FINISHES): stone and stucco are ivory, fascias, sills and
// canopies are pink, brass is satin chrome, dark frames and lamp columns are ink, reflective
// panes are a muted grey-mint (a saturated tint plus the sky reflection reads as cyan), and
// lamps keep the kit's warm glow. Only colours live here: geometry, batching and collision
// do not change with them.
export const DISTRICT = Object.freeze({
  ivory: P.ivory,
  pink: P.pink,
  ink: P.ink,
  chrome: P.chrome,
  mint: P.mintGlass,
  glass: '#6e9f99',
  rose: '#d9a1a8',
  blush: '#f3e4d6',
  glow: '#fff2cf',
  glowEmissive: '#ffd99a',
});

// Tenant signs: ivory lettering on an ink plaque with a pink edge. Pink on ivory measures
// 2.13:1, so pink is never the lettering or the plaque under it (#738).
export const DISTRICT_SIGN = Object.freeze({ plaque: DISTRICT.ink, lettering: DISTRICT.ivory, edge: DISTRICT.pink });
