#!/usr/bin/env python3
"""Cut NASA Blue Marble Next Generation into EPSG:4326 XYZ tiles for Tellux.

Source: July 2004 BMNG + topography + bathymetry, 21600x10800 JPEG.
Credit: NASA Earth Observatory
https://visibleearth.nasa.gov/images/73751/july-blue-marble-next-generation-w-topography-and-bathymetry

Tiling matches 3d-tiles-renderer / Tellux XYZ with projection EPSG:4326:
level 0 is 2x1 tiles, y=0 is north, 256px, zoom 0-4.

The homepage bundles zoom 0-1 tiles in examples/public/blue-marble/:
python scripts/generate-blue-marble-tiles.py --max-zoom 1 --out examples/public/blue-marble
Default --out still writes zoom 0-4 to .tmp for separate hosting.
"""

from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

SOURCE_URL = (
    "https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73751/"
    "world.topo.bathy.200407.3x21600x10800.jpg"
)
TILE_SIZE = 256
MIN_ZOOM = 0
MAX_ZOOM = 4
JPEG_QUALITY = 82


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1_000_000:
        print(f"reuse cached source: {dest}")
        return
    print(f"downloading {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"saved {dest} ({dest.stat().st_size} bytes)")


def tile_counts(zoom: int) -> tuple[int, int]:
    return 2 << zoom, 1 << zoom


def write_tiles(source: Path, out_dir: Path, max_zoom: int = MAX_ZOOM) -> int:
    print(f"opening {source}")
    image = Image.open(source).convert("RGB")
    width, height = image.size
    if width != 2 * height:
        raise SystemExit(f"expected 2:1 equirectangular image, got {width}x{height}")

    written = 0
    for zoom in range(MIN_ZOOM, max_zoom + 1):
        tiles_x, tiles_y = tile_counts(zoom)
        print(f"zoom {zoom}: {tiles_x}x{tiles_y}")
        for x in range(tiles_x):
            for y in range(tiles_y):
                left = x / tiles_x * width
                right = (x + 1) / tiles_x * width
                top = y / tiles_y * height
                bottom = (y + 1) / tiles_y * height
                tile = image.resize(
                    (TILE_SIZE, TILE_SIZE),
                    resample=Image.Resampling.LANCZOS,
                    box=(left, top, right, bottom),
                )
                tile_path = out_dir / str(zoom) / str(x) / f"{y}.jpg"
                tile_path.parent.mkdir(parents=True, exist_ok=True)
                tile.save(
                    tile_path,
                    format="JPEG",
                    quality=JPEG_QUALITY,
                    optimize=True,
                    progressive=False,
                    subsampling=2,
                )
                written += 1
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=Path(__file__).resolve().parent.parent / ".tmp" / "blue-marble-source.jpg",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / ".tmp" / "blue-marble-tiles",
    )
    parser.add_argument("--skip-download", action="store_true")
    parser.add_argument(
        "--max-zoom",
        type=int,
        choices=range(MIN_ZOOM, MAX_ZOOM + 1),
        default=MAX_ZOOM,
        help="highest zoom to generate (use 1 for the homepage)",
    )
    args = parser.parse_args()

    if not args.skip_download:
        download(SOURCE_URL, args.source)
    elif not args.source.exists():
        raise SystemExit(f"source not found: {args.source}")

    written = write_tiles(args.source, args.out, args.max_zoom)
    print(f"wrote {written} tiles to {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
