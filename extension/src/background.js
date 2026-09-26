// DalNow background service worker
//
// Everything here does GET-only calls against dal.brightspace.com's Valence
// API, riding the session cookie you already have from being logged into
// Learn in this browser.
// involved anywhere. Confirmed live against the real tenant:
//   - lp/1.63/users/whoami                -> identity check (used only to
//                                             confirm we're logged in)
//   - lp/1.63/enrollments/myenrollments/  -> list of your courses + org unit ids
//   - le/1.99/{orgUnitId}/dropbox/folders/     -> assignments, DueDate field
//   - le/1.99/{orgUnitId}/quizzes/              -> quizzes
//   - le/1.99/{orgUnitId}/discussions/topics/   -> discussions
//
// API versions are NOT hardcoded blindly — we ask /d2l/api/versions/ first
// and use whatever the tenant actually reports, so this doesn't quietly
// break the next time Dal upgrades Brightspace.

const BASE = "https://dal.brightspace.com";
const ALARM_NAME = "dalnow-refresh";
const REFRESH_MINUTES = 30;

// ---- version discovery -----------------------------------------------

let cachedVersions = null;

async function getApiVersions() {
  if (cachedVersions) return cachedVersions;
  const res = await fetch(`${BASE}/d2l/api/versions/`, { credentials: "include" });
  if (!res.ok) throw new Error(`versions check failed: ${res.status}`);
  const list = await res.json();
  const find = (code) => {
    const entry = list.find((p) => p.ProductCode === code);
    if (!entry) throw new Error(`no version info for product "${code}"`);
    return entry.LatestVersion;
  };
  cachedVersions = { lp: find("lp"), le: find("le") };
  return cachedVersions;
}

// ---- low-level fetch helper --------------------------------------------

async function apiGet(path) {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (res.status === 401 || res.status === 403) {
    throw new Error("NOT_LOGGED_IN");
  }
  if (!res.ok) {
    throw new Error(`API error ${res.status} on ${path}`);
  }
  return res.json();
}

// ---- course discovery ---------------------------------------------------

async function getActiveCourses() {
  const { lp } = await getApiVersions();
  // myenrollments paginates; for a first pass we take one page (200 is the
  // default page size for most tenants) since a student's active course
  // count is always far below that.
  const data = await apiGet(`/d2l/api/lp/${lp}/enrollments/myenrollments/`);
  const items = data.Items || data; // shape varies slightly by version
  return items
    .filter((e) => e.OrgUnit && e.OrgUnit.Type && e.OrgUnit.Type.Code === "Course Offering")
    .map((e) => ({
      orgUnitId: e.OrgUnit.Id,
      name: e.OrgUnit.Name,
      code: e.OrgUnit.Code,
    }));
}

// ---- per-course deadline pulls ------------------------------------------

async function getDropboxDeadlines(orgUnitId, le) {
  let folders;
  try {
    folders = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/dropbox/folders/`);
  } catch (e) {
    return []; // course may have dropbox disabled entirely
  }
  if (!Array.isArray(folders)) return [];
  return folders
    .filter((f) => f && f.DueDate)
    .map((f) => ({
      id: `dropbox-${f.Id}`,
      title: f.Name ?? "Untitled assignment",
      type: "assignment",
      dueDate: f.DueDate,
      orgUnitId,
      // Confirmed deep-link pattern (verified live against the tenant).
      // All IDs needed are already in this list response — no extra
      // per-item API calls required.
      url: `${BASE}/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=${orgUnitId}&db=${f.Id}`,
    }));
}

async function getQuizDeadlines(orgUnitId, le) {
  let quizzes;
  try {
    const data = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/quizzes/`);
    quizzes = data.Objects || data;
  } catch (e) {
    return []; // course may have quizzes disabled entirely
  }
  // Quiz response shape is unverified (assumed similar to dropbox with
  // Id/QuizId, Name, DueDate). Tolerate missing/renamed fields and never
  // let a parsing surprise here crash the whole refresh.
  if (!Array.isArray(quizzes)) return [];
  try {
    return quizzes
      .filter((q) => q && (q.DueDate || q.DueDateTime))
      .map((q) => {
        const quizId = q.QuizId ?? q.Id;
        const name = q.Name ?? q.Title ?? "Untitled quiz";
        const due = q.DueDate ?? q.DueDateTime;
        return {
          id: `quiz-${quizId}`,
          title: name,
          type: "quiz",
          dueDate: due,
          orgUnitId,
          // Confirmed deep-link pattern; quizId comes from the same list
          // response, no extra calls needed.
          url: `${BASE}/d2l/lms/quizzing/user/quiz_summary.d2l?qi=${quizId}&ou=${orgUnitId}`,
        };
      })
      .filter((item) => item.dueDate && String(item.id) !== "quiz-undefined");
  } catch (e) {
    return [];
  }
}

async function getDiscussionDeadlines(orgUnitId, le) {
  let topics;
  try {
    const forums = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/discussions/`);
    // Discussion response shape + per-item deep-link pattern are UNVERIFIED
    // (current courses don't use discussions, so never confirmed live).
    // Keep the fetch — future courses might use it — but fall back to the
    // course homepage link for every discussion-type item.
    const list = Array.isArray(forums) ? forums : forums.Objects || [];
    topics = list.flatMap((f) => (f && f.Topics) || []);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(topics)) return [];
  try {
    return topics
      .filter((t) => t && (t.DueDate || t.DueDateTime))
      .map((t) => {
        const topicId = t.TopicId ?? t.Id;
        return {
          id: `discussion-${topicId}`,
          title: t.Name ?? t.Title ?? "Untitled discussion",
          type: "discussion",
          dueDate: t.DueDate ?? t.DueDateTime,
          orgUnitId,
          // Unverified per-item pattern → course homepage fallback.
          url: `${BASE}/d2l/home/${orgUnitId}`,
        };
      })
      .filter((item) => item.dueDate);
  } catch (e) {
    return [];
  }
}

// ---- full refresh ---------------------------------------------------------

async function refreshAll() {
  const { le } = await getApiVersions();
  const courses = await getActiveCourses();

  const perCourse = await Promise.all(
    courses.map(async (course) => {
      const [assignments, quizzes, discussions] = await Promise.all([
        getDropboxDeadlines(course.orgUnitId, le),
        getQuizDeadlines(course.orgUnitId, le),
        getDiscussionDeadlines(course.orgUnitId, le),
      ]);
      const items = [...assignments, ...quizzes, ...discussions].map((item) => ({
        ...item,
        courseName: course.name,
        courseCode: course.code,
      }));
      return items;
    })
  );

  const allDeadlines = perCourse
    .flat()
    .filter((item) => {
      // Past-due rule — DELIBERATE SIMPLIFICATION, not a bug (see plan.md).
      // If DueDate < now the item is excluded entirely, before storage or
      // UI. No submission-status check (would need extra per-item API
      // calls), no late-window / Availability.EndDate consideration.
      // Rationale: once a deadline has passed, it's passed — extensions or
      // late arrangements are the student's own responsibility to track.
      // Consequence: there is no "Overdue" group in the UI.
      try {
        if (!item.dueDate) return false;
        return new Date(item.dueDate).getTime() >= Date.now();
      } catch {
        return false;
      }
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  await chrome.storage.local.set({
    deadlines: allDeadlines,
    courses,
    lastRefreshed: new Date().toISOString(),
    lastError: null,
  });

  return allDeadlines;
}

async function refreshSafely() {
  try {
    await refreshAll();
  } catch (err) {
    // Keep whatever we last successfully read; just record the error so
    // the panel can show "couldn't reach Learn" instead of going blank.
    await chrome.storage.local.set({ lastError: String(err.message || err) });
  }
}

// ---- lifecycle ------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
  refreshSafely();
});

chrome.runtime.onStartup.addListener(() => {
  refreshSafely();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshSafely();
});

chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// Let the side panel ask for an immediate refresh (e.g. a manual "refresh" button).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "REFRESH_NOW") {
    refreshSafely().then(() => sendResponse({ ok: true }));
    return true; // keep the message channel open for the async response
  }
});
