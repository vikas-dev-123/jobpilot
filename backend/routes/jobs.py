from fastapi import APIRouter, HTTPException
from backend.models.schemas import JobData, MatchResult, APIResponse
from backend.services.matcher import match_job_to_resume
from backend.routes.resume import _current_resume

router = APIRouter(prefix="/jobs", tags=["Jobs"])

_job_store: list[dict] = []


@router.post("/submit", response_model=APIResponse)
async def submit_job(job: JobData):
    """Receive a scraped job from the Chrome extension and compute match score."""
    if not _current_resume:
        raise HTTPException(status_code=400, detail="Upload a resume first via /resume/upload.")

    skills = _current_resume.get("skills", [])
    match = await match_job_to_resume(
        skills,
        job.description,
        job_title=job.title,
        company=job.company,
    )

    result = {
        "job": job.model_dump(),
        "score": match["score"],
        "matched_skills": match["matched_skills"],
        "missing_skills": match["missing_skills"],
    }
    _job_store.append(result)

    return APIResponse(success=True, message="Job matched.", data=result)


@router.get("/list", response_model=APIResponse)
async def list_jobs():
    """Return all matched jobs for this session."""
    return APIResponse(success=True, message="All matched jobs.", data={"jobs": _job_store})


@router.delete("/clear", response_model=APIResponse)
async def clear_jobs():
    """Clear all stored jobs."""
    _job_store.clear()
    return APIResponse(success=True, message="Job store cleared.")
