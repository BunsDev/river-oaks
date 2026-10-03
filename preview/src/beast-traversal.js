import { sharedAppearance } from './shared-appearances.js';

// Ground movement remains on the walking collision path. A species changes
// pace and turning feel, while the shared town derives its limit from the
// account's confirmed appearance and movement preference.
export const BEAST_TRAVERSAL = Object.freeze({
  fox: Object.freeze({walk:2.7,sprint:5.6,turn:2.5,turnSlowdown:.14}),
  wolf: Object.freeze({walk:2.6,sprint:6.2,turn:2.1,turnSlowdown:.22}),
  panther: Object.freeze({walk:2.5,sprint:6.4,turn:2.25,turnSlowdown:.2}),
  lynx: Object.freeze({walk:2.6,sprint:6,turn:2.6,turnSlowdown:.15}),
  'snow-leopard': Object.freeze({walk:2.5,sprint:6.1,turn:2.35,turnSlowdown:.18}),
  deer: Object.freeze({walk:2.8,sprint:6.5,turn:2,turnSlowdown:.25}),
});

export const beastTraversal=kind=>BEAST_TRAVERSAL[kind]??null;
export const traversalForAppearance=id=>beastTraversal(sharedAppearance(id)?.kind);
