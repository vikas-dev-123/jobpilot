/**
 * JobPilot AI — Content script
 * LinkedIn / Naukri: floating **Analyze** button — click to match your resume skills with the open job JD.
 */

(function () {
  "use strict";

  const ANALYZE_BTN_ID = "jobpilot-analyze-btn";
  const MIN_DESCRIPTION_LEN = 40;
  let lastFingerprint = "";
  let extensionDeadNotified = false;
  let analyzeBusy = false;

  function extensionAlive() {
    try {
      const u = chrome.runtime.getURL("sidebar/sidebar.html");
      return typeof u === "string" && u.startsWith("chrome-extension://");
    } catch {
      return false;
    }
  }

  function stopContentScript(reason) {
    if (extensionDeadNotified) return;
    extensionDeadNotified = true;
    try {
      const b = document.getElementById(ANALYZE_BTN_ID);
      if (b) b.remove();
    } catch (_) {}
    try {
      window.removeEventListener("popstate", onPopHash);
      window.removeEventListener("hashchange", onPopHash);
    } catch (_) {}
    console.warn("[JobPilot]", reason || "Extension was reloaded — refresh this tab (F5).");
    try {
      const iframe = document.getElementById("jobpilot-sidebar");
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: "JOBPILOT_ERROR",
            message:
              (reason || "Extension was reloaded.") + " Refresh this page (F5), then try again.",
          },
          "*"
        );
      }
    } catch (_) {}
  }

  function isInvalidatedMsg(s) {
    return /Extension context invalidated|context invalid|invalidated/i.test(String(s || ""));
  }

  function eventErrorText(ev) {
    if (!ev) return "";
    const m = ev.message || (ev.error && ev.error.message) || ev.error;
    return String(m || "");
  }

  window.addEventListener(
    "error",
    function (ev) {
      if (isInvalidatedMsg(eventErrorText(ev))) {
        if (typeof ev.preventDefault === "function") ev.preventDefault();
        stopContentScript(eventErrorText(ev));
      }
    },
    true
  );
  window.addEventListener("unhandledrejection", function (ev) {
    const r = ev && ev.reason;
    const msg = String((r && r.message) || r || "");
    if (isInvalidatedMsg(msg)) {
      if (typeof ev.preventDefault === "function") ev.preventDefault();
      stopContentScript(msg);
    }
  });

  const _prevOnError = window.onerror;
  window.onerror = function (message, src, lineno, colno, error) {
    const fromErr = error && (error.message || String(error));
    const msg = String(
      message != null && message !== "" ? message : fromErr || ""
    );
    if (isInvalidatedMsg(msg)) {
      stopContentScript(msg);
      return true;
    }
    if (typeof _prevOnError === "function") {
      try {
        return _prevOnError.call(window, message, src, lineno, colno, error) === true;
      } catch (_) {
        return false;
      }
    }
    return false;
  };

  function text(el) {
    return (el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function pickFirst(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && text(el)) return el;
    }
    return null;
  }

  /** Emails visible in JD text or mailto: links (many LinkedIn jobs have none). */
  const EMAIL_RX =
    /\b[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}\b/g;

  function decodeMailto(href) {
    if (!href || typeof href !== "string") return "";
    try {
      return decodeURIComponent(href.replace(/^mailto:/i, "").split("?")[0].trim());
    } catch {
      return href.replace(/^mailto:/i, "").split("?")[0].trim();
    }
  }

  function isJunkEmail(e) {
    const x = String(e || "").toLowerCase().trim();
    if (!x.includes("@")) return true;
    const parts = x.split("@");
    if (parts.length !== 2) return true;
    const local = parts[0];
    const domain = parts[1];
    if (!local || !domain) return true;
    if (
      /noreply|no-reply|do-not-reply|donotreply|mailer-daemon|newsletter|notification|digest|promo|marketing|privacy|legal|bounce|dmarc/.test(
        local
      )
    )
      return true;
    if (domain === "linkedin.com" || domain.endsWith(".linkedin.com")) return true;
    if (domain === "facebookmail.com" || domain.endsWith(".fb.com")) return true;
    if (/^example\.(com|org|net)$/i.test(domain) || domain === "test.com") return true;
    if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(local)) return true;
    return false;
  }

  function uniqueEmailsFromText(t) {
    if (!t) return [];
    const found = String(t).match(EMAIL_RX) || [];
    return [...new Set(found.map((s) => s.trim()))];
  }

  function mailtoFromRoot(root) {
    if (!root || !root.querySelectorAll) return [];
    const out = [];
    try {
      root.querySelectorAll('a[href*="mailto:"]').forEach((a) => {
        const em = decodeMailto(a.getAttribute("href") || "");
        if (em) out.push(em);
      });
    } catch (_) {}
    return out;
  }

  function pickRecruiterEmail(description, jobRoot) {
    const ranked = [];

    function add(email, rank) {
      if (!email || isJunkEmail(email)) return;
      const k = email.toLowerCase();
      if (ranked.some((x) => x.k === k)) return;
      ranked.push({ e: email.trim(), k, rank });
    }

    for (const e of uniqueEmailsFromText(description)) add(e, 1);
    if (jobRoot) {
      for (const e of mailtoFromRoot(jobRoot)) add(e, 2);
      for (const e of uniqueEmailsFromText(text(jobRoot))) add(e, 3);
    }

    ranked.sort((a, b) => a.rank - b.rank);
    return ranked.length ? ranked[0].e : "";
  }

  function scrapeLinkedIn() {
    const title =
      text(
        pickFirst([
          ".job-details-jobs-unified-top-card__job-title",
          ".jobs-unified-top-card__job-title",
          "h1[data-test-job-title]",
          ".job-details-hero__title",
          "h1.job-title",
          "h1.t-24",
        ])
      ) || "";

    const company =
      text(
        pickFirst([
          ".job-details-jobs-unified-top-card__company-name a",
          ".job-details-jobs-unified-top-card__company-name",
          "a.job-details-jobs-unified-top-card__primary-description-without-tagline",
          ".jobs-unified-top-card__subtitle-primary-grouping",
          ".topcard__org-name-link",
        ])
      ) || "";

    const descEl = pickFirst([
      ".jobs-description-content__text",
      ".jobs-description__content",
      ".jobs-box__html-content.jobs-description-content__text",
      "#job-details",
      "article.jobs-description",
    ]);
    let description = text(descEl);

    if (description.length < MIN_DESCRIPTION_LEN) {
      const aside = document.querySelector(".jobs-details__main-content");
      if (aside) description = text(aside) || description;
    }

    const jobRoot =
      document.querySelector(".jobs-details__main-content") ||
      document.querySelector(".jobs-search__job-details--container") ||
      (descEl && descEl.closest && descEl.closest("article")) ||
      document.querySelector(".scaffold-layout__list-detail-inner") ||
      document.body;

    const recruiter_email = pickRecruiterEmail(description, jobRoot) || null;

    return {
      title,
      company,
      description,
      source: "linkedin",
      url: window.location.href,
      recruiter_email,
    };
  }

  function scrapeNaukri() {
    const title =
      text(
        pickFirst([
          ".jd-header-title .title",
          ".jd-header-title",
          ".job-title-container h1",
          "h1.jobTitle",
          "header h1",
        ])
      ) || "";

    const company =
      text(
        pickFirst([
          ".jd-header-comp-name a",
          ".jd-header-comp-name",
          ".company-name a",
          ".comp-name",
        ])
      ) || "";

    const description =
      text(
        pickFirst([
          ".job-desc",
          ".dang-inner-html",
          ".jd-desc",
          "#jobDescriptionHtml",
          ".styles_job-description__",
        ])
      ) || "";

    const descBlock = pickFirst([
      ".job-desc",
      ".dang-inner-html",
      ".jd-desc",
      "#jobDescriptionHtml",
      ".styles_job-description__",
    ]);

    const jobRoot =
      document.querySelector(".jdWrapper") ||
      document.querySelector(".jd-main") ||
      document.querySelector(".job-right-section") ||
      document.querySelector(".srp-main") ||
      (descBlock && descBlock.closest && descBlock.closest("main")) ||
      document.body;

    const recruiter_email = pickRecruiterEmail(description, jobRoot) || null;

    return {
      title,
      company,
      description,
      source: "naukri",
      url: window.location.href,
      recruiter_email,
    };
  }

  function detectAndScrape() {
    const host = window.location.hostname;
    if (host.includes("linkedin.com")) return scrapeLinkedIn();
    if (host.includes("naukri.com")) return scrapeNaukri();
    return null;
  }

  function fingerprint(job) {
    if (!job) return "";
    return [job.url.split("?")[0], job.title, job.company].join("|");
  }

  function injectSidebar() {
    try {
      let iframe = document.getElementById("jobpilot-sidebar");
      if (iframe) return iframe;
      let sidebarUrl;
      try {
        sidebarUrl = chrome.runtime.getURL("sidebar/sidebar.html");
      } catch (e) {
        if (isInvalidatedMsg(e && e.message)) stopContentScript(String(e.message));
        return null;
      }
      iframe = document.createElement("iframe");
      iframe.id = "jobpilot-sidebar";
      try {
        iframe.src = sidebarUrl;
      } catch (e) {
        if (isInvalidatedMsg(e && e.message)) stopContentScript(String(e.message));
        return null;
      }
      iframe.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 360px;
      height: 100vh;
      border: none;
      z-index: 2147483647;
      box-shadow: -4px 0 20px rgba(0,0,0,0.2);
      transition: transform 0.3s ease;
    `;
      document.body.appendChild(iframe);
      return iframe;
    } catch (e) {
      if (isInvalidatedMsg(e && e.message)) stopContentScript(String(e.message));
      return null;
    }
  }

  function postToSidebar(payload) {
    try {
      const iframe = document.getElementById("jobpilot-sidebar");
      if (!iframe || !iframe.contentWindow) return;
      const send = () => {
        try {
          iframe.contentWindow.postMessage(payload, "*");
        } catch (_) {}
      };
      if (iframe.contentDocument?.readyState === "complete") send();
      else iframe.addEventListener("load", send, { once: true });
    } catch (_) {}
  }

  function notifyError(msg) {
    const iframe = injectSidebar();
    if (!iframe) {
      stopContentScript("JobPilot: extension context invalid.");
      return;
    }
    postToSidebar({ type: "JOBPILOT_ERROR", message: msg });
  }

  function resetAnalyzeButton() {
    analyzeBusy = false;
    const btn = document.getElementById(ANALYZE_BTN_ID);
    if (btn) {
      btn.disabled = false;
      btn.style.opacity = "1";
      btn.textContent = "Analyze job";
    }
  }

  function submitJobPayload(job) {
    postToSidebar({ type: "JOBPILOT_LOADING" });

    try {
      chrome.runtime.sendMessage({ type: "SUBMIT_JOB", payload: job }, (response) => {
        resetAnalyzeButton();
        try {
          let le;
          try {
            le = chrome.runtime.lastError;
          } catch (e) {
            if (isInvalidatedMsg(e && e.message)) stopContentScript(String(e.message));
            return;
          }
          if (le) {
            const m = le.message || "";
            if (isInvalidatedMsg(m)) {
              stopContentScript(m);
              return;
            }
            notifyError(m);
            return;
          }
          if (response && response.success) {
            lastFingerprint = fingerprint(job);
            postToSidebar({ type: "MATCH_RESULT", data: response.data });
          } else {
            notifyError(
              (response && response.error) ||
                "Could not match job (check resume upload & backend)."
            );
          }
        } catch (inner) {
          if (isInvalidatedMsg(inner && inner.message)) {
            stopContentScript(String(inner.message));
          } else {
            notifyError(String(inner && inner.message));
          }
        }
      });
    } catch (e) {
      resetAnalyzeButton();
      if (isInvalidatedMsg(e && e.message)) {
        stopContentScript(String(e.message));
      } else {
        notifyError(String(e && e.message));
      }
    }
  }

  function onAnalyzeClick() {
    if (analyzeBusy) return;
    if (!extensionAlive()) {
      stopContentScript("JobPilot: extension was reloaded or updated.");
      return;
    }

    const job = detectAndScrape();
    if (!job || !String(job.title || "").trim()) {
      const iframe = injectSidebar();
      if (!iframe) {
        stopContentScript("JobPilot: extension context invalid.");
        return;
      }
      postToSidebar({
        type: "JOBPILOT_ERROR",
        message:
          "पहले कोई नौकरी (job posting) खोलें — title नहीं मिला। / Open a job detail first; title not found.",
      });
      return;
    }

    analyzeBusy = true;
    const btn = document.getElementById(ANALYZE_BTN_ID);
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = "0.75";
      btn.textContent = "Analyzing…";
    }

    const iframe = injectSidebar();
    if (!iframe) {
      resetAnalyzeButton();
      stopContentScript("JobPilot: extension context invalid.");
      return;
    }

    submitJobPayload(job);
  }

  function ensureAnalyzeButton() {
    if (extensionDeadNotified) return;
    if (!extensionAlive()) {
      stopContentScript("JobPilot: extension was reloaded or updated.");
      return;
    }
    if (document.getElementById(ANALYZE_BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = ANALYZE_BTN_ID;
    btn.type = "button";
    btn.textContent = "Analyze job";
    btn.title =
      "JobPilot: अपनी resume skills और इस JD का मिलान | Match your skills vs this job description";
    btn.setAttribute("aria-label", "JobPilot analyze job");
    btn.style.cssText = [
      "position:fixed",
      "bottom:24px",
      "left:24px",
      "z-index:2147483646",
      "padding:12px 20px",
      "font-size:14px",
      "font-weight:600",
      'font-family:system-ui,-apple-system,"Segoe UI",sans-serif',
      "color:#fff",
      "background:linear-gradient(135deg,#0369a1,#0284c7)",
      "border:none",
      "border-radius:999px",
      "box-shadow:0 4px 20px rgba(2,132,199,0.45)",
      "cursor:pointer",
    ].join(";");
    btn.addEventListener("click", onAnalyzeClick);

    const root = document.body || document.documentElement;
    if (root) root.appendChild(btn);
  }

  function onPopHash() {
    lastFingerprint = "";
    ensureAnalyzeButton();
  }

  window.addEventListener("message", (e) => {
    try {
      if (e && e.data && e.data.type === "CLOSE_SIDEBAR") {
        const el = document.getElementById("jobpilot-sidebar");
        if (el) el.remove();
      }
    } catch (_) {}
  });

  function boot() {
    ensureAnalyzeButton();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener("popstate", onPopHash);
  window.addEventListener("hashchange", onPopHash);
})();
