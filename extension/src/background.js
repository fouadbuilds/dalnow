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
  const folders = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/dropbox/folders/`);
  return folders
    .filter((f) => f.DueDate)
    .map((f) => ({
      id: `dropbox-${f.Id}`,
      title: f.Name,
      type: "assignment",
      dueDate: f.DueDate,
      orgUnitId,
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
  return quizzes
    .filter((q) => q.DueDate)
    .map((q) => ({
      id: `quiz-${q.QuizId || q.Id}`,
      title: q.Name,
      type: "quiz",
      dueDate: q.DueDate,
      orgUnitId,
    }));
}

async function getDiscussionDeadlines(orgUnitId, le) {
  let topics;
  try {
    const forums = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/discussions/`);
    topics = forums.flatMap((f) => f.Topics || []);
  } catch (e) {
    return [];
  }
  return topics
    .filter((t) => t.DueDate)
    .map((t) => ({
      id: `discussion-${t.TopicId || t.Id}`,
      title: t.Name,
      type: "discussion",
      dueDate: t.DueDate,
      orgUnitId,
    }));
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

  const allDeadlines = perCourse.flat().sort(
    (a, b) => new Date(a.dueDate) - new Date(b.dueDate)
  );

  await chrome.storage.local.set({
    deadlines: allDeadlines,
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
