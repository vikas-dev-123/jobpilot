/**
 * JobPilot AI — Sidebar Logic
 * Runs inside the iframe injected into job pages.
 */

const BACKEND_URL = "http://127.0.0.1:8000";
let currentJobData = null;
let currentResumeData = null;

function escapeHtml(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

// ─── STATE MANAGEMENT ──────────────────────────────────────────────────────────

function showState(id) {
  ["loading-state", "match-state", "output-state", "error-state"].forEach(
    (s) => document.getElementById(s).classList.add("hidden")
  );
  document.getElementById(id).classList.remove("hidden");
}

function showError(msg) {
  document.getElementById("error-message").textContent = msg;
  showState("error-state");
}

// ─── RECEIVE JOB MATCH DATA ────────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const t = event.data?.type;
  if (t === "JOBPILOT_LOADING") {
    showState("loading-state");
    return;
  }
  if (t === "JOBPILOT_ERROR") {
    showError(event.data.message || "Something went wrong.");
    return;
  }
  if (t === "MATCH_RESULT") {
    const data = event.data.data;
    if (!data) {
      showError("No match data received.");
      return;
    }
    currentJobData = data.job;
    currentResumeData = data;
    renderMatchResult(data);
  }
});

function renderMatchResult(data) {
  if (!data) {
    showError("No match data.");
    return;
  }
  const score = data.score || 0;
  document.getElementById("score-value").textContent = `${score}%`;

  const ring = document.querySelector(".score-ring");
  const color = score >= 70 ? "#22c55e" : score >= 40 ? "#f59e0b" : "#ef4444";
  if (ring) {
    ring.style.background = `conic-gradient(${color} ${score}%, #1e293b ${score}%)`;
  }
  document.getElementById("score-value").style.color = color;

  const matchedEl = document.getElementById("matched-skills");
  matchedEl.innerHTML =
    (data.matched_skills || [])
      .map((s) => `<span class="tag tag-matched">${escapeHtml(s)}</span>`)
      .join("") || "<span style='color:#64748b;font-size:12px'>None found</span>";

  const missingEl = document.getElementById("missing-skills");
  missingEl.innerHTML =
    (data.missing_skills || [])
      .slice(0, 8)
      .map((s) => `<span class="tag tag-missing">${escapeHtml(s)}</span>`)
      .join("") || "<span style='color:#64748b;font-size:12px'>Great match!</span>";

  showState("match-state");
}

// ─── COVER LETTER ──────────────────────────────────────────────────────────────

document.getElementById("btn-coverletter").addEventListener("click", async () => {
  if (!currentJobData) return showError("No job data available.");
  showState("loading-state");

  try {
    const resumeRes = await fetch(`${BACKEND_URL}/resume/current`);
    const resumeJson = await resumeRes.json();
    if (!resumeJson.success) throw new Error("No resume uploaded. Please upload via popup.");

    const res = await fetch(`${BACKEND_URL}/coverletter/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_skills: resumeJson.data.skills,
        resume_experience: resumeJson.data.experience,
        job: currentJobData,
      }),
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    document.getElementById("output-title").textContent = "Cover Letter";
    document.getElementById("output-text").value = json.data.cover_letter;
    showState("output-state");
  } catch (err) {
    showError(err.message);
  }
});

// ─── RECRUITER EMAIL ───────────────────────────────────────────────────────────

document.getElementById("btn-email").addEventListener("click", async () => {
  if (!currentJobData) return showError("No job data available.");
  showState("loading-state");

  try {
    const resumeRes = await fetch(`${BACKEND_URL}/resume/current`);
    const resumeJson = await resumeRes.json();
    if (!resumeJson.success) throw new Error("No resume uploaded. Please upload via popup.");

    const res = await fetch(`${BACKEND_URL}/email/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: currentJobData.company,
        job_title: currentJobData.title,
        resume_skills: resumeJson.data.skills,
      }),
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    document.getElementById("output-title").textContent = "Recruiter Email";
    document.getElementById("output-text").value =
      `Subject: ${json.data.subject}\n\n${json.data.body}`;
    showState("output-state");
  } catch (err) {
    showError(err.message);
  }
});

// ─── UTILITY BUTTONS ───────────────────────────────────────────────────────────

document.getElementById("btn-back").addEventListener("click", () => {
  showState("match-state");
});

document.getElementById("btn-copy").addEventListener("click", () => {
  const text = document.getElementById("output-text").value;
  navigator.clipboard
    .writeText(text)
    .then(() => {
      const btn = document.getElementById("btn-copy");
      btn.textContent = "✅ Copied!";
      setTimeout(() => (btn.textContent = "📋 Copy to Clipboard"), 2000);
    })
    .catch(() => {
      const btn = document.getElementById("btn-copy");
      const prev = btn.textContent;
      btn.textContent = "Select & copy manually";
      setTimeout(() => (btn.textContent = prev), 2500);
    });
});

document.getElementById("btn-close").addEventListener("click", () => {
  window.parent.postMessage({ type: "CLOSE_SIDEBAR" }, "*");
});

document.getElementById("btn-retry").addEventListener("click", () => {
  if (currentResumeData) renderMatchResult(currentResumeData);
  else showState("loading-state");
});
