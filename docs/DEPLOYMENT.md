# Deployment Guide — Panchayat Weather Intelligence

**Localized Agro-Meteorological Decision Support Platform (SIH26074)**

---

## 1. Static Website Deployment (Vercel)

The website is a static HTML5/CSS/JavaScript web application with zero serverless build steps and no framework runtime overhead.

### Option A: Deploy with Root Directory = `website` (Recommended)
1. Import repository in the Vercel Dashboard.
2. In **Project Settings → General**:
   - **Root Directory**: `website`
   - **Framework Preset**: `Other`
   - **Build Command**: *(leave empty)*
   - **Output Directory**: *(leave empty)*
3. Deploy.

The configuration inside `website/vercel.json` applies automatically:
- Clean route rewrites (`/app`, `/weather`, `/map`, `/validation`, `/advisory`, `/login`, etc.)
- Security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`)
- Static assets (`favicon.svg`, `robots.txt`, `sitemap.xml`)

### Option B: Deploy from Repository Root (`.`)
If the Vercel project is imported with the default Root Directory (`.`):
- The root [vercel.json](../vercel.json) transparently proxies requests to `website/index.html`, `website/app.html`, `website/login.html`, and all static subdirectories (`/css/*`, `/js/*`, `/data/*`, `/assets/*`).
- No build command or configuration change required.

---

## 2. Scientific Downscaling Service (Optional Python Backend)

The downscaling backend is a Python 3.11 / FastAPI service located in `backend/weather/`.

### Local Execution
```bash
cd backend/weather
python -m venv .venv
# Activate environment (Windows: .venv\Scripts\activate | Unix: source .venv/bin/activate)
pip install -r requirements.txt

# Train/verify deterministic model artifacts (~1 min)
python scripts/train_model.py

# Launch service
python -m uvicorn ksweather.app:app --host 0.0.0.0 --port 8088 --workers 1
```

### Containerized Deployment (Docker)
```bash
cd backend/weather
docker build -t pwi-downscaling:latest .
docker run -d -p 8088:8088 \
  -e WEATHER_CORS_ORIGINS="https://your-domain.vercel.app" \
  pwi-downscaling:latest
```

---

## 3. Environment Variables

| Variable | Target | Purpose | Default / Requirement |
|---|---|---|---|
| `WEATHER_CORS_ORIGINS` | Python Service | Allowed CORS origins | `*` (set to production frontend URL) |
| `SUPABASE_URL` | Python Service | Supabase project URL | Optional (service falls back to in-memory) |
| `SUPABASE_SERVICE_ROLE_KEY` | Python Service | Supabase service-role key | Optional (server-side only, never client) |
| `CHROME_PATH` | Test Suite | Chrome/Chromium binary path | Optional (defaults to system Chrome) |

*Note: The public static frontend requires **zero** environment variables or API keys.*
