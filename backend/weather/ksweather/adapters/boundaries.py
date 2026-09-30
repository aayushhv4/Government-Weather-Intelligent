"""Administrative boundary adapter (PRD S5.P0.1, S22).

Preferred order, exactly as the PRD sets it out:
  1. Bhuvan / ISRO NRSC      -> official
  2. India Geodata / DataMeet -> community, LGD-mapped (committed fallback)
  3. schematic pilot grid     -> THIS BUILD, disclosed everywhere

This environment has no staged polygons, so the committed fallback degrades one
step further to a schematic grid. That is permitted by the PRD ("ensure the
application can still run") but it changes what the product may claim:

  * the boundary source is reported as `simulated_demo` and named as schematic
  * the UI must show "NOT official Gram Panchayat boundaries"
  * no API field, screenshot or slide may describe these polygons as official

Dropping a real GeoJSON at `data/boundaries/<block_id>.geojson` (with a
`*.meta.json` sidecar declaring source/license) switches the whole product to
the community or official path with no code change.
"""

from __future__ import annotations

import json
import math
from typing import Dict, List, Optional, Tuple

from .. import config
from ..canonical import Panchayat, PilotBlock
from ..provenance import (
    COMMUNITY_BOUNDARY,
    OFFICIAL_BOUNDARY,
    SCHEMATIC_BOUNDARY,
    Provenance,
)

# Mean Earth radius approximation for the small-area conversion below.
_KM_PER_DEG_LAT = 111.32


def _cell_polygon(cell: List[float]) -> Dict:
    lon_min, lat_min, lon_max, lat_max = (float(v) for v in cell)
    return {
        "type": "Polygon",
        "coordinates": [[
            [lon_min, lat_min],
            [lon_max, lat_min],
            [lon_max, lat_max],
            [lon_min, lat_max],
            [lon_min, lat_min],
        ]],
    }


def polygon_area_km2(geometry: Dict) -> float:
    """Shoelace area in deg^2, converted to km^2 at the polygon's mean latitude.

    Adequate for Panchayat-scale polygons (a few km across) and independent of
    PostGIS, which the PRD explicitly does not require.
    """
    ring = geometry["coordinates"][0]
    n = len(ring)
    area_deg2 = 0.0
    lat_sum = 0.0
    for i in range(n - 1):
        x1, y1 = ring[i]
        x2, y2 = ring[i + 1]
        area_deg2 += (x1 * y2) - (x2 * y1)
        lat_sum += y1
    area_deg2 = abs(area_deg2) / 2.0
    mean_lat = (lat_sum / max(n - 1, 1)) if n > 1 else 0.0
    km_per_deg_lon = _KM_PER_DEG_LAT * math.cos(math.radians(mean_lat))
    return area_deg2 * _KM_PER_DEG_LAT * km_per_deg_lon


def _load_pilot_spec() -> Dict:
    with open(config.PILOT_BLOCK_FILE, "r", encoding="utf-8") as fh:
        return json.load(fh)


def _provenance_for(source_name: str) -> Provenance:
    if "bhuvan" in source_name.lower():
        return OFFICIAL_BOUNDARY
    if "india-geodata" in source_name.lower() or "datameet" in source_name.lower():
        return COMMUNITY_BOUNDARY
    return SCHEMATIC_BOUNDARY


def _load_staged_geojson(block_id: str) -> Optional[Tuple[Dict, Dict]]:
    """Real polygons + sidecar metadata, if the operator staged them."""
    geo_path = config.BOUNDARIES_DIR / f"{block_id}.geojson"
    meta_path = config.BOUNDARIES_DIR / f"{block_id}.meta.json"
    if not geo_path.exists():
        return None
    with open(geo_path, "r", encoding="utf-8") as fh:
        geo = json.load(fh)
    meta: Dict = {}
    if meta_path.exists():
        with open(meta_path, "r", encoding="utf-8") as fh:
            meta = json.load(fh)
    return geo, meta


def load_boundaries(block_id: str) -> Tuple[List[Panchayat], Dict]:
    """Return (panchayats, block_meta) for the pilot block.

    `block_meta` always carries `boundary_source` and `boundary_provenance`, so
    the caller can only ever propagate a disclosed source.
    """
    spec = _load_pilot_spec()
    if spec.get("block_id") != block_id:
        raise KeyError(f"unknown pilot block: {block_id}")

    staged = _load_staged_geojson(block_id)
    if staged is not None:
        geo, meta = staged
        source_name = str(meta.get("source_name") or "staged boundaries")
        prov = _provenance_for(source_name)
        panchayats = _panchayats_from_geojson(geo, meta, block_id, prov.source_name)
        block_meta = {
            "block_id": block_id,
            "name": meta.get("name", spec.get("name")),
            "district": meta.get("district", spec.get("district")),
            "state": meta.get("state", spec.get("state")),
            "boundary_source": prov.source_name,
            "boundary_provenance": prov.as_dict(),
            "boundary_is_schematic": False,
        }
        return _sanity_check(panchayats), block_meta

    # --- committed schematic fallback -------------------------------------
    prov = SCHEMATIC_BOUNDARY
    panchayats: List[Panchayat] = []
    for item in spec["panchayats"]:
        geometry = _cell_polygon(item["cell"])
        lon_min, lat_min, lon_max, lat_max = (float(v) for v in item["cell"])
        panchayats.append(
            Panchayat(
                panchayat_id=item["panchayat_id"],
                lgd_code=str(item["lgd_code"]),
                name=item["name"],
                block_id=block_id,
                geometry=geometry,
                centroid_lat=(lat_min + lat_max) / 2.0,
                centroid_lon=(lon_min + lon_max) / 2.0,
                elevation_m=float(item["elevation_m"]),
                slope_deg=float(item["slope_deg"]),
                aspect_deg=float(item["aspect_deg"]),
                land_cover=str(item["land_cover"]),
                ndvi=float(item["ndvi"]),
                area_km2=round(polygon_area_km2(geometry), 4),
                boundary_source=prov.source_name,
            )
        )

    block_meta = {
        "block_id": block_id,
        "name": spec["name"],
        "district": spec["district"],
        "state": spec["state"],
        "bbox": spec["bbox"],
        "boundary_source": spec["boundary_source"],
        "boundary_provenance": prov.as_dict(),
        "boundary_is_schematic": True,
        "selection_rationale": spec["selection_rationale"],
    }
    return _sanity_check(panchayats), block_meta


def _panchayats_from_geojson(
    geo: Dict, meta: Dict, block_id: str, boundary_source: str
) -> List[Panchayat]:
    """Build Panchayats from real polygons; terrain attributes come from the
    sidecar until a DEM/NDVI raster adapter is wired in."""
    attrs = {a["panchayat_id"]: a for a in meta.get("panchayats", [])}
    out: List[Panchayat] = []
    for feature in geo.get("features", []):
        props = feature.get("properties", {})
        pid = props.get("panchayat_id") or props.get("LGD") or props.get("lgd_code")
        extra = attrs.get(pid, {})
        geometry = feature["geometry"]
        ring = geometry["coordinates"][0]
        lons = [c[0] for c in ring]
        lats = [c[1] for c in ring]
        out.append(
            Panchayat(
                panchayat_id=str(pid),
                lgd_code=str(props.get("lgd_code", pid)),
                name=str(props.get("name", pid)),
                block_id=block_id,
                geometry=geometry,
                centroid_lat=sum(lats) / len(lats),
                centroid_lon=sum(lons) / len(lons),
                elevation_m=float(extra.get("elevation_m", 0.0)),
                slope_deg=float(extra.get("slope_deg", 0.0)),
                aspect_deg=float(extra.get("aspect_deg", 0.0)),
                land_cover=str(extra.get("land_cover", "cropland")),
                ndvi=float(extra.get("ndvi", 0.0)),
                area_km2=round(polygon_area_km2(geometry), 4),
                boundary_source=boundary_source,
            )
        )
    return out


def _sanity_check(panchayats: List[Panchayat]) -> List[Panchayat]:
    """Geometry + area-weight sanity check (PRD Day 0 prerequisite)."""
    if not panchayats:
        raise ValueError("no panchayats loaded — cannot run downscaling")
    if not (5 <= len(panchayats) <= 15):
        raise ValueError(
            f"pilot block has {len(panchayats)} panchayats; PRD requires 5-15"
        )
    for p in panchayats:
        if p.area_km2 <= 0:
            raise ValueError(f"non-positive area for {p.panchayat_id}")
        if not p.geometry.get("coordinates"):
            raise ValueError(f"missing geometry for {p.panchayat_id}")
    elevations = {p.elevation_m for p in panchayats}
    if len(elevations) < 2:
        raise ValueError("pilot block has no elevation variation — downscaling demo is meaningless")
    return panchayats
