"""
LLM + embeddings — supports Groq (cheap/free), OpenAI, Gemini, HF embeddings.
Configure via backend/.env (see .env.example).
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv
from openai import AsyncOpenAI

# Reload .env when file changes (uvicorn --reload does not re-read .env by default)
_ENV_PATH: Path | None = None
_ENV_MTIME: float | None = None

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)


def _backend_env_paths() -> list[Path]:
    paths: list[Path] = []
    here = Path(__file__).resolve()
    paths.append(here.parent.parent / ".env")
    cwd = Path.cwd()
    paths.append(cwd / "backend" / ".env")
    if cwd.name == "backend":
        paths.append(cwd / ".env")
    return paths


def _ensure_env_loaded() -> None:
    """Load or reload backend/.env if the file on disk changed."""
    global _ENV_PATH, _ENV_MTIME
    path: Path | None = None
    for candidate in _backend_env_paths():
        if candidate.is_file():
            path = candidate
            break
    if path is not None:
        mtime = path.stat().st_mtime
        if _ENV_MTIME != mtime or _ENV_PATH != path:
            load_dotenv(dotenv_path=path, override=True)
            _ENV_PATH = path
            _ENV_MTIME = mtime
        return
    if _ENV_MTIME is None:
        load_dotenv(override=True)
        _ENV_MTIME = -1.0


def _detect_llm_provider() -> str:
    """groq | openai | gemini — pick from env or first available key."""
    explicit = (os.getenv("LLM_PROVIDER") or "").strip().lower()
    if explicit in ("groq", "openai", "gemini"):
        return explicit
    gsk = (os.getenv("GROQ_API_KEY") or "").strip()
    if gsk and not gsk.endswith("_here") and gsk != "gsk-your-groq-key-here":
        return "groq"
    if (os.getenv("GEMINI_API_KEY") or "").strip():
        return "gemini"
    if (os.getenv("OPENAI_API_KEY") or "").strip() and not (
        os.getenv("OPENAI_API_KEY") or ""
    ).startswith("sk-your"):
        return "openai"
    raise ValueError(
        "No LLM API key found. Set one of: GROQ_API_KEY (recommended, free tier), "
        "GEMINI_API_KEY, or OPENAI_API_KEY in backend/.env — and optionally LLM_PROVIDER."
    )


def _openai_compatible_client(*, base_url: str | None, api_key: str) -> AsyncOpenAI:
    kwargs: dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return AsyncOpenAI(**kwargs)


async def chat_completion(
    *,
    system: str,
    user: str,
    temperature: float = 0.2,
    max_tokens: int = 1024,
) -> str:
    """Single user message + system prompt → assistant text (any provider)."""
    _ensure_env_loaded()
    provider = _detect_llm_provider()

    if provider == "groq":
        key = (os.getenv("GROQ_API_KEY") or "").strip()
        if not key:
            raise ValueError("GROQ_API_KEY missing in backend/.env")
        model = (os.getenv("GROQ_MODEL") or "llama-3.1-8b-instant").strip()
        client = _openai_compatible_client(base_url=GROQ_BASE_URL, api_key=key)
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return (resp.choices[0].message.content or "").strip()

    if provider == "openai":
        key = (os.getenv("OPENAI_API_KEY") or "").strip()
        if not key or key.startswith("sk-your"):
            raise ValueError("OPENAI_API_KEY missing in backend/.env")
        model = (os.getenv("OPENAI_CHAT_MODEL") or "gpt-3.5-turbo").strip()
        client = _openai_compatible_client(base_url=None, api_key=key)
        resp = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return (resp.choices[0].message.content or "").strip()

    # gemini
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        raise ValueError("GEMINI_API_KEY missing in backend/.env")
    model = (os.getenv("GEMINI_MODEL") or "gemini-2.5-flash").strip()
    url = GEMINI_GENERATE_URL.format(model=model) + f"?key={key}"
    payload = {
        "contents": [
            {
                "parts": [{"text": f"{system}\n\n---\n\n{user}"}],
            }
        ],
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    async with httpx.AsyncClient(timeout=120.0) as http:
        r = await http.post(url, json=payload)
        try:
            data = r.json()
        except Exception:
            data = {}
        if r.status_code != 200:
            err = data.get("error", {}) if isinstance(data, dict) else {}
            msg = err.get("message") or err.get("status") or r.text[:400]
            raise RuntimeError(
                f"Gemini API HTTP {r.status_code}: {msg}. "
                "If 429: wait or try GEMINI_MODEL=gemini-1.5-flash / enable billing "
                "in backend/.env (see AI Studio quotas)."
            )
    candidates = data.get("candidates") or []
    if not candidates:
        feedback = data.get("promptFeedback") or data
        raise RuntimeError(f"Gemini returned no text (blocked or empty). Info: {feedback}")
    parts = candidates[0].get("content", {}).get("parts", [])
    texts = [p.get("text", "") for p in parts if isinstance(p, dict)]
    return "".join(texts).strip()


def _detect_embedding_provider() -> str:
    explicit = (os.getenv("EMBEDDING_PROVIDER") or "").strip().lower()
    if explicit in ("huggingface", "openai", "none"):
        return explicit
    hf_ok = (os.getenv("HF_API_TOKEN") or "").strip() and not (
        os.getenv("HF_API_TOKEN") or ""
    ).startswith("hf_your")
    openai_ok = (os.getenv("OPENAI_API_KEY") or "").strip() and not (
        os.getenv("OPENAI_API_KEY") or ""
    ).startswith("sk-your")
    # Prefer HF when token is set — avoids OpenAI embedding cost
    if hf_ok:
        return "huggingface"
    if openai_ok:
        return "openai"
    return "none"


async def get_embedding(text: str) -> list[float] | None:
    """
    Embedding vector or None if provider is 'none' (caller uses keyword fallback).
    """
    _ensure_env_loaded()
    provider = _detect_embedding_provider()
    snippet = (text or "")[:8000]

    if provider == "openai":
        key = (os.getenv("OPENAI_API_KEY") or "").strip()
        client = _openai_compatible_client(base_url=None, api_key=key)
        model = (os.getenv("OPENAI_EMBEDDING_MODEL") or "text-embedding-3-small").strip()
        resp = await client.embeddings.create(model=model, input=snippet)
        return list(resp.data[0].embedding)

    if provider == "huggingface":
        token = (os.getenv("HF_API_TOKEN") or "").strip()
        model = (
            os.getenv("HF_EMBEDDING_MODEL") or "sentence-transformers/all-MiniLM-L6-v2"
        ).strip()
        api_url = f"https://router.huggingface.co/hf-inference/models/{model}"
        # Short timeouts — free HF tier often queues; don't block sidebar for minutes
        timeout = httpx.Timeout(18.0, connect=8.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as http:
                r = await http.post(
                    api_url,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json",
                    },
                    json={"inputs": snippet[:2000]},
                )
                if r.status_code == 410:
                    legacy = f"https://api-inference.huggingface.co/models/{model}"
                    r = await http.post(
                        legacy,
                        headers={"Authorization": f"Bearer {token}"},
                        json={"inputs": snippet[:2000]},
                    )
                if r.status_code >= 400:
                    return None
                data = r.json()
        except (httpx.TimeoutException, httpx.RequestError, ValueError, TypeError):
            return None
        if isinstance(data, list) and data and isinstance(data[0], list):
            return [float(x) for x in data[0]]
        if isinstance(data, list) and data and isinstance(data[0], float):
            return [float(x) for x in data]
        return None

    return None


# Backwards compatibility — old routes imported this name
def get_openai_client() -> AsyncOpenAI:
    _ensure_env_loaded()
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not key or key.startswith("sk-your"):
        raise ValueError(
            "get_openai_client() requires OPENAI_API_KEY. "
            "Use chat_completion() for Groq/Gemini, or set OPENAI_API_KEY."
        )
    return _openai_compatible_client(base_url=None, api_key=key)
