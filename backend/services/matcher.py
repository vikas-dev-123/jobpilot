"""
Job matching: OpenAI or Hugging Face embeddings when available; else keyword overlap.
"""
from __future__ import annotations

import asyncio
import os

import numpy as np

from .llm import get_embedding


def cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    a = np.array(vec_a, dtype=np.float64)
    b = np.array(vec_b, dtype=np.float64)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


async def match_job_to_resume(
    resume_skills: list[str],
    job_description: str,
    *,
    job_title: str = "",
    company: str = "",
) -> dict:
    resume_text = "Skills: " + ", ".join(resume_skills)
    job_blob = (job_description or "").strip()
    if len(job_blob) < 80:
        job_blob = "\n".join(
            p for p in (job_title, company, job_description) if (p or "").strip()
        ).strip()
    job_lower = job_blob.lower()
    matched = [s for s in resume_skills if s.lower() in job_lower]
    missing = [s for s in resume_skills if s.lower() not in job_lower]

    def _keyword_score() -> float:
        return round(100.0 * len(matched) / max(len(resume_skills), 1), 1)

    async def _embedding_score() -> float | None:
        resume_emb = await get_embedding(resume_text)
        job_emb = await get_embedding(job_blob[:8000])
        if resume_emb is not None and job_emb is not None:
            sim = cosine_similarity(resume_emb, job_emb)
            return round(max(0.0, min(1.0, sim)) * 100, 1)
        return None

    score: float
    embed_timeout = float(os.getenv("MATCH_EMBED_TIMEOUT_SEC") or "42")
    embed_timeout = max(12.0, min(embed_timeout, 120.0))
    try:
        emb = await asyncio.wait_for(_embedding_score(), timeout=embed_timeout)
        score = emb if emb is not None else _keyword_score()
    except (asyncio.TimeoutError, Exception):
        score = _keyword_score()

    return {
        "score": score,
        "matched_skills": matched,
        "missing_skills": missing,
    }
