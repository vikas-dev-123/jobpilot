# JobPilot AI

**JobPilot AI** is a developer-style job search assistant: a **Chrome extension** plus a **local FastAPI backend** that uses AI to parse your resume, score how well you fit a job posting, and help you draft outreach — without replacing how you actually apply on each site.

**Repository:** [github.com/vikas-dev-123/jobpilot](https://github.com/vikas-dev-123/jobpilot)

---

## What is this extension?

JobPilot AI is a **browser extension for Google Chrome** (Manifest V3) built for people who spend time on **LinkedIn Jobs** and **Naukri**.

### What it does for you

1. **Resume first** — You upload a **PDF resume** from the extension popup. The backend extracts text and uses an LLM to pull out **skills, work experience, and education** so the rest of the tool knows who you are.

2. **On the job page** — When you open a job detail page, the extension injects a small **“Analyze job”** control. It reads the **title, company, and description** already visible on the page (no server-side scraping of those sites) and sends that to your **local API**.

3. **Match score** — The API compares your parsed skills to the job text and returns a **match percentage**, plus **matched vs. missing skills**, shown in a **sidebar** panel.

4. **Writing help** — From the sidebar you can generate a **cover letter** and a **recruiter-style email** draft, powered by the LLM you configure (Gemini, Groq, or OpenAI).

5. **Apply queue (workflow)** — You can **add jobs to a queue** from the sidebar, then use the popup to **open each posting**, track status, draft email, and optionally **send mail via SMTP** if you configure it — with the understanding that **you still apply on the employer’s site** yourself (automation of application forms is intentionally out of scope).

6. **Discovery** — The popup can show **suggested search links** (keywords derived from your resume) across several job portals so you can explore faster.

7. **Email on the page** — If a **`mailto:` link** or a plain **email address appears in the job text**, the extension tries to **detect it** and surface it in the UI. Many **LinkedIn** posts never show an email; that is a platform limitation, not a bug in the extension.

### What it is not

- Not an official LinkedIn or Naukri product.
- Not a replacement for reading the full job description or company policies.
- Not designed to mass-submit applications or send unsolicited bulk email; use it thoughtfully and in line with each site’s terms and applicable laws.

---

## Features (summary)

| Area | Capability |
|------|------------|
| **Resume** | PDF upload, text extraction (`pdfplumber`), structured parsing via LLM |
| **Matching** | Embeddings (Hugging Face / OpenAI) or **keyword-only** mode (`EMBEDDING_PROVIDER=none`) |
| **Extension UI** | Popup (upload + queue + discover), content script + sidebar on job pages |
| **AI text** | Cover letter + recruiter email drafts |
| **Queue** | Persisted apply queue API + popup actions |
| **Optional email send** | SMTP settings in `.env` for `/email/send` |
| **Timeouts** | Bounded HTTP / embedding waits to avoid endless loading states |

---

## Architecture

| Layer | Stack |
|--------|--------|
| **Extension** | Chrome MV3 — content script, service worker, popup, iframe sidebar |
| **Backend** | FastAPI + Uvicorn |
| **LLM** | Configurable: **Gemini**, **Groq**, **OpenAI** |
| **Embeddings** | **Hugging Face**, **OpenAI**, or **none** (fast keyword scoring) |

The extension only sends the **currently open tab’s** job data to **your machine** (`localhost` / `127.0.0.1:8000` by default), not to a third-party hosted backend unless **you** point APIs (LLM/HF) at external providers via keys in `.env`.

---

## Prerequisites

- **Python 3.10+**
- **Google Chrome** (or another Chromium browser that supports unpacked extensions the same way)
- At least one **LLM API key** (see Configuration)
- For semantic match scores: an **embedding** provider, or set **`EMBEDDING_PROVIDER=none`** for instant keyword-based scores

---

## Quick start

### 1. Clone the repository

```powershell
git clone https://github.com/vikas-dev-123/jobpilot.git
cd jobpilot
```

*(If your local folder is still named `jobScrapper`, `cd` into that folder instead — the layout is the same.)*

### 2. Backend

From the **repository root**:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Edit .env: LLM keys, optional HF token, SMTP if you want send-from-backend
cd ..
```

Run the API **from the repo root** (imports use the `backend` package):

```powershell
.\backend\venv\Scripts\activate
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

**Windows shortcut:**

```powershell
powershell -ExecutionPolicy Bypass -File .\start-backend.ps1
```

- **API root:** [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Swagger UI:** [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 3. Load the Chrome extension

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. **Load unpacked** → choose this repo’s **`extension/`** folder
4. Pin **JobPilot AI**, open the popup, and upload your PDF resume
5. Visit a **LinkedIn** or **Naukri** job posting and use **Analyze job**

If you restrict CORS, add your extension origin under `ALLOWED_ORIGINS` in `backend/.env` (see `.env.example`).

---

## Configuration (`backend/.env`)

Copy from `backend/.env.example`. Important variables:

| Variable | Purpose |
|----------|---------|
| `LLM_PROVIDER` | `gemini` \| `groq` \| `openai` |
| `GEMINI_API_KEY` / `GROQ_API_KEY` / `OPENAI_API_KEY` | LLM authentication |
| `EMBEDDING_PROVIDER` | `huggingface` \| `openai` \| `none` |
| `HF_API_TOKEN` | Required for Hugging Face embeddings when that provider is active |
| `MATCH_EMBED_TIMEOUT_SEC` | Cap wait for embedding-based match; falls back to keywords |
| `SMTP_ENABLED`, `SMTP_*` | Optional: send drafts via backend (`/email/send`) |

**Do not commit `backend/.env`** — it is gitignored.

---

## API overview (high level)

| Prefix | Role |
|--------|------|
| `/resume` | Upload PDF, session resume snapshot |
| `/jobs` | Submit a scraped job payload, receive match result |
| `/apply-queue` | Add/list/update queued roles |
| `/discover` | Search-plan links from resume keywords |
| `/coverletter`, `/email` | Generate drafts; `/email/send` if SMTP enabled |

Full contract: **`/docs`**.

---

## Project structure

```text
├── backend/
│   ├── main.py
│   ├── routes/          # resume, jobs, apply_queue, discover, coverletter, email
│   ├── services/        # llm, matcher, parser, extractor, smtp_send
│   ├── models/
│   ├── storage/
│   ├── requirements.txt
│   └── .env.example
├── extension/           # Chrome MV3 extension
├── start-backend.ps1
└── README.md
```

---

## Development notes

- Always run Uvicorn from the **repository root** so `backend.*` imports resolve.
- **Resume and queue session state** in the API are largely **in-memory / file-backed per feature**; restarting clears in-memory resume unless you re-upload.

---

## Security & privacy

- Treat **API keys** as secrets; keep them in `.env` or a proper secret manager.
- The extension requests permission to run on **LinkedIn**, **Naukri**, and **localhost** — review `extension/manifest.json` before use.
- **SMTP**: only enable if you understand your provider’s rules and anti-spam expectations.

---

## License

Add a `LICENSE` file and update this line when you choose a license (for example MIT).
