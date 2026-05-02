import json

from fastapi import APIRouter, HTTPException

from backend.models.schemas import APIResponse, EmailRequest
from backend.services.llm import chat_completion

router = APIRouter(prefix="/email", tags=["Email Generator"])


@router.post("/generate", response_model=APIResponse)
async def generate_recruiter_email(request: EmailRequest):
    """Generate a recruiter outreach email. Preview only — no auto-send."""
    recruiter = request.recruiter_name or "Hiring Manager"
    prompt = f"""
Write a short, professional cold outreach email to a recruiter.

Recruiter Name: {recruiter}
Company: {request.company}
Job Title I'm applying for: {request.job_title}
My Top Skills: {', '.join(request.resume_skills[:8])}

Rules:
- Keep it under 150 words
- Be confident but not arrogant
- Include a clear ask (15-min call or application review)
- Subject line must be punchy and specific
- Return ONLY valid JSON: {{"subject": "...", "body": "..."}}
"""

    raw = await chat_completion(
        system="You are a career coach expert in cold outreach. Return valid JSON only, no markdown.",
        user=prompt,
        temperature=0.7,
        max_tokens=500,
    )
    content = raw.strip()

    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]

    try:
        parsed = json.loads(content.strip())
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=502,
            detail="LLM did not return valid JSON for email. Try again or switch model.",
        ) from e
    return APIResponse(
        success=True,
        message="Email draft generated. Review before sending.",
        data={"subject": parsed["subject"], "body": parsed["body"]},
    )
