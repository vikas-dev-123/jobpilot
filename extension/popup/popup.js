/**
 * JobPilot AI — Popup: resume upload + discover links from resume
 */

const BACKEND_URL = "http://127.0.0.1:8000";
let selectedFile = null;

const uploadArea = document.getElementById("upload-area");
const fileInput = document.getElementById("file-input");
const btnUpload = document.getElementById("btn-upload");
const statusEl = document.getElementById("status");
const resumeStatusEl = document.getElementById("resume-status");
const discoverPanel = document.getElementById("discover-panel");

function escapeHtml(s) {
  if (s == null) return "";
  const d = document.createElement("div");
  d.textContent = String(s);
  return d.innerHTML;
}

function renderResumeBlock(data) {
  const skills = data.skills || [];
  const experience = data.experience || [];
  const education = data.education || [];

  const tagsHtml = skills
    .map((s) => `<span class="tag">${escapeHtml(s)}</span>`)
    .join("");

  const expHtml = experience
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("");
  const eduHtml = education
    .map((e) => `<li>${escapeHtml(e)}</li>`)
    .join("");

  return `
    <div class="resume-loaded">
      <strong>✅ Resume loaded</strong>
      <span class="skill-count">${skills.length} skills · ${experience.length} roles · ${education.length} education</span>
      <div class="detail-section">
        <h3>Skills</h3>
        <div class="tags">${tagsHtml || '<span class="skill-count">—</span>'}</div>
      </div>
      <div class="detail-section">
        <h3>Roles (experience)</h3>
        <ul class="exp-list">${expHtml || "<li>—</li>"}</ul>
      </div>
      ${
        education.length
          ? `<div class="detail-section">
        <h3>Education</h3>
        <ul class="edu-list">${eduHtml}</ul>
      </div>`
          : ""
      }
    </div>
  `;
}

function renderDiscover(data) {
  discoverPanel.textContent = "";
  const wrap = document.createElement("div");
  wrap.className = "discover";

  const h = document.createElement("h3");
  h.textContent = "Find jobs (from your resume)";
  wrap.appendChild(h);

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent = data.hint || "";
  wrap.appendChild(hint);

  const pill = document.createElement("div");
  pill.className = "query-pill";
  const strong = document.createElement("strong");
  strong.textContent = "Main search: ";
  pill.appendChild(strong);
  pill.appendChild(document.createTextNode(data.primary_query || ""));
  wrap.appendChild(pill);

  if (Array.isArray(data.search_variants) && data.search_variants.length > 1) {
    const v = document.createElement("div");
    v.className = "query-pill";
    v.style.marginTop = "6px";
    const strong = document.createElement("strong");
    strong.textContent = "Alt searches: ";
    v.appendChild(strong);
    v.appendChild(
      document.createTextNode(data.search_variants.slice(1).join(" · "))
    );
    wrap.appendChild(v);
  }

  for (const p of data.portals || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link-btn";
    b.textContent = p.name || p.id || "Open";
    const url = p.url;
    b.addEventListener("click", () => {
      if (url) chrome.tabs.create({ url });
    });
    wrap.appendChild(b);
  }

  discoverPanel.appendChild(wrap);
}

async function loadDiscoverPanel() {
  discoverPanel.innerHTML =
    '<div class="discover-muted">Loading job search links…</div>';
  try {
    const res = await fetch(`${BACKEND_URL}/discover/search-plan`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg =
        typeof json.detail === "string"
          ? json.detail
          : "Upload resume first (or start backend).";
      discoverPanel.innerHTML = `<div class="discover-muted">${escapeHtml(msg)}</div>`;
      return;
    }

    if (!json.success || !json.data) {
      discoverPanel.innerHTML =
        '<div class="discover-muted">No discovery data.</div>';
      return;
    }

    renderDiscover(json.data);
  } catch {
    discoverPanel.innerHTML =
      '<div class="discover-muted">Cannot reach backend (port 8000?).</div>';
  }
}

async function checkExistingResume() {
  try {
    const res = await fetch(`${BACKEND_URL}/resume/current`);
    const json = await res.json();
    if (json.success && json.data && resumeStatusEl) {
      resumeStatusEl.innerHTML = renderResumeBlock(json.data);
    }
  } catch {
    // ignore
  }
}

async function init() {
  await checkExistingResume();
  await loadDiscoverPanel();
}

init();

uploadArea.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  selectedFile = e.target.files[0];
  if (selectedFile) {
    uploadArea.querySelector("p").textContent = `📄 ${selectedFile.name}`;
    btnUpload.disabled = false;
  }
});

btnUpload.addEventListener("click", async () => {
  if (!selectedFile) return;

  btnUpload.disabled = true;
  setStatus("Uploading and parsing resume...", "loading");

  try {
    const formData = new FormData();
    formData.append("file", selectedFile);

    const res = await fetch(`${BACKEND_URL}/resume/upload`, {
      method: "POST",
      body: formData,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const detail =
        typeof json.detail === "string"
          ? json.detail
          : Array.isArray(json.detail)
            ? json.detail.map((x) => x.msg || "").join(" ")
            : json.message || `HTTP ${res.status}`;
      setStatus(`❌ ${detail}`, "error");
      return;
    }

    if (json.success && json.data && resumeStatusEl) {
      resumeStatusEl.innerHTML = renderResumeBlock(json.data);
      const { skills = [], experience = [] } = json.data;
      setStatus(
        `✅ Resume parsed! ${skills.length} skills, ${experience.length} roles — see above.`,
        "success"
      );
      await loadDiscoverPanel();
    } else {
      setStatus(`❌ ${json.message || "Upload failed."}`, "error");
    }
  } catch (err) {
    setStatus(
      `❌ ${err.message || "Cannot reach backend. Use http://127.0.0.1:8000 and start uvicorn."}`,
      "error"
    );
  } finally {
    btnUpload.disabled = false;
  }
});

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = `status-${type}`;
}
