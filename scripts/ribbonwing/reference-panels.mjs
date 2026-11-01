// Panel rectangles [x0, y0, x1, y1) of the two final Ribbonwing sheets
// (1536 x 1024 each), cropped inside the gutters and clear of the captions,
// so silhouettes compare the craft alone. Measured by eye on the originals and
// checked against the debug masks written by measure-references.mjs.
export const REFERENCES = {
  exterior: {
    file: 'docs/design/ribbonwing/references/exterior.png',
    sha256: '1ad22827e962a6543f10545fc549484f89a7bbda1831bb30d1cbace499c752cb',
    panels: {
      front: [16, 94, 508, 408],
      left: [516, 94, 1036, 404],
      rear: [1044, 94, 1520, 408],
      top: [16, 446, 508, 952],
      underside: [518, 446, 1010, 952],
      threeQuarter: [1018, 446, 1520, 948],
    },
  },
  interiorMotion: {
    file: 'docs/design/ribbonwing/references/interior-motion.png',
    sha256: 'e0489437f601a7416caf842dec434866bb406788c2932c3289e157b4a94b49b8',
    panels: {
      rightProfile: [16, 122, 534, 478],
      cockpit: [545, 88, 993, 480],
      boarding: [1002, 116, 1520, 478],
      hover: [16, 526, 534, 990],
      stuntTuck: [543, 526, 1088, 990],
      thrusterJoint: [1096, 526, 1520, 990],
    },
  },
};
// Panels that show the whole craft against the plain background.
export const SILHOUETTE_PANELS = [
  ['exterior', 'front'], ['exterior', 'left'], ['exterior', 'rear'], ['exterior', 'top'], ['exterior', 'underside'], ['exterior', 'threeQuarter'],
  ['interiorMotion', 'rightProfile'], ['interiorMotion', 'boarding'], ['interiorMotion', 'hover'], ['interiorMotion', 'stuntTuck'],
];
