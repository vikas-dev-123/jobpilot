# JobPilot AI

**JobPilot AI** is an AI-assisted job search companion: a **Chrome extension** that works with job listings on **LinkedIn** and **Naukri**, backed by a **FastAPI** service for resume parsing, skill matching, cover letters, and related helpers.

---

## Features

- **Resume upload (PDF)** — Text extraction and structured parsing (skills, experience, education).
- **Job matching** — Scores listings against your resume using embeddings and/or keyword signals (configurable).
- **Sidebar workflow** — In-page UI on supported job sites.
- **Cover letter & email helpers** — Generated text tailored to the role (via your configured LLM).
- **Discover** — Supporting routes for exploration and integration from the extension.

---

## Architecture

| Layer | Technology |
|--------|------------|
| **Extension** | Chrome Manifest V3 (content scripts, service worker, popup, sidebar) |
| **API** | FastAPI, Uvicorn |
| **LLM** | Pluggable: **Gemini**, **Groq**, or **OpenAI** (see `backend/.env.example`) |
| **Embeddings** | **Hugging Face** (recommended), **OpenAI**, or **none** (fast keyword-only mode) |
| **Resume parsing** | PDF → `pdfplumber`; structured fields via LLM |

Client-side scraping reads the open job page; the backend receives job payloads and the uploaded resume context for matching and generation.

---

## Prerequisites

- **Python 3.10+** (3.10 tested in project layout)
- **Google Chrome** (Chromium-compatible) for the extension
- API keys as needed (see [Configuration](#configuration)): at least one LLM provider; for semantic matching, an embedding provider unless you use `EMBEDDING_PROVIDER=none`

---

## Quick start

### 1. Clone and open the repo

```powershell
git clone <YOUR_REPO_URL>
cd jobScrapper
```

### 2. Backend

From the **repository root** (`jobScrapper/`):

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env — add GEMINI_API_KEY, HF_API_TOKEN, etc.
cd ..
```

Start the API (still from repo root, with venv activated):

```powershell
.\backend\venv\Scripts\activate
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Or on Windows, from repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
```

- **API:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive docs:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. Pin **JobPilot AI** and upload your resume from the popup
5. Optional: set `ALLOWED_ORIGINS` in `backend/.env` to include your extension origin if you tighten CORS (see `.env.example`)

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and fill in:

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | `gemini` \| `groq` \| `openai` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` | LLM credentials |
| `EMBEDDING_PROVIDER` | `huggingface` \| `openai` \| `none` |
| `HF_API_TOKEN` | Hugging Face token (if using HF embeddings) |
| `ALLOWED_ORIGINS` | Comma-separated origins; extension uses `chrome-extension://...` |

**Never commit `backend/.env`** — it is listed in `.gitignore`.

---

## API overview

Routers are mounted under prefixes such as:

- `/resume` — upload and session resume data
- `/jobs` — submit scraped jobs, list matches
- `/discover`, `/coverletter`, `/email` — discovery and generation flows

Use `/docs` for the full OpenAPI contract.

---

## Project structure

```text
jobScrapper/
├── backend/
│   ├── main.py              # FastAPI app
│   ├── routes/              # HTTP routers
│   ├── services/            # LLM, matcher, parser, extractor
│   ├── models/              # Pydantic schemas
│   ├── storage/             # Local upload area (gitignored except .gitkeep)
│   ├── requirements.txt
│   └── .env.example
├── extension/               # Chrome extension (MV3)
├── start-backend.ps1        # Windows helper to run Uvicorn
└── README.md
```

---

## Development notes

- Run Uvicorn from the **repo root** so imports resolve as `backend.*`.
- Session state (e.g. current resume) is **in-memory**; restarting the server clears it unless you add persistence.

---

## Security & privacy

- Keep API keys only in `backend/.env` or your host’s secret store.
- The extension is granted access to LinkedIn/Naukri and your local API URLs defined in `manifest.json`; review permissions before installing.

---

## License

Specify your license here (e.g. MIT) once you choose one for the project.
