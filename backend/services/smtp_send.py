"""
Optional SMTP send for recruiter outreach. Disabled unless SMTP_ENABLED=true in .env.
"""
from __future__ import annotations

import os
import smtplib
import time
from collections import deque
from email.message import EmailMessage

_send_times: deque[float] = deque(maxlen=256)


def smtp_configured() -> bool:
    flag = (os.getenv("SMTP_ENABLED") or "").strip().lower() in ("1", "true", "yes", "on")
    host = (os.getenv("SMTP_HOST") or "").strip()
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    from_addr = (os.getenv("SMTP_FROM") or user).strip()
    return flag and bool(host and user and password and from_addr)


def _rate_limit_window() -> tuple[int, int]:
    limit = int(os.getenv("SMTP_MAX_SENDS_PER_HOUR") or "20")
    return max(1, min(limit, 100)), 3600


def check_send_rate_limit() -> None:
    max_n, window = _rate_limit_window()
    now = time.time()
    cutoff = now - window
    while _send_times and _send_times[0] < cutoff:
        _send_times.popleft()
    if len(_send_times) >= max_n:
        raise ValueError(
            f"Email rate limit: max {max_n} sends per hour. Wait or increase SMTP_MAX_SENDS_PER_HOUR."
        )


def record_send() -> None:
    _send_times.append(time.time())


def send_plain_email(*, to_addr: str, subject: str, body: str) -> None:
    if not smtp_configured():
        raise ValueError("SMTP not configured. Set SMTP_ENABLED=true and SMTP_* in backend/.env")

    host = (os.getenv("SMTP_HOST") or "").strip()
    port = int(os.getenv("SMTP_PORT") or "587")
    user = (os.getenv("SMTP_USER") or "").strip()
    password = (os.getenv("SMTP_PASSWORD") or "").strip()
    from_addr = (os.getenv("SMTP_FROM") or user).strip()

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=30) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(msg)
