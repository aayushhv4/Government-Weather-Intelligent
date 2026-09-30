# Panchayat Weather Intelligence service (SIH26074)
# Localized Agro-Meteorological Decision Support Platform
#
# The model artifacts (engine cache + validation results) are built at image
# build time so container start-up is instant and the demo never waits for a
# model fit (PRD S19).
#
# Note on the base image: the PRD targets Python 3.11. This Dockerfile pins
# 3.11-slim to match the PRD exactly; the service was also verified on 3.14
# locally, and requirements.txt pins versions that resolve on both.

FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so Docker can cache this layer across code changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code + committed fixtures.
COPY ksweather/ ./ksweather/
COPY scripts/ ./scripts/

# Build the reproducible artifacts at image build time.
RUN python scripts/train_model.py

# Non-root runtime user.
RUN useradd --create-home --shell /usr/sbin/nologin ksweather \
    && chown -R ksweather:ksweather /app
USER ksweather

EXPOSE 8088

# `--workers 1` is deliberate: the forest is trained single-threaded for
# bit-identical results, and a single worker keeps one warm in-memory engine.
CMD ["uvicorn", "ksweather.app:app", "--host", "0.0.0.0", "--port", "8088", "--workers", "1"]
