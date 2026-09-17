# River Oaks verification

Overall: **fail**

This report does not certify photorealism, survey accuracy, or real-time performance.

| Check | Status | Evidence |
| --- | --- | --- |
| road_import | pass | import fidelity against source GIS, not independent survey accuracy; max deviation 4.547473508864641e-13 m |
| parcel_import | pass | import fidelity against source GIS, not independent survey accuracy; max deviation 0.0 m |
| world_bounds | pass | Measured from generated manifest |
| building_containment | pass | Footprints inside independently projected source parcel setbacks |
| coordinate_contract | pass | Measured from generated manifest |
| unique_geometry_ids | pass | Measured from generated manifest |
| source_integrity | pass | Measured from generated manifest |
| terrain_import | pass | Import fidelity against observed DEM; not vertical survey accuracy |
| canopy | fail | Measured from generated manifest |
| road_survey_accuracy | blocked | Independent survey/checkpoints not supplied |
| neighborhood_boundary | blocked | Bounding box is provisional; authoritative boundary required |
| elevation | blocked | DEM imported; source age and independent vertical checkpoints require review |
| lane_topology | blocked | Lane count/width/median/signal observations required |
| residence_similarity | blocked | All generated homes require manual facade review |
| visual_fidelity | blocked | Licensed foliage/material/audio kits and engine capture required |
| gpu_performance | blocked | Target GPU 4K frame-time trace required |
| jev_live | blocked | Authenticated live service benchmark required |
