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
const applyQueuePanel = document.getElementById("apply-queue-panel");

let smtpEnabled = false;

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

async function refreshSmtpFlag() {
  try {
    const res = await fetch(`${BACKEND_URL}/email/smtp-status`);
    const json = await res.json();
    smtpEnabled = !!(json.data && json.data.smtp_enabled);
  } catch {
    smtpEnabled = false;
  }
}

function renderQueueRow(it) {
  const row = document.createElement("div");
  row.className = "aq-row";
  const job = it.job || {};

  const title = document.createElement("div");
  title.className = "aq-title";
  title.textContent = `${job.title || "—"} · ${job.company || "—"}`;
  row.appendChild(title);

  const meta = document.createElement("div");
  meta.className = "aq-meta";
  const score =
    it.match_score != null ? `Match ${Math.round(Number(it.match_score))}%` : "";
  meta.textContent = [score, it.status || "pending"].filter(Boolean).join(" · ");
  row.appendChild(meta);

  const actions = document.createElement("div");
  actions.className = "aq-actions";

  if (job.url) {
    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "aq-mini";
    openBtn.textContent = "Open job";
    openBtn.addEventListener("click", () => chrome.tabs.create({ url: job.url }));
    actions.appendChild(openBtn);
  }

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "aq-mini";
  doneBtn.textContent = "Mark applied";
  doneBtn.addEventListener("click", async () => {
    await fetch(`${BACKEND_URL}/apply-queue/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id, status: "applied" }),
    });
    await loadApplyQueuePanel();
  });
  actions.appendChild(doneBtn);

  const rm = document.createElement("button");
  rm.type = "button";
  rm.className = "aq-mini aq-danger";
  rm.textContent = "Remove";
  rm.addEventListener("click", async () => {
    await fetch(`${BACKEND_URL}/apply-queue/remove`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: it.id }),
    });
    await loadApplyQueuePanel();
  });
  actions.appendChild(rm);

  row.appendChild(actions);

  const emailRow = document.createElement("div");
  emailRow.className = "aq-email-row";
  const input = document.createElement("input");
  input.type = "email";
  input.className = "aq-email";
  input.placeholder = "recruiter@company.com";
  input.value = it.recruiter_email || (it.job && it.job.recruiter_email) || "";
  emailRow.appendChild(input);

  const draftBtn = document.createElement("button");
  draftBtn.type = "button";
  draftBtn.className = "aq-mini";
  draftBtn.textContent = "Draft email";
  draftBtn.addEventListener("click", async () => {
    const resumeRes = await fetch(`${BACKEND_URL}/resume/current`);
    const resumeJson = await resumeRes.json();
    if (!resumeRes.ok || !resumeJson.success || !resumeJson.data) {
      alert("Upload resume first.");
      return;
    }
    const genRes = await fetch(`${BACKEND_URL}/email/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company: job.company || "",
        job_title: job.title || "",
        resume_skills: resumeJson.data.skills || [],
      }),
    });
    const genJson = await genRes.json().catch(() => ({}));
    if (!genRes.ok || !genJson.success) {
      alert(
        typeof genJson.detail === "string"
          ? genJson.detail
          : genJson.message || "Draft failed"
      );
      return;
    }
    await fetch(`${BACKEND_URL}/apply-queue/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: it.id,
        email_subject: genJson.data.subject,
        email_body: genJson.data.body,
        recruiter_email: input.value.trim() || null,
      }),
    });
    await loadApplyQueuePanel();
  });
  emailRow.appendChild(draftBtn);

  if (smtpEnabled) {
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "aq-mini aq-send";
    sendBtn.textContent = "Send";
    sendBtn.addEventListener("click", async () => {
      const to = input.value.trim();
      if (!to || !to.includes("@")) {
        alert("Enter recruiter email.");
        return;
      }
      const listRes = await fetch(`${BACKEND_URL}/apply-queue/list`);
      const listJson = await listRes.json().catch(() => ({}));
      const fresh = (listJson.data && listJson.data.items || []).find(
        (x) => x.id === it.id
      );
      const subj = fresh && fresh.email_subject;
      const emailBody = fresh && fresh.email_body;
      if (!subj || !emailBody) {
        alert("Click Draft email first.");
        return;
      }
      const sendRes = await fetch(`${BACKEND_URL}/email/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject: subj,
          body: emailBody,
          queue_item_id: it.id,
        }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        alert(
          typeof sendJson.detail === "string" ? sendJson.detail : "Send failed"
        );
        return;
      }
      alert("Email sent.");
      await loadApplyQueuePanel();
    });
    emailRow.appendChild(sendBtn);
  }

  row.appendChild(emailRow);

  if (it.email_subject) {
    const pre = document.createElement("div");
    pre.className = "aq-draft-preview";
    const bodyPreview = it.email_body || "";
    pre.textContent = `${it.email_subject}\n---\n${bodyPreview.slice(0, 280)}${
      bodyPreview.length > 280 ? "…" : ""
    }`;
    row.appendChild(pre);
  }

  return row;
}

async function loadApplyQueuePanel() {
  if (!applyQueuePanel) return;
  applyQueuePanel.innerHTML =
    '<div class="discover-muted">Loading apply queue…</div>';
  await refreshSmtpFlag();
  try {
    const res = await fetch(`${BACKEND_URL}/apply-queue/list`);
    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      applyQueuePanel.innerHTML = `<div class="discover-muted">${escapeHtml(
        typeof json.detail === "string" ? json.detail : "Queue unavailable"
      )}</div>`;
      return;
    }

    const items = (json.data && json.data.items) || [];
    applyQueuePanel.textContent = "";

    const wrap = document.createElement("div");
    wrap.className = "apply-queue";

    const h = document.createElement("h3");
    h.textContent = `Apply queue (${items.length})`;
    wrap.appendChild(h);

    const hint = document.createElement("p");
    hint.className = "aq-disclaimer";
    hint.textContent =
      "Job sites are not auto-filled (account safety). Open each job, apply in the tab, then Mark applied. Paste recruiter email to draft/send.";
    wrap.appendChild(hint);

    const smtpNote = document.createElement("p");
    smtpNote.className = "aq-smtp";
    smtpNote.textContent = smtpEnabled
      ? "SMTP: on — Send uses your backend mail settings."
      : "SMTP: off — add SMTP_* to backend/.env to send from here; otherwise copy drafts manually.";
    wrap.appendChild(smtpNote);

    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "discover-muted";
      empty.textContent =
        'After Analyze on a job page, click "Add to apply queue" in the sidebar.';
      wrap.appendChild(empty);
    } else {
      for (const rowItem of items) {
        wrap.appendChild(renderQueueRow(rowItem));
      }
      const clr = document.createElement("button");
      clr.type = "button";
      clr.className = "link-btn aq-clear";
      clr.textContent = "Clear entire queue";
      clr.addEventListener("click", async () => {
        if (!confirm("Clear all queued jobs?")) return;
        await fetch(`${BACKEND_URL}/apply-queue/clear`, { method: "POST" });
        await loadApplyQueuePanel();
      });
      wrap.appendChild(clr);
    }

    applyQueuePanel.appendChild(wrap);
  } catch {
    applyQueuePanel.innerHTML =
      '<div class="discover-muted">Cannot load queue (backend?).</div>';
  }
}

async function init() {
  await checkExistingResume();
  await loadApplyQueuePanel();
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
      await loadApplyQueuePanel();
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
