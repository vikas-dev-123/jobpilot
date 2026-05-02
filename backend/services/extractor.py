"""
AI-powered skill and experience extractor — Groq / OpenAI / Gemini via chat_completion.
"""
import json

from .llm import chat_completion


EXTRACTION_PROMPT = """
You are a resume parser. Given the resume text below, extract:
1. skills: A list of technical and soft skills (e.g. Python, React, Communication)
2. experience: A list of job titles/roles and companies (e.g. "Software Engineer at Google")
3. education: A list of degrees/institutions (e.g. "B.Tech Computer Science - IIT Delhi")

Return ONLY valid JSON in this exact format:
{{
  "skills": ["skill1", "skill2", ...],
  "experience": ["role1", "role2", ...],
  "education": ["degree1", ...]
}}

Resume text:
\"\"\"
{resume_text}
\"\"\"
"""


async def extract_resume_data(raw_text: str) -> dict:
    """Extract structured data from resume text via configured LLM provider."""
    prompt = EXTRACTION_PROMPT.format(resume_text=raw_text[:4000])

    content = await chat_completion(
        system="You are an expert resume parser. Always return valid JSON only, no markdown.",
        user=prompt,
        temperature=0.1,
        max_tokens=1200,
    )

    if content.startswith("```"):
        content = content.split("```")[1]
        if content.startswith("json"):
            content = content[4:]

    parsed = json.loads(content.strip())
    return {
        "skills": parsed.get("skills", []),
        "experience": parsed.get("experience", []),
        "education": parsed.get("education", []),
    }
