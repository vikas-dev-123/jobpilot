"""
JobPilot AI — FastAPI Backend
Entry point. Run with: uvicorn backend.main:app --reload
"""
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load .env first (override=True: beat empty OPENAI_* placeholders from OS env)
_env = Path(__file__).resolve().parent / ".env"
if _env.is_file():
    load_dotenv(dotenv_path=_env, override=True)
else:
    load_dotenv(override=True)

from backend.routes import coverletter, discover, email_gen, jobs, resume

app = FastAPI(
    title="JobPilot AI API",
    description="Backend for JobPilot AI Chrome Extension",
    version="1.0.0",
)

# CORS — allow Chrome extension and local dev
allowed_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
allowed_origins = [o.strip() for o in allowed_origins if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(resume.router)
app.include_router(discover.router)
app.include_router(jobs.router)
app.include_router(coverletter.router)
app.include_router(email_gen.router)


@app.get("/", tags=["Health"])
async def root():
    return {"status": "JobPilot AI backend is running", "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "ok"}
