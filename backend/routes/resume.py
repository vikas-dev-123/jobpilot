from fastapi import APIRouter, UploadFile, File, HTTPException
from backend.services.parser import extract_text_from_pdf
from backend.services.extractor import extract_resume_data
from backend.models.schemas import APIResponse

router = APIRouter(prefix="/resume", tags=["Resume"])

# In-memory store for current session (replace with DB in production)
_current_resume: dict = {}


@router.post("/upload", response_model=APIResponse)
async def upload_resume(file: UploadFile = File(...)):
    """Upload a PDF resume, extract text and AI-parsed skills."""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_bytes = await file.read()
    if len(file_bytes) > 5 * 1024 * 1024:  # 5MB limit
        raise HTTPException(status_code=400, detail="File too large. Max size is 5MB.")

    raw_text = extract_text_from_pdf(file_bytes)
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from PDF.")

    try:
        extracted = await extract_resume_data(raw_text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=str(e)[:2000],
        ) from e

    _current_resume.update({
        "raw_text": raw_text,
        "skills": extracted["skills"],
        "experience": extracted["experience"],
        "education": extracted["education"],
    })

    return APIResponse(
        success=True,
        message="Resume parsed successfully.",
        data=_current_resume,
    )


@router.get("/current", response_model=APIResponse)
async def get_current_resume():
    """Get the currently loaded resume data."""
    if not _current_resume:
        raise HTTPException(status_code=404, detail="No resume uploaded yet.")
    return APIResponse(success=True, message="Current resume.", data=_current_resume)
