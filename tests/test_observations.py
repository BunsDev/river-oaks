import numpy as np
import pytest
from rasterio.errors import NotGeoreferencedWarning
from rasterio.io import MemoryFile
from shapely.geometry import shape

from river_oaks.observations import canopy_reference


def png_bytes(data):
    with MemoryFile() as memory:
        with pytest.warns(NotGeoreferencedWarning):
            with memory.open(
                driver="PNG", width=data.shape[2], height=data.shape[1], count=4, dtype="uint8"
            ) as dataset:
                dataset.write(data)
        return memory.read()


def test_canopy_mask_uses_returned_pixel_extent_and_alpha_not_a_guessed_bbox():
    values = np.zeros((4, 2, 2), dtype="uint8")
    values[:, 0, 0] = [0, 115, 76, 255]  # northwest 10x10 meter canopy pixel
    png = png_bytes(values)
    extent = {
        "xmin": 100,
        "ymin": 200,
        "xmax": 120,
        "ymax": 220,
        "spatialReference": {"wkid": 32615},
    }
    reference = canopy_reference(png, extent, (100, 200), "observed-test")
    geometry = shape(reference["geometry"])
    assert geometry.area == pytest.approx(100)
    assert geometry.bounds == pytest.approx((0, 10, 10, 20))
    assert reference["observed_canopy_pixels"] == 1
    assert reference["pixel_size_m"] == [10, 10]


def test_unexpected_canopy_rendering_is_rejected_instead_of_called_tree_cover():
    values = np.zeros((4, 2, 2), dtype="uint8")
    values[:, 0, 0] = [255, 0, 0, 255]
    with pytest.raises(ValueError, match="renderer"):
        canopy_reference(
            png_bytes(values),
            {"xmin": 0, "ymin": 0, "xmax": 2, "ymax": 2, "spatialReference": {"wkid": 32615}},
            (0, 0),
            "test",
        )
