from fastapi import APIRouter

from backend.models.schemas import APIResponse, CoverLetterRequest
from backend.services.llm import chat_completion

router = APIRouter(prefix="/coverletter", tags=["Cover Letter"])


@router.post("/generate", response_model=APIResponse)
async def generate_cover_letter(request: CoverLetterRequest):
    """Generate a personalized cover letter using configured LLM (Groq / OpenAI / Gemini)."""
    prompt = f"""
Write a professional, concise cover letter (max 3 paragraphs) for the following:

Job Title: {request.job.title}
Company: {request.job.company}
Job Description (summary): {request.job.description[:500]}

My Skills: {', '.join(request.resume_skills[:15])}
My Experience: {', '.join(request.resume_experience[:5])}

Rules:
- Sound human and enthusiastic, not robotic
- Highlight 2-3 specific matching skills
- End with a call to action
- Do NOT start with "I am writing to..."
"""

    letter = await chat_completion(
        system="You are an expert career coach who writes compelling cover letters.",
        user=prompt,
        temperature=0.7,
        max_tokens=700,
    )
    return APIResponse(
        success=True,
        message="Cover letter generated.",
        data={"cover_letter": letter},
    )
