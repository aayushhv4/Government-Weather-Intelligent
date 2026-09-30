#!/usr/bin/env python
"""Export the standalone SIH26074 product's offline fallback snapshot.

Writes `website/data/demo-bundle.js`, which sets
`window.KS_WEATHER_BUNDLE` to a snapshot of the *real* engine output for the pilot
block — same trained Random Forest residual model, same seed (42).

The standalone product loads this snapshot only when the live service is
unreachable, so the site stays fully explorable with no backend. A fallback never
upgrades provenance: every value keeps the `source_type` the engine assigned it,
and the validation metrics in the snapshot are that run's real hindcast metrics —
they are never hand-written or substituted.

Run from `backend/weather`:

    python scripts/export_product_bundle.py
"""

from __future__ import annotations

import sys
from pathlib import Path

SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from scripts.export_frontend_bundle import build_bundle, render  # noqa: E402

PRODUCT_BUNDLE = (
    SERVICE_DIR.parent.parent.parent / "website" / "data" / "demo-bundle.js"
)

HEADER = (
    "/* Generated offline fallback snapshot for the standalone SIH26074 product.\n"
    "   Real engine output (trained RF residual model, seed 42). Used ONLY when the live\n"
    "   service is unreachable. Provenance is never upgraded by this fallback.\n"
    "   Regenerate: cd backend/weather && python scripts/export_product_bundle.py */\n"
)


def main() -> int:
    block = render(build_bundle())
    PRODUCT_BUNDLE.parent.mkdir(parents=True, exist_ok=True)
    PRODUCT_BUNDLE.write_text(HEADER + block + "\n", encoding="utf-8")
    print(f"wrote {PRODUCT_BUNDLE} ({len(block):,} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
