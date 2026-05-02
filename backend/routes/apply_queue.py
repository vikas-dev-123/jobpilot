"""
Persisted apply queue: collect jobs from the extension, open URLs one-by-one from the popup.
"""
from __future__ import annotations

import json
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.models.schemas import APIResponse, JobData

router = APIRouter(prefix="/apply-queue", tags=["Apply queue"])

_LOCK = threading.Lock()
_QUEUE_PATH = Path(__file__).resolve().parent.parent / "storage" / "apply_queue.json"


def _load() -> dict:
    if not _QUEUE_PATH.is_file():
        return {"items": []}
    with open(_QUEUE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict) -> None:
    _QUEUE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(_QUEUE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


class AddToQueueBody(BaseModel):
    job: JobData
    match_score: float | None = None


class RemoveBody(BaseModel):
    id: str = Field(..., description="Queue item id")


class UpdateEmailBody(BaseModel):
    id: str
    recruiter_email: str | None = None
    email_subject: str | None = None
    email_body: str | None = None
    status: str | None = None  # pending | applied | emailed


@router.post("/add", response_model=APIResponse)
async def add_to_queue(body: AddToQueueBody):
    """Idempotent by job URL: same URL replaces score if re-added."""
    job_dump = body.job.model_dump()
    url = (job_dump.get("url") or "").strip()

    with _LOCK:
        data = _load()
        if url:
            for it in data["items"]:
                j = it.get("job") or {}
                if (j.get("url") or "").strip() == url:
                    it["match_score"] = body.match_score
                    it["job"] = job_dump
                    em = job_dump.get("recruiter_email")
                    if em:
                        it["recruiter_email"] = em
                    _save(data)
                    return APIResponse(
                        success=True,
                        message="Job already in queue — updated.",
                        data={"item": it},
                    )

        item = {
            "id": str(uuid.uuid4()),
            "added_at": datetime.now(timezone.utc).isoformat(),
            "status": "pending",
            "job": job_dump,
            "match_score": body.match_score,
            "recruiter_email": job_dump.get("recruiter_email"),
            "email_subject": None,
            "email_body": None,
        }
        data["items"].append(item)
        _save(data)

    return APIResponse(success=True, message="Added to apply queue.", data={"item": item})


@router.get("/list", response_model=APIResponse)
async def list_queue():
    with _LOCK:
        data = _load()
    items = list(data.get("items") or [])
    items.sort(key=lambda x: x.get("added_at") or "", reverse=True)
    return APIResponse(
        success=True,
        message=f"{len(items)} item(s) in queue.",
        data={"items": items},
    )


@router.post("/remove", response_model=APIResponse)
async def remove_item(body: RemoveBody):
    with _LOCK:
        data = _load()
        before = len(data["items"])
        data["items"] = [it for it in data["items"] if it.get("id") != body.id]
        if len(data["items"]) == before:
            raise HTTPException(status_code=404, detail="Queue item not found.")
        _save(data)
    return APIResponse(success=True, message="Removed from queue.", data={})


@router.post("/clear", response_model=APIResponse)
async def clear_queue():
    with _LOCK:
        _save({"items": []})
    return APIResponse(success=True, message="Queue cleared.", data={})


def mark_item_emailed(item_id: str, *, to_addr: str, subject: str, body: str) -> bool:
    with _LOCK:
        data = _load()
        found = False
        for it in data.get("items", []):
            if it.get("id") == item_id:
                it["status"] = "emailed"
                it["recruiter_email"] = to_addr
                it["email_subject"] = subject
                it["email_body"] = body
                found = True
                break
        if found:
            _save(data)
        return found


@router.post("/update", response_model=APIResponse)
async def update_item(body: UpdateEmailBody):
    with _LOCK:
        data = _load()
        found = None
        for it in data["items"]:
            if it.get("id") == body.id:
                found = it
                break
        if not found:
            raise HTTPException(status_code=404, detail="Queue item not found.")
        if body.recruiter_email is not None:
            found["recruiter_email"] = body.recruiter_email.strip() or None
        if body.email_subject is not None:
            found["email_subject"] = body.email_subject
        if body.email_body is not None:
            found["email_body"] = body.email_body
        if body.status is not None:
            found["status"] = body.status
        _save(data)
    return APIResponse(success=True, message="Updated.", data={"item": found})

