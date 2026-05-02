from pydantic import BaseModel
from typing import Optional


class ResumeData(BaseModel):
    raw_text: str
    skills: list[str]
    experience: list[str]
    education: list[str]


class JobData(BaseModel):
    title: str
    company: str
    description: str = ""  # Some layouts load slowly; title+company still used for match
    url: Optional[str] = None
    source: Optional[str] = None  # "linkedin" | "naukri"


class MatchResult(BaseModel):
    job: JobData
    score: float
    matched_skills: list[str]
    missing_skills: list[str]


class CoverLetterRequest(BaseModel):
    resume_skills: list[str]
    resume_experience: list[str]
    job: JobData


class CoverLetterResponse(BaseModel):
    cover_letter: str


class EmailRequest(BaseModel):
    recruiter_name: Optional[str] = None
    company: str
    job_title: str
    resume_skills: list[str]


class EmailResponse(BaseModel):
    subject: str
    body: str


class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict] = None
