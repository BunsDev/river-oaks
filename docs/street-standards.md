# Palo Alto street treatment

The game keeps the Houston map, street centerlines, destinations, building footprints,
and mapped tree observations. Its generated street surfaces use dimensions from Palo
Alto's public works drawings and commercial sidewalk requirements, consulted on
September 27, 2026. These are game geometry rules, not an approved civil design.

## Applied profile

All dimensions in `preview/src/street-profile.js` are metres. The renderer,
pedestrian route costs, curb openings and street fixtures share this profile.

| Feature | Source dimension | Game treatment |
| --- | --- | --- |
| Road cross slope | 2% minimum, SD 201 | 2% crown added to the retained terrain |
| Type A gutter | 24 in, SD 133 | 0.6096 m inside each mapped road edge |
| Curb | 6 in wide, 6 in above flowline, SD 133 | 0.1524 m width and reveal, with openings at crossings |
| Sidewalk cross slope | 1.5% typical, SD 133; landing maximum in SD 105 | 1.5% added to terrain |
| Commercial sidewalk | 10 ft total, 8 ft pedestrian clear zone, PMC 18.24.020 | 12.5 ft generated depth; outer 8 ft preferred by pedestrian routing |
| Ramp | 7.5% maximum, SD 105 | 7.2% profile slope on level terrain, 2.54 m run |
| Landing | 4 ft 2 in minimum, SD 101/105 | 1.27 m behind the ramp |
| Gutter at ramp | 5% maximum, SD 105 | Flowline raised locally to limit counter slope to 5% |
| Detectable warning | Full ramp width, 3 ft deep, 6–8 in setback, SD 105 | Yellow warning surface 0.9144 m deep, set back 7 in, with a repeated dome texture |

Sources: [Public Works drawings index](https://www.paloalto.gov/Departments/Public-Works/Engineering-Services/Public-Works-Standard-Drawings-and-Specifications),
[SD 101](https://www.paloalto.gov/files/assets/public/v/1/public-works/drawings-specs/standard-drawings/sd-101_18-curb-ramp-with-4-2-landing.pdf),
[SD 105](https://www.paloalto.gov/files/assets/public/v/1/public-works/drawings-specs/standard-drawings/sd-105_18-curb-ramp-notes-and-cross-sections.pdf),
[SD 133](https://www.paloalto.gov/files/assets/public/v/1/public-works/drawings-specs/standard-drawings/sd-133_18-vertical-curb-gutter-type-a-construction-detail.pdf),
[SD 201](https://www.paloalto.gov/files/assets/public/v/1/public-works/drawings-specs/standard-drawings/sd-201_18-minimum-street-standards.pdf),
and [PMC 18.24.020](https://codelibrary.amlegal.com/codes/paloalto/latest/paloalto_ca/0-0-0-85542).

## Geometry and movement

Asphalt continues through intersections and underneath the gutter envelope.
Concrete curbs, sidewalks and ramp flares share longitudinal tessellation with the
road. Foot and wheel support uses these rendered triangles through the existing
spatial ground index. Painted zebra bars run parallel to the street, repeated
across the walking direction. Warnings and concrete are batched into three meshes;
warning domes use a texture rather than individual meshes.

At continuous road bends, asphalt, gutters, curbs, pavers and ramp warnings share
joined polygon corners. Bounded miter joins prevent independently extruded strips
from leaving gaps or protruding triangles. True junctions retain their existing
crossing treatment and clipping.

Lamps, bins and planters occupy the furnishing strip. Planters run along the
street to avoid projecting into the eight-foot walking strip. New fixtures avoid
crossing openings and flares. Mapped pedestrian ways remain pedestrian pavement,
even if wider than a vehicle lane. Source widths are retained as `mapped_width_m`; the authored game widths live in `width_m`.

## Retained constraints

SD 201's flat-area local/collector section calls for 40 ft curb-to-curb and a 60 ft
right-of-way. The game uses 8.4 m curb-to-curb: two 3.5904 m clear lanes plus
0.6096 m gutters. This comfortably separates two 2.18 m-wide cars, but does not
claim SD 201's full public right-of-way section. Dashed center markings and
right-hand chauffeur routes make the passing space visible. Houston centerlines,
footprints and destinations remain fixed. Authored arrivals are re-fitted beside
the doors; 29 interpreted tree supports occupying the road clearance are removed.
The measured canopy voxels and four mapped tree observations remain unchanged.

Sidewalk panels stop at blocked space, shop interiors and intersecting roads.
Existing building and tree constraints can interrupt the full clear width.
`#canvas-host.dataset.streetProfile` reports generated warning panels, candidate
crossing endpoints and clipped panels; it does not label clipped endpoints as
completed accessible ramps. Candidate crossings retain the game's previous
locations and 4.4 m corridor, rather than claiming surveyed or traffic-engineered
crossing placement.

The observed terrain contributes additional slopes. Junctions and overlapping
mapped segments use the highest support surface. Full grading, drainage/inlets,
turning radii, signals, striping warrants, tree spacing and right-of-way acquisition
are outside this game treatment. Warning texture is a visual approximation of
detectable domes, not a construction specification for Caltrans A88A.

## Verification

`preview/tests/street-profile.test.js` checks dimensions, ramp and gutter slopes,
rendered ground support, intersection coverage, fixture clearance, pedestrian-way
classification and honest constraint reporting. Existing navigation, walking,
curb-descent and vehicle tests exercise the shared movement behavior.

Run `npm test`, `npm run test:server`, `npm run test:desktop`,
`npm run desktop:package`, and `node desktop/e2e.js --dev`.
Desktop reports include the loaded street profile. See [desktop development](desktop.md)
for launching the native app and testing the packaged executable.
