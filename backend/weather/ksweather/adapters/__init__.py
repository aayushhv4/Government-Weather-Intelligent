"""Data adapters (PRD S11 / S21).

The architecture deliberately separates DATA PROVIDER from DOWNSCALING ENGINE:

    Data adapter  ->  Canonical weather dataset  ->  Feature engineering  ->  Downscaling model

A real provider (ERA5-Land, CHIRPS, IMD AWS/ARG) and a staged demo fixture
therefore enter the *same* pipeline. Swapping `SEEDED` for `ERA5LAND` must not
require a single change in the model.

Every adapter returns its own `Provenance`, and the pipeline propagates the
weakest (most simulated) provenance in the chain rather than the strongest.
"""

from .base import AdapterResult, WeatherDataAdapter  # noqa: F401
from .boundaries import load_boundaries  # noqa: F401
from .seeded import SeededAdapter  # noqa: F401
from .era5land import Era5LandAdapter  # noqa: F401
from .imd_stations import ImdStationAdapter  # noqa: F401
from .registry import ADAPTERS, get_adapter  # noqa: F401
