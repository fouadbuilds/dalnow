const output = document.getElementById("debugOutput");
const summary = document.getElementById("lastLiveRead");
const copyButton = document.getElementById("copyDebugBtn");
const copyStatus = document.getElementById("copyStatus");

const ENDPOINTS = new Set([
  "/d2l/api/versions/",
  "/d2l/api/lp/{v}/users/whoami",
  "/d2l/api/lp/{v}/enrollments/myenrollments/",
  "/d2l/api/le/{v}/{orgUnitId}/dropbox/folders/",
  "/d2l/api/le/{v}/{orgUnitId}/quizzes/",
  "/d2l/api/le/{v}/{orgUnitId}/discussions/",
  "/d2l/api/le/{v}/calendar/events/myEvents/",
  "/d2l/api/le/{v}/{orgUnitId}/content/toc",
]);
const OUTCOMES = new Set(["success", "partial", "not-signed-in", "network-error", "api-error"]);

function safeNumber(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function safeTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function summaryFor(outcome, counts) {
  if (outcome === "success" && counts) {
    return `Read ${counts.courses} courses and ${counts.deadlines} deadlines.`;
  }
  if (outcome === "partial" && counts) {
    return `Read ${counts.courses} courses and ${counts.deadlines} deadlines. $Some course tools could not be read.`;
  }
  if (outcome === "not-signed-in") return "Brightspace was not signed in.";
  return "DALnow could not complete the last read.";
}

function safeReport(value) {
  const report = value && typeof value === "object" ? value : {};
  const requests = Array.isArray(report.requests) ? report.requests.slice(0, 50) : [];
  return {
    kind: "dalnow-live-debug",
    version: typeof report.version === "string" && report.version.length <= 30 ? report.version : chrome.runtime.getManifest().version,
    base: "https://dal.brightspace.com",
    run: "refresh",
    outcome: OUTCOMES.has(report.outcome) ? report.outcome : "api-error",
    startedAt: safeTimestamp(report.startedAt),
    finishedAt: safeTimestamp(report.finishedAt),
    counts: report.counts && typeof report.counts === "object" && safeNumber(report.counts.courses) !== null && safeNumber(report.counts.deadlines) !== null ? { courses: safeNumber(report.counts.courses), deadlines: safeNumber(report.counts.deadlines) } : null,
    failedRequests: safeNumber(report.failedRequests) ?? 0,
    requests: requests.map((request) => ({ endpoint: ENDPOINTS.has(request?.endpoint) ? request.endpoint : "unknown", status: safeNumber(request?.status), ms: safeNumber(request?.ms), via: request?.via === "worker" ? "worker" : "worker" })),
    lastLiveRead: { at: safeTimestamp(report.lastLiveRead?.at), message: "" },
  };
}

let reportText = "";
async function load() {
  const { liveDebug } = await chrome.storage.local.get("liveDebug");
  const report = safeReport(liveDebug);
  report.lastLiveRead.message = summaryFor(report.outcome, report.counts);
  reportText = JSON.stringify(report, null, 2);
  output.textContent = reportText;
  summary.textContent = report.lastLiveRead.at ? `Last live read: ${new Date(report.lastLiveRead.at).toLocaleString()}. ${report.lastLiveRead.message}` : report.lastLiveRead.message;
}

copyButton.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(reportText); copyStatus.textContent = "Debug info copied."; }
  catch { copyStatus.textContent = "Couldn’t copy automatically. Select the report above and copy it manually."; }
});

load();
