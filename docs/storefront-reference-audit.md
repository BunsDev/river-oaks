# Storefront reference audit

Checked September 19, 2026. The district preview contains 30 OpenStreetMap tenant points. Their names were compared with the venue's current [shop](https://www.riveroaksdistrict.com/shop), [dining](https://www.riveroaksdistrict.com/dine), [beauty and wellness](https://www.riveroaksdistrict.com/beauty-wellness), and [district overview](https://www.riveroaksdistrict.com/what-is-river-oaks-district) pages. Those lists establish tenant presence, not the footprint, suite boundary, entrance, or appearance of a particular mapped facade.

**Reference guided** means an identifiable exterior source informed a simplified renderer treatment. **Directory only** means this audit has not established a usable current exterior reference for that mapped destination. Neither status is photographic or survey validation. The renderer does not embed any of the reference photos.

| Mapped destination | Evidence status | Frontage still needed |
| --- | --- | --- |
| Alice + Olivia | Directory only | Current facade, sign, entry, suite span |
| Amorino | Directory only | Current facade, sign, entry, suite span |
| Baccarat | Directory only | Current facade, sign, entry, suite span |
| Bella Rinova | Directory only | Current facade, sign, entry, suite span |
| Brunello Cucinelli | Directory only | Current facade, sign, entry, suite span |
| Cartier | Reference guided; 2025 remodel | Measured frontage and current display windows |
| Dior | Reference guided; architect photos | Current frontage and display windows |
| Diptyque | Directory only | Current facade, sign, entry, suite span |
| Dolce & Gabbana | Directory only | Current facade, sign, entry, suite span |
| Equinox | Reference guided; Street View 2023 (registered) | Measured soffit depth and bay spacing |
| Harry Winston | Reference guided; official salon photo | Measured arch, awnings, window spacing |
| Hermès | Directory only | Current facade, sign, entry, suite span |
| Hopdoddy Burger Bar | Directory only | Current facade, sign, entry, suite span |
| IPIC Theaters | Directory only | Current facade, sign, entry, suite span |
| Jo Malone London | Directory only | Current facade, sign, entry, suite span |
| Kiton | Directory only | Current facade, sign, entry, suite span |
| Laura Rathe Fine Art | Directory only | Current facade, sign, entry, suite span |
| Le Colonial | Reference guided; Street View 2023–2024 (registered) | Measured veranda and terrace dimensions |
| MAD Houston | Directory only | Current facade, sign, entry, suite span |
| Moreau | Directory only | Current facade, sign, entry, suite span |
| Oliver Peoples | Directory only | Current facade, sign, entry, suite span |
| Saint Bernard | Reference guided; Street View 2023 (registered) | Measured canopy and suite span |
| Steak 48 | Reference guided; venue exterior photo | Current soffit, planting, entrance dimensions |
| Toulouse | Directory only | Current facade, sign, entry, suite span |
| Van Cleef & Arpels | Reference guided; 2025 relocation | New suite boundary, tile geometry, entrance |
| Veronica Beard | Directory only | Current facade, sign, entry, suite span |
| Vilebrequin | Directory only | Current facade, sign, entry, suite span |
| Vince | Directory only | Current facade, sign, entry, suite span |
| Zadig & Voltaire | Directory only | Current facade, sign, entry, suite span |
| de Boulle | Directory only | Current facade, sign, entry, suite span |

## Acceptance evidence for a true-to-site frontage

Each store needs a dated, usable straight-on and oblique exterior photograph, a measured or scaled frontage and entrance location, and a license permitting use of any derived textures or imagery. A repeatable comparison must render the same camera position, focal length, time of day, and lighting as the reference. A pixel difference is meaningful only after those views are registered. Interior displays and seasonal signage require their own date-specific references.

The current OSM tenant points and nine building rings cannot define all 30 suite boundaries. The [2025 Van Cleef & Arpels relocation](https://www.riveroaksdistrict.com/press/van-cleef-arpels-expands-in-houstons-river-oaks-district) is a concrete reason to recheck storefront positions before claiming exact placement.

## Equinox block from Street View (October 2026)

Six Street View screenshots supplied on October 9, 2026 (1908 × 1146, captured 2023–2024) cover the Equinox building at 4444 Westheimer. Three of them frame this block's frontages and are registered: `preview/e2e/fixtures/facades.js` renders `sv-davidoff`, `sv-equinox` and `sv-saint-bernard` from the camera position, aim and lens solved for each photograph.
- Each lens came from known storey heights (ground, shop glass, soffit, window heads); the RMS height error is 0.03 m or less. A symmetric edge-distance fit then refined the camera.
- At street level, compared side by side at 1908 × 1146:
  - Davidoff of Geneva's two bays and their pier, the Le Colonial wing and its veranda land within about 10 px horizontally. Davidoff's name band sits about 25 px high, roughly 0.4 m.
  - Equinox's pylon, its EQUINOX letters, the five-pane window and the soffit land within about 15–20 px. The office lobby's canopy runs slightly wide.
  - Saint Bernard's name, shop glass edges, shield panel, soffit and corner coincide.

The photographs fixed the block's layout:
- **Le Colonial:** occupies a two-storey wing on the Kettering Drive end, with sky above it. The tower's mass steps back to clear it.
- **North lane, east to west:** three wide Equinox bays under a deep bronze soffit, then the bronze EQUINOX pylon, a pier with the 4444 plaque, the office lobby, two Davidoff of Geneva bays (about 3.5 m each), then Le Colonial.
- **Office lobby:** a green-glass canopy, with the curtain wall coming down to it through the podium.
- **East lane:** Saint Bernard sits between solid stone carrying its shield sign and three glazed bays, under a steel-and-glass canopy over the lane.

The other three screenshots look along the lanes. They are references, not registered views: their foregrounds are the Harry Winston block, being rebuilt separately, and the district's paving and roads, which this change does not touch. Davidoff of Geneva and U.S. Capital Advisors are not mapped tenants; they appear only as signage.

Not modelled: people, vehicles, trees, the valet stand, seasonal window displays, and the exact text of small print.
