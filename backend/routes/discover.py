"""
Job discovery from parsed resume — builds search queries and portal URLs.

We do NOT scrape third-party job sites. Links open official search pages so you
browse and apply manually (respect each site’s terms).
"""
from __future__ import annotations

from urllib.parse import quote_plus

from fastapi import APIRouter, HTTPException

from backend.models.schemas import APIResponse
from backend.routes.resume import _current_resume

router = APIRouter(prefix="/discover", tags=["Job discovery"])


def _skill_query(skills: list[str], take: int = 6) -> str:
    parts: list[str] = []
    for s in skills[:20]:
        t = (s or "").strip()
        if not t or len(t) > 48:
            continue
        parts.append(t)
        if len(parts) >= take:
            break
    return " ".join(parts)


def _build_queries(skills: list[str], experience: list[str], max_variants: int = 5) -> list[str]:
    variants: list[str] = []
    if skills:
        variants.append(_skill_query(skills, take=6))
        if len(skills) >= 4:
            variants.append(_skill_query(skills[:3], take=3))
            variants.append(_skill_query(skills[3:8], take=5))
    if experience:
        line = (experience[0] or "").strip()
        if line:
            words = line.replace(",", " ").split()
            if len(words) >= 2:
                variants.append(" ".join(words[:5]))
    seen: set[str] = set()
    out: list[str] = []
    for v in variants:
        k = v.lower()
        if len(v) < 2 or k in seen:
            continue
        seen.add(k)
        out.append(v)
        if len(out) >= max_variants:
            break
    return out or ["software engineer"]


def _portal_links(primary: str) -> list[dict]:
    q = quote_plus(primary)
    qg = quote_plus(f"jobs {primary}")
    return [
        {"name": "LinkedIn Jobs", "id": "linkedin", "url": f"https://www.linkedin.com/jobs/search/?keywords={q}"},
        {"name": "Naukri", "id": "naukri", "url": f"https://www.naukri.com/jobs-in-india?k={q}"},
        {"name": "Indeed India", "id": "indeed_in", "url": f"https://in.indeed.com/jobs?q={q}"},
        {"name": "Foundit (India)", "id": "foundit", "url": f"https://www.foundit.in/srp/results?query={q}"},
        {"name": "Google (job search)", "id": "google", "url": f"https://www.google.com/search?q={qg}"},
        {
            "name": "Wellfound",
            "id": "wellfound",
            "url": f"https://wellfound.com/jobs?keyword={q}",
        },
    ]


@router.get("/search-plan", response_model=APIResponse)
async def discover_search_plan():
    """
    Use uploaded resume skills/experience to produce search strings + portal URLs.
    """
    if not _current_resume or not _current_resume.get("skills"):
        raise HTTPException(
            status_code=400,
            detail="Upload and parse your resume first (/resume/upload).",
        )

    skills = list(_current_resume.get("skills") or [])
    experience = list(_current_resume.get("experience") or [])
    queries = _build_queries(skills, experience)
    primary = queries[0]

    data = {
        "primary_query": primary,
        "search_variants": queries,
        "portals": _portal_links(primary),
        "hint": (
            "These open each site’s own job search (keywords from your resume). "
            "JobPilot does not crawl the whole web — use many portals, then save roles you like. "
            "On LinkedIn/Naukri job pages, the extension sidebar still gives match %."
        ),
    }
    return APIResponse(success=True, message="Search plan from your resume.", data=data)
