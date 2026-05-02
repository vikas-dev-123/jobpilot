/**
 * JobPilot AI — Background service worker (Manifest V3)
 * Proxies /jobs/submit. Resume upload stays in popup (long Gemini parse kills SW message channel).
 *
 * Must be valid JavaScript only: use `async function`, never Python `async def`.
 */
const BACKEND_URL = "http://127.0.0.1:8000";

function parseBackendError(status, bodyText) {
  try {
    const j = JSON.parse(bodyText);
    const d = j.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d))
      return d.map((x) => x.msg || JSON.stringify(x)).join("; ");
    return JSON.stringify(d || j);
  } catch {
    return bodyText || `HTTP ${status}`;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SUBMIT_JOB") {
    submitJobToBackend(message.payload)
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((err) =>
        sendResponse({
          success: false,
          error: String((err && err.message) || err || "Unknown error"),
        })
      );
    return true;
  }

  if (message.type === "GET_MATCH_SCORE") {
    chrome.storage.local.get(["lastMatch"], (result) => {
      sendResponse({ data: result.lastMatch || null });
    });
    return true;
  }
});

async function submitJobToBackend(jobData) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);

  try {
    const response = await fetch(`${BACKEND_URL}/jobs/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jobData),
      signal: ctrl.signal,
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(parseBackendError(response.status, raw));
    }

    const result = JSON.parse(raw);
    if (result.data) {
      chrome.storage.local.set({ lastMatch: result.data });
    }
    return result.data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(
        "Job match timed out (40s). Backend slow or Hugging Face stuck — set EMBEDDING_PROVIDER=none in backend/.env for instant keyword match, then restart API."
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
