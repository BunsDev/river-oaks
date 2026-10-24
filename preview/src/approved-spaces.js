// Repository-reviewed furnished-space revisions that a creator region may place
// in one of its buildings (#420). Each record is immutable and append-only: never
// edit a published revision. Record the next revision, with its own review, and
// revoke the old one through the world catalog when it must stop being placed.
// The client never supplies approval: a region names a revision and the digest it
// expects, and the server resolves everything else here.

export const APPROVED_SPACE_ADAPTER_VERSION = 1;

const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};

// Corner Café as Val accepted it on 2026-10-17 (#418, design review of main a00a4d19).
// `space` is createSpace('cafe') from that revision, byte for byte.
const cornerCafe1 = {
  id: 'corner-cafe', revision: 1, name: 'Corner Café',
  documentSha256: 'ab210ecbd57ea7bfb00fb549832b3f33e05aa36d19c757b56bc88f166f6ad5ef',
  profile: { templateId: 'cafe', profileVersion: 1 },
  placement: {
    buildingKinds: ['retail'], categories: ['restaurant'],
    // The reviewed doorway: the gap between the two street glazing runs, facing south.
    entrance: { position: [0, -6], outward: [0, -1] },
    // The walk-in floor. The terrace, planters and arrival stand outside the facade.
    room: [[-8, -6], [8, -6], [8, 6], [-8, 6]], clearHeight: 3.1,
  },
  // Renderer sources and textures that draw this revision. A change to any of them
  // changes what was reviewed: review it, then record the next revision.
  assets: {
    id: 'studio-space-forms', sha256: '615f2391fdbb92199366c25bb9b2b760091d9fea0c1624cd56a200bca1349588',
    files: [
      { path: 'preview/src/studio/space-scene.js', sha256: '5b363908df6d3a7a7d4a57dead67414007e50ec3a3777c88b654dcebcdc47a7d' },
      { path: 'preview/src/studio/space-furniture.js', sha256: '29532720e36618eee84955a9046e5da614afba5f214d8fffc76f220e82c20219' },
      { path: 'preview/src/studio/space-furniture-home.js', sha256: 'f2bcc6a2f50fd2d2dbd4508e3457a96b0da8c0c65ff7b09b9057544753e2111b' },
      { path: 'preview/src/storefront-materials.js', sha256: '288aa4db92e966efe90691b7fd3f3c80177eecbcfd87fe78d025b58d081d75cb' },
      { path: 'shared/studio-space-catalog.js', sha256: '758ad21a0b192379b2d0481b729da5dd8c72882e8825fd65da65c29ef41f85e0' },
      { path: 'preview/public/assets/materials/paver-color.jpg', sha256: '9c783b294d5a3127d7c5f5e52df67bbd418aebc90ec05696da5aac2bba834058' },
      { path: 'preview/public/assets/materials/paver-normal.jpg', sha256: 'bade4c251490568a766103b2807616110e1870e0f683a8238489d8a677dc6800' },
      { path: 'preview/public/assets/materials/paver-arm.jpg', sha256: '17243a67e61cab91cf7c6484d2014972d4065ef39f446184579d7e98c49e841f' },
      { path: 'preview/public/assets/materials/stone-color.jpg', sha256: '2607cbd22d9f34aa13febe348cd9eb8f952fbcba3997b9393b1bc5ae19e7c5f3' },
      { path: 'preview/public/assets/materials/stone-normal.jpg', sha256: '1cd19847cb8b822037c5d45d15b9ed7ffa16141aa6ea1045541935e5b4fcee82' },
      { path: 'preview/public/assets/materials/stone-arm.jpg', sha256: '7ee5589fefe66d3c722fb9286d4845b0d972d3fd9eb172027555250bd54944a8' },
    ],
  },
  approval: {
    by: 'Val', date: '2026-10-17', reviewedCommit: 'a00a4d19',
    evidence: 'https://github.com/BunsDev/river-oaks/issues/418#issuecomment-6244286808',
    scope: 'Placement in an owned creator region for the #420 local pilot; not official district placement.',
  },
  space: {schema_version:1,document_type:"studio-space",name:"Corner Café",lighting:"warm",bounds_m:[-12,-11,12,10],spawn:[0,-8.5],
    objects: [
      {id:"interior-floor",kind:"floor",label:"Interior Floor",east:0,north:0,width:16,depth:12,height:0.025,yaw:0,elevation:0,finish:"terracotta"},
      {id:"north-wall",kind:"wall",label:"North Wall",east:0,north:6,width:16.2,depth:0.18,height:3.1,yaw:0,elevation:0,finish:"plaster"},
      {id:"west-wall",kind:"wall",label:"West Wall",east:-8,north:0,width:0.18,depth:12,height:3.1,yaw:0,elevation:0,finish:"plaster"},
      {id:"east-window",kind:"glazing",label:"East Window",east:8,north:0,width:12,depth:0.12,height:3.1,yaw:90,elevation:0,finish:"white"},
      {id:"entry-left",kind:"glazing",label:"Entry Left",east:-4.5,north:-6,width:7,depth:0.14,height:3.1,yaw:0,elevation:0,finish:"white"},
      {id:"entry-right",kind:"glazing",label:"Entry Right",east:4.5,north:-6,width:7,depth:0.14,height:3.1,yaw:0,elevation:0,finish:"white"},
      {id:"entry-mat",kind:"rug",label:"Entry Mat",east:0,north:-5,width:1.8,depth:1.4,height:0.015,yaw:0,elevation:0,finish:"charcoal"},
      {id:"entry-plant",kind:"plant",label:"Entry Plant",east:7,north:-5,width:0.55,depth:0.55,height:1.25,yaw:0,elevation:0,finish:"sage"},
      {id:"corner-plant",kind:"plant",label:"Corner Plant",east:-7,north:5,width:0.55,depth:0.55,height:1.25,yaw:0,elevation:0,finish:"sage"},
      {id:"terrace-floor",kind:"floor",label:"Terrace Floor",east:4.6,north:-8,width:6.6,depth:3.6,height:0.025,yaw:0,elevation:0,finish:"limestone"},
      {id:"preparation-floor",kind:"floor",label:"Preparation Floor",east:0,north:4.5,width:15.7,depth:2.6,height:0.025,yaw:0,elevation:0,finish:"concrete"},
      {id:"service-counter-left",kind:"counter",label:"Service Counter Left",east:-4.6,north:2.6,width:5.6,depth:0.8,height:1.05,yaw:180,elevation:0,finish:"oak"},
      {id:"service-counter-right",kind:"counter",label:"Service Counter Right",east:4.6,north:2.6,width:5.6,depth:0.8,height:1.05,yaw:180,elevation:0,finish:"oak"},
      {id:"prep-cabinets",kind:"cabinet",label:"Prep Cabinets",east:-4.525,north:5.5,width:1.95,depth:0.65,height:0.92,yaw:0,elevation:0,finish:"charcoal"},
      {id:"prep-cabinets-east",kind:"cabinet",label:"Prep Cabinets East",east:1.525,north:5.5,width:7.95,depth:0.65,height:0.92,yaw:0,elevation:0,finish:"charcoal"},
      {id:"prep-sink",kind:"sink",label:"Prep Sink",east:-3,north:5.5,width:1.1,depth:0.65,height:1.195,yaw:0,elevation:0,finish:"white"},
      {id:"coffee-machine",kind:"appliance",label:"Coffee Machine",east:4.8,north:2.6,width:0.8,depth:0.55,height:0.5,yaw:180,elevation:1.05,finish:"charcoal"},
      {id:"pastry-display",kind:"glazing",label:"Pastry Display",east:-4.5,north:2.6,width:1.8,depth:0.65,height:0.55,yaw:0,elevation:1.05,finish:"brass"},
      {id:"cafe-table-1",kind:"table",label:"Cafe Table 1",east:-5.8,north:-3.8,width:1.05,depth:0.8,height:0.74,yaw:0,elevation:0,finish:"walnut"},
      {id:"cafe-chair-1-a",kind:"chair",label:"Cafe Chair 1 A",east:-6.75,north:-3.8,width:0.6,depth:0.65,height:0.85,yaw:90,elevation:0,finish:"sage"},
      {id:"cafe-chair-1-b",kind:"chair",label:"Cafe Chair 1 B",east:-4.85,north:-3.8,width:0.6,depth:0.65,height:0.85,yaw:-90,elevation:0,finish:"sage"},
      {id:"table-vase-1",kind:"plant",label:"Table Vase 1",east:-5.8,north:-3.8,width:0.2,depth:0.2,height:0.3,yaw:0,elevation:0.74,finish:"sage"},
      {id:"cafe-table-2",kind:"table",label:"Cafe Table 2",east:-2.6,north:-0.1,width:1.05,depth:0.8,height:0.74,yaw:0,elevation:0,finish:"walnut"},
      {id:"cafe-chair-2-a",kind:"chair",label:"Cafe Chair 2 A",east:-3.55,north:-0.1,width:0.6,depth:0.65,height:0.85,yaw:90,elevation:0,finish:"sage"},
      {id:"cafe-chair-2-b",kind:"chair",label:"Cafe Chair 2 B",east:-1.6500000000000001,north:-0.1,width:0.6,depth:0.65,height:0.85,yaw:-90,elevation:0,finish:"sage"},
      {id:"table-vase-2",kind:"plant",label:"Table Vase 2",east:-2.6,north:-0.1,width:0.2,depth:0.2,height:0.3,yaw:0,elevation:0.74,finish:"sage"},
      {id:"cafe-table-3",kind:"table",label:"Cafe Table 3",east:5.5,north:-3.8,width:1.05,depth:0.8,height:0.74,yaw:0,elevation:0,finish:"walnut"},
      {id:"cafe-chair-3-a",kind:"chair",label:"Cafe Chair 3 A",east:4.55,north:-3.8,width:0.6,depth:0.65,height:0.85,yaw:90,elevation:0,finish:"sage"},
      {id:"cafe-chair-3-b",kind:"chair",label:"Cafe Chair 3 B",east:6.45,north:-3.8,width:0.6,depth:0.65,height:0.85,yaw:-90,elevation:0,finish:"sage"},
      {id:"table-vase-3",kind:"plant",label:"Table Vase 3",east:5.5,north:-3.8,width:0.2,depth:0.2,height:0.3,yaw:0,elevation:0.74,finish:"sage"},
      {id:"cafe-table-4",kind:"table",label:"Cafe Table 4",east:4.6,north:-0.1,width:1.05,depth:0.8,height:0.74,yaw:0,elevation:0,finish:"walnut"},
      {id:"cafe-chair-4-a",kind:"chair",label:"Cafe Chair 4 A",east:3.6499999999999995,north:-0.1,width:0.6,depth:0.65,height:0.85,yaw:90,elevation:0,finish:"sage"},
      {id:"cafe-chair-4-b",kind:"chair",label:"Cafe Chair 4 B",east:5.55,north:-0.1,width:0.6,depth:0.65,height:0.85,yaw:-90,elevation:0,finish:"sage"},
      {id:"table-vase-4",kind:"plant",label:"Table Vase 4",east:4.6,north:-0.1,width:0.2,depth:0.2,height:0.3,yaw:0,elevation:0.74,finish:"sage"},
      {id:"terrace-table",kind:"table",label:"Terrace Table",east:5.5,north:-8,width:1,depth:0.8,height:0.74,yaw:0,elevation:0,finish:"limestone"},
      {id:"terrace-chair-a",kind:"chair",label:"Terrace Chair A",east:4.5,north:-8,width:0.6,depth:0.65,height:0.85,yaw:90,elevation:0,finish:"sage"},
      {id:"terrace-chair-b",kind:"chair",label:"Terrace Chair B",east:6.5,north:-8,width:0.6,depth:0.65,height:0.85,yaw:-90,elevation:0,finish:"sage"},
      {id:"counter-pendant-one",kind:"pendant",label:"Counter Pendant One",east:-4.6,north:2.6,width:1.2,depth:0.4,height:0.35,yaw:0,elevation:2.3,finish:"brass"},
      {id:"counter-pendant-two",kind:"pendant",label:"Counter Pendant Two",east:4.6,north:2.6,width:1.2,depth:0.4,height:0.35,yaw:0,elevation:2.3,finish:"brass"},
      {id:"menu-art",kind:"art",label:"Menu Art",east:0,north:5.88,width:2.3,depth:0.04,height:1,yaw:0,elevation:1.4,finish:"charcoal"},
      {id:"terrace-planter",kind:"plant",label:"Terrace Planter",east:7.4,north:-9,width:0.55,depth:0.55,height:1.25,yaw:0,elevation:0,finish:"sage"},
      {id:"terrace-planter-west",kind:"plant",label:"Terrace Planter West",east:1.8,north:-9.3,width:0.55,depth:0.55,height:1.25,yaw:0,elevation:0,finish:"sage"},
    ],
  },
};

export const APPROVED_SPACES = freeze([cornerCafe1]);
export const approvedSpaceKey = ({ id, revision }) => `${id}@${revision}`;

// Plain words for each refusal; the server's `detail`, when present, names the piece.
const REFUSALS = {
  approved_space_invalid: 'Choose the furnished layout again: its reference is incomplete.',
  approved_space_unknown: 'That furnished layout has not been approved for placement.',
  approved_space_stale: 'That furnished layout changed since this region was saved. Choose it again.',
  approved_space_assets: 'That furnished layout needs a new review before it can be placed.',
  approved_space_policy: 'This building cannot hold that furnished layout. It needs a café or dining venue.',
  approved_space_fit: 'The building is too small for this layout at its entrance. Enlarge it; layouts are never resized.',
  approved_space_neighbor: 'Clear the space in front of the entrance: the terrace would touch something.',
  approved_space_support: 'The layout needs level ground in front of its entrance.',
  approved_space_route: 'Visitors could not walk the layout\'s routes. Clear the doorway, the terrace and the way to the street.',
  approved_space_revoked: 'That furnished layout is no longer approved for placement.',
  not_owner: 'Only this world\'s owner can place a furnished layout in it.',
};
export const approvedSpaceRefusal = (reason, detail) => Object.hasOwn(REFUSALS, reason)
  ? (typeof detail === 'string' && detail ? `${detail} ${REFUSALS[reason]}` : REFUSALS[reason]) : null;

/** A region declares a revision and the document digest it expects; nothing else. */
export function validApprovedSpaceDeclaration(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 3 && ['id', 'revision', 'sha256'].every(key => Object.hasOwn(value, key))
    && typeof value.id === 'string' && value.id.length <= 48 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)
    && Number.isSafeInteger(value.revision) && value.revision >= 1 && value.revision <= 10000
    && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256);
}

/** The reviewed record a declaration names, or null. Never inferred from a name or digest. */
export function approvedSpaceRecord(id, revision, registry = APPROVED_SPACES) {
  return registry.find(record => record.id === id && record.revision === revision) ?? null;
}
