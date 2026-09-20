import httpx
import pytest

from river_oaks.acquire import fetch_layer


def test_arcgis_download_uses_id_chunks_and_whitelist():
    def respond(request):
        p = (
            request.url.params
            if request.method == "GET"
            else httpx.QueryParams(request.content.decode())
        )
        if p.get("returnIdsOnly") == "true":
            return httpx.Response(200, json={"objectIds": [3, 1, 2]})
        assert p["outFields"] == "OBJECTID,NAME"
        assert p["outSR"] == "4326"
        assert request.method == "POST"  # Long object-ID lists exceed the county GET URL limit.
        features = [
            {
                "id": int(i),
                "type": "Feature",
                "geometry": None,
                "properties": {"OBJECTID": int(i), "NAME": "ROAD", "owner_name": "private"},
            }
            for i in p["objectIds"].split(",")
        ]
        return httpx.Response(200, json={"type": "FeatureCollection", "features": features})

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        result = fetch_layer(
            client, "https://example.test/0", [0, 0, 1, 1], ["OBJECTID", "NAME"], chunk_size=2
        )
    assert [f["id"] for f in result["features"]] == [1, 2, 3]
    assert "owner_name" not in str(result)


def test_arcgis_errors_and_incomplete_pages_fail_closed():
    def respond(request):
        if request.url.params.get("returnIdsOnly"):
            return httpx.Response(200, json={"objectIds": [1]})
        return httpx.Response(200, json={"type": "FeatureCollection", "features": []})

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(ValueError, match="Incomplete"):
            fetch_layer(client, "https://example.test/0", [0, 0, 1, 1], ["OBJECTID"])


@pytest.mark.parametrize("identifier", ["id", "OBJECTID", "missing"])
def test_arcgis_identifier_survives_attribute_whitelist(identifier):
    def respond(request):
        if request.url.params.get("returnIdsOnly"):
            return httpx.Response(200, json={"objectIds": [2, 1]})
        features = []
        for number in [2, 1]:
            feature = {"type": "Feature", "geometry": None, "properties": {"NAME": "ROAD"}}
            if identifier == "id":
                feature["id"] = number
            elif identifier == "OBJECTID":
                feature["properties"]["OBJECTID"] = number
            features.append(feature)
        return httpx.Response(200, json={"features": features})

    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        if identifier == "missing":
            with pytest.raises(ValueError, match="Incomplete ArcGIS page"):
                fetch_layer(client, "https://example.test/0", [0, 0, 1, 1], ["NAME"])
            return
        result = fetch_layer(client, "https://example.test/0", [0, 0, 1, 1], ["NAME"])
    assert len(result["features"]) == 2
    assert all(feature["properties"] == {"NAME": "ROAD"} for feature in result["features"])
    if identifier == "id":
        assert [feature["id"] for feature in result["features"]] == [1, 2]
