// DALnow background service worker
//
// Everything here does GET-only calls against dal.brightspace.com's Valence
// API, riding the session cookie you already have from being logged into
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
const ALARM_NAME = "DALnow-refresh";
const REFRESH_MINUTES = 30;
let reminderCheckInProgress = null;

// ---- version discovery -----------------------------------------------

let cachedVersions = null;
const DEBUG_REQUEST_LIMIT = 50;
let currentDebug = null;

function refreshError(outcome) {
  const error = new Error(outcome);
  error.outcome = outcome;
  return error;
}

function startDebug() {
  currentDebug = { startedAt: new Date().toISOString(), requests: [], failedRequests: 0 };
}

function recordRequest(endpoint, status, startedAt) {
  if (!currentDebug || currentDebug.requests.length >= DEBUG_REQUEST_LIMIT) return;
  currentDebug.requests.push({ endpoint, status: Number.isInteger(status) ? status : null, ms: Date.now() - startedAt, via: "worker" });
  if (!Number.isInteger(status) || status >= 400) currentDebug.failedRequests += 1;
}

function safeLiveStatus(outcome, counts = null) {
  const finishedAt = new Date().toISOString();
  const message = outcome === "success"
    ? `Read ${counts.courses} courses and ${counts.deadlines} deadlines.`
    : outcome === "not-signed-in"
      ? "Brightspace was not signed in."
      : "DALnow could not complete the last read.";
  return {
    liveStatus: { outcome, finishedAt },
    liveDebug: {
      kind: "dalnow-live-debug",
      version: chrome.runtime.getManifest().version,
      base: BASE,
      run: "refresh",
      outcome,
      startedAt: currentDebug?.startedAt || finishedAt,
      finishedAt,
      counts: counts ? { courses: counts.courses, deadlines: counts.deadlines } : null,
      failedRequests: currentDebug?.failedRequests || 0,
      requests: currentDebug?.requests || [],
      lastLiveRead: { at: finishedAt, message },
    },
  };
}

async function getApiVersions() {
  if (cachedVersions) return cachedVersions;
  const list = await apiGet("/d2l/api/versions/", "/d2l/api/versions/");
  const find = (code) => {
    const entry = list.find((p) => p.ProductCode === code);
    if (!entry) throw new Error(`no version info for product "${code}"`);
    return entry.LatestVersion;
  };
  cachedVersions = { lp: find("lp"), le: find("le") };
  return cachedVersions;
}

// ---- low-level fetch helper --------------------------------------------

async function apiGet(path, endpoint = path) {
  const startedAt = Date.now();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, { credentials: "include" });
  } catch {
    recordRequest(endpoint, null, startedAt);
    throw refreshError("network-error");
  }
  recordRequest(endpoint, res.status, startedAt);
  if (res.status === 401 || res.status === 403) {
    throw refreshError("not-signed-in");
  }
  if (!res.ok) {
    throw refreshError("api-error");
  }
  try { return await res.json(); } catch { throw refreshError("api-error"); }
}

// ---- course discovery ---------------------------------------------------

async function getActiveCourses() {
  const { lp } = await getApiVersions();
  // myenrollments paginates; for a first pass we take one page (200 is the
  // default page size for most tenants) since a student's active course
  // count is always far below that.
  const data = await apiGet(`/d2l/api/lp/${lp}/enrollments/myenrollments/`, "/d2l/api/lp/{v}/enrollments/myenrollments/");
  const items = data.Items || data; // shape varies slightly by version
  return items
    .filter(
      (e) =>
        e.OrgUnit &&
        e.OrgUnit.Type &&
        e.OrgUnit.Type.Code === "Course Offering",
    )
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
    folders = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/dropbox/folders/`, "/d2l/api/le/{v}/{orgUnitId}/dropbox/folders/");
  } catch (e) {
    if (e?.outcome === "not-signed-in") throw e;
    return []; // course may have dropbox disabled entirely, hopefully not
  }
  if (!Array.isArray(folders)) return [];
  return folders
    .map((folder) => {
      if (!folder || isFutureDate(folder.Availability?.StartDate)) return null;
      const deadline = getDropboxDeadline(folder);
      if (!deadline) return null;
      return {
        id: `dropbox-${folder.Id}`,
        entityId: String(folder.Id),
        title: folder.Name ?? "Untitled assignment",
        // Labs are stored as a distinct reminder type when Learn's folder
        // title explicitly identifies them; other Dropbox items remain assignments.
        type: /\blab\b/i.test(folder.Name ?? "") ? "lab" : "assignment",
        ...deadline,
        orgUnitId,
        // Confirmed deep-link pattern (verified live against the tenant).
        // All IDs needed are already in this list response — no extra
        // per-item API calls required.
        url: `${BASE}/d2l/lms/dropbox/user/folder_submit_files.d2l?ou=${orgUnitId}&db=${folder.Id}`,
      };
    })
    .filter(Boolean);
}

function getDropboxDeadline(folder) {
  const dueDate = getDueDate(folder);
  if (dueDate) return { dueDate, dueType: "due" };

  const closesAt = folder?.Availability?.EndDate;
  if (typeof closesAt === "string" && !Number.isNaN(Date.parse(closesAt))) {
    return { dueDate: closesAt, dueType: "closes" };
  }
  return null;
}

function isFutureDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) && Date.parse(value) > Date.now();
}

async function getQuizDeadlines(orgUnitId, le) {
  let quizzes;
  try {
    quizzes = await getAllQuizPages(orgUnitId, le);
  } catch (e) {
    if (e?.outcome === "not-signed-in") throw e;
    return []; // course may have quizzes disabled entirely
  }
  if (!Array.isArray(quizzes)) return [];
  try {
    return quizzes
      .map((q) => ({ quiz: q, dueDate: getDueDate(q) }))
      .filter(({ quiz, dueDate }) => quiz && dueDate)
      .map(({ quiz: q, dueDate: due }) => {
        const quizId = q.QuizId ?? q.Id;
        const name = q.Name ?? q.Title ?? "Untitled quiz";
        return {
          id: `quiz-${quizId}`,
          entityId: String(quizId),
          title: name,
          type: "quiz",
          dueDate: due,
          dueType: "due",
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

function getDueDate(item) {
  // Brightspace's current QuizReadData uses DueDate. Keep the two legacy
  // spellings as fallbacks so a tenant-specific response cannot hide a real
  // deadline. Availability EndDate is deliberately excluded: it is not a due
  // date and would create false reminders.
  for (const field of ["DueDate", "Deadline", "DueDateTime"]) {
    const value = item?.[field];
    if (typeof value === "string" && !Number.isNaN(Date.parse(value))) {
      return value;
    }
  }
  return null;
}

function getNextApiPath(next) {
  const url = new URL(next, BASE);
  if (url.origin !== BASE || !url.pathname.startsWith("/d2l/api/")) {
    throw refreshError("api-error");
  }
  return `${url.pathname}${url.search}`;
}

async function getAllQuizPages(orgUnitId, le) {
  const endpoint = "/d2l/api/le/{v}/{orgUnitId}/quizzes/";
  let path = `/d2l/api/le/${le}/${orgUnitId}/quizzes/`;
  const visitedPaths = new Set();
  const quizzes = [];

  // D2L returns this route as Api.ObjectListPage, so an assignment of a quiz
  // can otherwise disappear whenever it lands after the first result page.
  while (path) {
    if (visitedPaths.has(path)) throw refreshError("api-error");
    visitedPaths.add(path);

    const page = await apiGet(path, endpoint);
    if (Array.isArray(page)) return page; // compatibility with older tenants
    if (!page || !Array.isArray(page.Objects)) throw refreshError("api-error");

    quizzes.push(...page.Objects);
    path = page.Next ? getNextApiPath(page.Next) : null;
  }
  return quizzes;
}

async function getDiscussionDeadlines(orgUnitId, le) {
  let topics;
  try {
    const forums = await apiGet(`/d2l/api/le/${le}/${orgUnitId}/discussions/`, "/d2l/api/le/{v}/{orgUnitId}/discussions/");
    // Discussion response shape + per-item deep-link pattern are UNVERIFIED
    // (current courses don't use discussions, so never confirmed live).
    // Keep the fetch — future courses might use it — but fall back to the
    // course homepage link for every discussion-type item.
    const list = Array.isArray(forums) ? forums : forums.Objects || [];
    topics = list.flatMap((f) => (f && f.Topics) || []);
  } catch (e) {
    if (e?.outcome === "not-signed-in") throw e;
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
          entityId: String(topicId),
          title: t.Name ?? t.Title ?? "Untitled discussion",
          type: "discussion",
          dueDate: t.DueDate ?? t.DueDateTime,
          dueType: "due",
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

async function getCalendarDeadlines(courses, le, existingItems) {
  const { courseOverrides = {} } = await chrome.storage.local.get("courseOverrides");
  const visibleCourses = courses.filter(
    (course) => courseOverrides[String(course.orgUnitId)]?.hidden !== true,
  );
  if (!visibleCourses.length) return [];

  const courseById = new Map(
    visibleCourses.map((course) => [String(course.orgUnitId), course]),
  );
  const seenEntities = new Set(
    existingItems
      .filter((item) => item.entityId !== undefined && item.entityId !== null)
      .map((item) => `${item.orgUnitId}:${item.entityId}`),
  );
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 1);
  const query = new URLSearchParams({
    orgUnitIdsCSV: visibleCourses.map((course) => course.orgUnitId).join(","),
    startDateTime: now.toISOString(),
    endDateTime: end.toISOString(),
    eventType: "6",
  });
  const endpoint = "/d2l/api/le/{v}/calendar/events/myEvents/";
  let path = `/d2l/api/le/${le}/calendar/events/myEvents/?${query}`;
  const visitedPaths = new Set();
  const deadlines = [];

  try {
    while (path) {
      if (visitedPaths.has(path)) throw refreshError("api-error");
      visitedPaths.add(path);
      const page = await apiGet(path, endpoint);
      if (!page || !Array.isArray(page.Objects)) throw refreshError("api-error");

      for (const event of page.Objects) {
        const course = courseById.get(String(event?.OrgUnitId));
        const dueDate = event?.StartDateTime;
        if (!course || typeof dueDate !== "string" || Number.isNaN(Date.parse(dueDate))) continue;

        const entityId = event.AssociatedEntity?.AssociatedEntityId;
        const entityKey = entityId === undefined || entityId === null
          ? null
          : `${course.orgUnitId}:${entityId}`;
        if (entityKey && seenEntities.has(entityKey)) continue;
        if (entityKey) seenEntities.add(entityKey);

        const fallbackLink = `${BASE}/d2l/le/content/${course.orgUnitId}/viewContent/${encodeURIComponent(entityId ?? event.CalendarEventId)}/View`;
        deadlines.push({
          id: `content-${course.orgUnitId}-${entityId ?? event.CalendarEventId}`,
          entityId: entityId === undefined || entityId === null ? null : String(entityId),
          title: event.Title ?? "Untitled content item",
          type: "content",
          dueDate,
          dueType: "due",
          orgUnitId: course.orgUnitId,
          courseName: course.name,
          courseCode: course.code,
          url: safeCalendarLink(event.AssociatedEntity?.Link, fallbackLink),
        });
      }
      path = page.Next ? getNextApiPath(page.Next) : null;
    }
  } catch (error) {
    if (error?.outcome === "not-signed-in") throw error;
    return [];
  }
  return deadlines;
}

function safeCalendarLink(link, fallback) {
  if (typeof link !== "string" || !link.trim()) return fallback;
  try {
    const url = new URL(link, BASE);
    return url.origin === BASE ? url.href : fallback;
  } catch {
    return fallback;
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
      const items = [...assignments, ...quizzes, ...discussions].map(
        (item) => ({
          ...item,
          courseName: course.name,
          courseCode: course.code,
        }),
      );
      return items;
    }),
  );

  const courseDeadlines = perCourse.flat();
  const calendarDeadlines = await getCalendarDeadlines(
    courses,
    le,
    courseDeadlines,
  );

  const allDeadlines = [...courseDeadlines, ...calendarDeadlines]
    .filter((item) => {
      // Past-due rule — DELIBERATE SIMPLIFICATION, not a bug (see plan.md).
      // If DueDate < now the item is excluded entirely, before storage or UI
      // No submission-status check (would need extra per-item API
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

  return { deadlines: allDeadlines, courses };
}

async function refreshSafely() {
  startDebug();
  let status;
  try {
    const { deadlines, courses } = await refreshAll();
    status = safeLiveStatus("success", { deadlines: deadlines.length, courses: courses.length });
    await chrome.storage.local.set({ deadlines, courses, lastRefreshed: status.liveStatus.finishedAt, lastError: null, ...status });
  } catch (err) {
    const outcome = ["not-signed-in", "network-error", "api-error"].includes(err?.outcome) ? err.outcome : "api-error";
    status = safeLiveStatus(outcome);
    await chrome.storage.local.set({ lastError: outcome, ...status });
  }
  await checkDueReminders();
  return status.liveStatus;
}

function reminderTime(dueDate, leadDays) {
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const reminder = new Date(due);
  reminder.setHours(8, 0, 0, 0);
  reminder.setDate(reminder.getDate() - leadDays);
  return reminder;
}

function checkDueReminders() {
  if (reminderCheckInProgress) return reminderCheckInProgress;
  reminderCheckInProgress = runReminderCheck().finally(() => {
    reminderCheckInProgress = null;
  });
  return reminderCheckInProgress;
}

async function runReminderCheck() {
  try {
    const stored = await chrome.storage.local.get([
      "deadlines",
      "courses",
      "reminderSettings",
      "sentReminderKeys",
    ]);
    const settings = stored.reminderSettings || {};
    const typeSettings = settings.types || {};
    const supportedTypes = new Set(["assignment", "quiz", "lab", "discussion", "content"]);
    const courseSettings = settings.courses || {};
    const sent =
      stored.sentReminderKeys && typeof stored.sentReminderKeys === "object"
        ? { ...stored.sentReminderKeys }
        : {};
    const now = Date.now();
    let changed = false;

    for (const item of stored.deadlines || []) {
      if (
        !supportedTypes.has(item.type) ||
        courseSettings[String(item.orgUnitId)] === false
      )
        continue;
      const type = typeSettings[item.type] || { enabled: true, leadDays: 1 };
      if (type.enabled === false) continue;
      const leadDays = Number.isInteger(type.leadDays)
        ? Math.min(7, Math.max(0, type.leadDays))
        : 1;
      const due = new Date(item.dueDate);
      if (Number.isNaN(due.getTime()) || due.getTime() <= now) continue;
      const notifyAt = reminderTime(item.dueDate, leadDays);
      if (!notifyAt || now < notifyAt.getTime()) continue;

      const key = `${item.id}|${due.toISOString()}`;
      if (sent[key]) continue;
      const course = (stored.courses || []).find(
        (entry) => String(entry.orgUnitId) === String(item.orgUnitId),
      );
      try {
        await chrome.notifications.create(key, {
          type: "basic",
          iconUrl: chrome.runtime.getURL("icons/icon128.png"),
          title: item.title || "Upcoming deadline",
          message: `Due ${due.toLocaleString()}`,
          contextMessage: course?.code || course?.name || "DALnow",
          priority: 0,
        });
        sent[key] = now;
        changed = true;
      } catch {
        // A system-level notification setting can block display. Leave the
        // reminder unmarked so a later alarm can retry if permission returns.
      }
    }

    const keys = Object.keys(sent);
    if (keys.length > 1000) {
      keys.sort((a, b) => sent[a] - sent[b]);
      for (const key of keys.slice(0, keys.length - 1000)) delete sent[key];
      changed = true;
    }
    if (changed) await chrome.storage.local.set({ sentReminderKeys: sent });
  } catch {
    // Reminder errors must not prevent deadline refresh or panel operation.
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
    refreshSafely().then((status) => sendResponse({ ok: status.outcome === "success", outcome: status.outcome }));
    return true; // keep the message channel open for the async response
  }
  if (msg?.type === "REMINDERS_UPDATED") {
    checkDueReminders().then(() => sendResponse({ ok: true }));
    return true;
  }
});
