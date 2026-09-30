"""Panchayat Weather Intelligence (SIH26074) — Localized Agro-Meteorological Decision Support.

A block-to-Panchayat downscaling service: coarse block forecast -> geospatial
feature extraction -> named baselines -> Random Forest residual correction ->
mean-preserving adjustment -> indicative uncertainty -> Panchayat forecast ->
heat-risk crop advisory -> decision support actions.

See README.md in this folder for the full contract, provenance rules and
scientific limitations. Nothing in this package may invent measured accuracy.
"""

__version__ = "0.3.0"
