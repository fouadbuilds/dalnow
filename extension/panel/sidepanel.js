const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const filtersEl = document.getElementById("filters");
const refreshBtn = document.getElementById("refreshBtn");
const refreshStatusEl = document.getElementById("refreshStatus");
const settingsBtn = document.getElementById("settingsBtn");
const backBtn = document.getElementById("backBtn");
const panelTitleEl = document.getElementById("panelTitle");
const brandLogoEl = document.querySelector(".brand-logo");
const headerActionsEl = document.querySelector(".header-actions");
const homeViewEl = document.getElementById("homeView");
const settingsViewEl = document.getElementById("settingsView");
const typeSettingsEl = document.getElementById("typeReminderSettings");
const courseSettingsEl = document.getElementById("courseReminderSettings");
const themeOptionEls = [...document.querySelectorAll(".appearance-option")];
const deleteDataBtn = document.getElementById("deleteDataBtn");
const dataStatusEl = document.getElementById("dataStatus");
const backgroundAppsGuideBtn = document.getElementById(
  "backgroundAppsGuideBtn",
);
const backgroundAppsGuide = document.getElementById("backgroundAppsGuide");
const reportBugBtn = document.getElementById("reportBugBtn");
const commonIssuesHelpBtn = document.getElementById("commonIssuesHelpBtn");
const commonIssuesHelp = document.getElementById("commonIssuesHelp");
const rebuildSearchIndexBtn = document.getElementById("rebuildSearchIndexBtn");
const searchIndexStatusEl = document.getElementById("searchIndexStatus");

const THEME_PREFERENCES = new Set(["system", "light", "dark"]);
const TYPE_ORDER = ["assignment", "quiz", "lab", "discussion", "content"];
const MAX_COURSE_NAME_LENGTH = 48;
const TYPE_DETAILS = {
  assignment: {
    label: "Assignments",
    singular: "Assignment",
    icon: "assignment",
  },
  quiz: { label: "Quizzes", singular: "Quiz", icon: "quiz" },
  lab: { label: "Labs", singular: "Lab", icon: "lab" },
  discussion: {
    label: "Discussions",
    singular: "Discussion",
    icon: "discussion",
  },
  content: { label: "Content", singular: "Content", icon: "content" },
};
const ICONS = {
  back: '<path d="m15 18-6-6 6-6"/>',
  assignment:
    '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/>',
  quiz: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
  lab: '<path d="M9 3h6M10 3v7l-5 8.2A2.5 2.5 0 0 0 7.1 22h9.8a2.5 2.5 0 0 0 2.1-3.8L14 10V3"/><path d="M8 15h8"/>',
  discussion:
    '<path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8v.5Z"/>',
  content: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
};

// Undo state exists only for the currently open panel session.
const justRemovedThisSession = new Set();

let activeCourseFilter = "all";
let cachedDeadlines = [];
let cachedCourses = [];
let itemState = {};
let themePreference = "system";
let reminderSettings = defaultReminderSettings();
let courseColors = new Map();
let courseOverrides = {};
let homeScrollTop = 0;
let liveStatus = { outcome: "success" };

function defaultReminderSettings() {
  const types = {};
  for (const type of TYPE_ORDER) types[type] = { enabled: true, leadDays: 1 };
  return { types, courses: {} };
}

function normalizeReminderSettings(value, courses = []) {
  const defaults = defaultReminderSettings();
  const source = value && typeof value === "object" ? value : {};
  const types = {};
  for (const type of TYPE_ORDER) {
    const saved = source.types?.[type];
    const days = Number(saved?.leadDays);
    types[type] = {
      enabled:
        typeof saved?.enabled === "boolean"
          ? saved.enabled
          : defaults.types[type].enabled,
      leadDays: Number.isInteger(days)
        ? Math.min(7, Math.max(0, days))
        : defaults.types[type].leadDays,
    };
  }
  const savedCourses =
    source.courses && typeof source.courses === "object" ? source.courses : {};
  const courseSettings = {};
  for (const course of courses) {
    const id = String(course.orgUnitId);
    courseSettings[id] =
      typeof savedCourses[id] === "boolean" ? savedCourses[id] : true;
  }
  return { types, courses: courseSettings };
}

function normalizeCustomName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, MAX_COURSE_NAME_LENGTH);
  return trimmed || null;
}

function normalizeCourseOverrides(value) {
  const source = value && typeof value === "object" ? value : {};
  const normalized = {};
  for (const [id, saved] of Object.entries(source)) {
    if (!/^\d+$/.test(id) || !saved || typeof saved !== "object") continue;
    const customName = normalizeCustomName(saved.customName);
    const hidden = saved.hidden === true;
    if (hidden || customName) normalized[id] = { hidden, customName };
  }
  return normalized;
}

function isCourseHidden(orgUnitId) {
  return courseOverrides[String(orgUnitId)]?.hidden === true;
}

function ensureHiddenCoursesHaveNoReminders(settings) {
  const next = normalizeReminderSettings(settings, cachedCourses);
  for (const course of cachedCourses) {
    if (isCourseHidden(course.orgUnitId)) {
      next.courses[String(course.orgUnitId)] = false;
    }
  }
  return next;
}

function icon(name, className = "") {
  const paths = ICONS[name] || ICONS.assignment;
  return `<svg${className ? ` class="${className}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

function applyThemePreference(value) {
  themePreference = THEME_PREFERENCES.has(value) ? value : "system";
  if (themePreference === "system")
    document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = themePreference;
  for (const option of themeOptionEls) {
    option.setAttribute(
      "aria-pressed",
      String(option.dataset.themePreference === themePreference),
    );
  }
}

async function setThemePreference(value) {
  applyThemePreference(value);
  try {
    await chrome.storage.local.set({ themePreference });
  } catch {
    dataStatusEl.textContent =
      "Appearance will reset if DALnow closes before it can be saved.";
  }
}

function openSettings() {
  homeScrollTop = document.scrollingElement?.scrollTop ?? 0;
  homeViewEl.hidden = true;
  settingsViewEl.hidden = false;
  panelTitleEl.textContent = "Settings";
  brandLogoEl.hidden = true;
  headerActionsEl.hidden = true;
  backBtn.hidden = false;
  document.scrollingElement?.scrollTo(0, 0);
  backBtn.focus();
}

function closeSettings() {
  settingsViewEl.hidden = true;
  homeViewEl.hidden = false;
  panelTitleEl.textContent = "DALnow";
  brandLogoEl.hidden = false;
  headerActionsEl.hidden = false;
  backBtn.hidden = true;
  requestAnimationFrame(() =>
    document.scrollingElement?.scrollTo(0, homeScrollTop),
  );
  settingsBtn.focus();
}

async function deleteLocalData() {
  const confirmed = window.confirm(
    "Delete DALnow's saved deadlines, reminder settings, appearance preference, and checked or removed items? This cannot be undone.",
  );
  if (!confirmed) return;

  deleteDataBtn.disabled = true;
  dataStatusEl.textContent = "Deleting local data…";
  try {
    await chrome.storage.local.clear();
    cachedDeadlines = [];
    cachedCourses = [];
    itemState = {};
    liveStatus = { outcome: "success" };
    reminderSettings = defaultReminderSettings();
    courseOverrides = {};
    activeCourseFilter = "all";
    justRemovedThisSession.clear();
    applyThemePreference("system");
    renderFilters();
    render([], null, null, liveStatus);
    renderReminderSettings();
    dataStatusEl.textContent =
      "DALnow data deleted. Refreshing your deadlines…";
    try {
      await chrome.runtime.sendMessage({ type: "REFRESH_NOW" });
      await load();
      dataStatusEl.textContent =
        "DALnow data deleted. Your deadlines have been refreshed.";
    } catch {
      dataStatusEl.textContent =
        "Local data deleted. Refresh your deadlines when Brightspace is available.";
    }
  } catch {
    dataStatusEl.textContent = "Couldn't delete local data. Please try again.";
  } finally {
    deleteDataBtn.disabled = false;
  }
}

function setReminderSettings(next) {
  reminderSettings = ensureHiddenCoursesHaveNoReminders(next);
  renderReminderSettings();
  chrome.storage.local
    .set({ reminderSettings })
    .then(() => {
      chrome.runtime.sendMessage({ type: "REMINDERS_UPDATED" }).catch(() => {});
    })
    .catch(() => {
      dataStatusEl.textContent =
        "Reminder changes couldn't be saved. Please try again.";
    });
}

function defaultCourseLabel(course) {
  const code = String(course.code || "").trim();
  const match = code.match(/([A-Z]{2,8})\s*[- ]?(\d{4})/i);
  if (match) return `${match[1].toUpperCase()} ${match[2]}`;
  return code || course.name || `Course ${course.orgUnitId}`;
}

function courseLabel(course) {
  return (
    courseOverrides[String(course.orgUnitId)]?.customName ||
    defaultCourseLabel(course)
  );
}

function saveCourseOverrides(next, includeReminderSettings = false) {
  courseOverrides = normalizeCourseOverrides(next);
  reminderSettings = ensureHiddenCoursesHaveNoReminders(reminderSettings);
  if (activeCourseFilter !== "all" && isCourseHidden(activeCourseFilter)) {
    activeCourseFilter = "all";
  }
  renderFilters();
  render();
  renderReminderSettings();
  const values = includeReminderSettings
    ? { courseOverrides, reminderSettings }
    : { courseOverrides };
  chrome.storage.local
    .set(values)
    .then(() => {
      if (includeReminderSettings)
        chrome.runtime
          .sendMessage({ type: "REMINDERS_UPDATED" })
          .catch(() => {});
    })
    .catch(() => {
      dataStatusEl.textContent =
        "Course changes couldn't be saved. Please try again.";
    });
}

function setCourseVisibility(course, visible) {
  const id = String(course.orgUnitId);
  const nextOverrides = structuredClone(courseOverrides);
  const current = nextOverrides[id] || { hidden: false, customName: null };
  nextOverrides[id] = { ...current, hidden: !visible };
  if (!nextOverrides[id].hidden && !nextOverrides[id].customName) {
    delete nextOverrides[id];
  }
  if (!visible) {
    const nextReminders = structuredClone(reminderSettings);
    nextReminders.courses[id] = false;
    reminderSettings = nextReminders;
  }
  saveCourseOverrides(nextOverrides, true);
}

function setCourseCustomName(course, value) {
  const id = String(course.orgUnitId);
  const nextOverrides = structuredClone(courseOverrides);
  const current = nextOverrides[id] || { hidden: false, customName: null };
  const customName = normalizeCustomName(value);
  if (!current.hidden && !customName) {
    delete nextOverrides[id];
  } else {
    nextOverrides[id] = { ...current, customName };
  }
  saveCourseOverrides(nextOverrides);
}

function assignCourseColors() {
  const palette = Array.from(
    { length: 10 },
    (_, index) => `var(--course-${index + 1})`,
  );
  const taken = new Set();
  const colors = new Map();
  const ordered = [...cachedCourses].sort((a, b) =>
    String(a.orgUnitId).localeCompare(String(b.orgUnitId)),
  );
  for (const course of ordered) {
    const key = String(course.orgUnitId);
    let hash = 0;
    for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    const preferred = hash % palette.length;
    let chosen = preferred;
    for (let offset = 0; offset < palette.length; offset += 1) {
      const candidate = (preferred + offset) % palette.length;
      if (!taken.has(candidate)) {
        chosen = candidate;
        break;
      }
    }
    taken.add(chosen);
    colors.set(key, `--course-${chosen + 1}`);
  }
  courseColors = colors;
}

function courseChip(course, count = null, pressed = false, isAll = false) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `course-chip${isAll ? " all-chip" : ""}`;
  chip.setAttribute("aria-pressed", String(pressed));
  if (!isAll)
    chip.style.setProperty(
      "--course-color",
      `var(${courseColors.get(String(course.orgUnitId)) || "--course-1"})`,
    );
  const label = isAll ? "All" : courseLabel(course);
  chip.append(document.createTextNode(label));
  if (count !== null) {
    const countEl = document.createElement("span");
    countEl.className = "course-count";
    countEl.textContent = ` ${count}`;
    chip.append(countEl);
  }
  if (isAll)
    chip.addEventListener("click", () => {
      activeCourseFilter = "all";
      renderFilters();
      render();
    });
  else
    chip.addEventListener("click", () => {
      activeCourseFilter = course.orgUnitId;
      renderFilters();
      render();
    });
  return chip;
}

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function parseDue(value) {
  try {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

function getBoundaries(now = new Date()) {
  const today = startOfDay(now);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const nextWeekEnd = new Date(today);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 14);
  return { today, tomorrow, dayAfterTomorrow, weekEnd, nextWeekEnd };
}

function groupDeadlines(deadlines) {
  const now = new Date();
  const boundaries = getBoundaries(now);
  const groups = {
    Today: [],
    "This week": [],
    "Next week": [],
    Later: [],
    _boundaries: boundaries,
    _undated: [],
  };
  for (const item of deadlines) {
    const due = parseDue(item.dueDate);
    if (!due) {
      groups._undated.push(item);
      continue;
    }
    if (due < now) continue;
    if (due < boundaries.tomorrow) groups.Today.push(item);
    else if (due < boundaries.weekEnd) groups["This week"].push(item);
    else if (due < boundaries.nextWeekEnd) groups["Next week"].push(item);
    else groups.Later.push(item);
  }
  return groups;
}

function formatDate(date, options) {
  return date.toLocaleDateString(undefined, options);
}

function formatRange(start, end) {
  const startMonth = formatDate(start, { month: "short" });
  const endMonth = formatDate(end, { month: "short" });
  const startDay = formatDate(start, { day: "numeric" });
  const endDay = formatDate(end, { day: "numeric" });
  return startMonth === endMonth
    ? `${startMonth} ${startDay}–${endDay}`
    : `${startMonth} ${startDay}–${endMonth} ${endDay}`;
}

function groupRange(label, boundaries) {
  if (label === "Today")
    return formatDate(boundaries.today, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  if (label === "This week") {
    const end = new Date(boundaries.weekEnd);
    end.setDate(end.getDate() - 1);
    return formatRange(boundaries.tomorrow, end);
  }
  if (label === "Next week") {
    const end = new Date(boundaries.nextWeekEnd);
    end.setDate(end.getDate() - 1);
    return formatRange(boundaries.weekEnd, end);
  }
  return "";
}

function formatDue(value) {
  const due = parseDue(value);
  if (!due) return "Date unavailable";
  const boundaries = getBoundaries();
  const time = due.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  if (due >= boundaries.today && due < boundaries.tomorrow)
    return `Today, ${time}`;
  if (due >= boundaries.tomorrow && due < boundaries.dayAfterTomorrow)
    return `Tomorrow, ${time}`;
  return `${formatDate(due, { month: "short", day: "numeric" })}, ${time}`;
}

function activeDeadlines() {
  return cachedDeadlines.filter((item) => !itemState[item.id]?.removed);
}

function homeDeadlines() {
  return activeDeadlines().filter((item) => !isCourseHidden(item.orgUnitId));
}

function renderSummary() {
  const groups = groupDeadlines(homeDeadlines());
  const todayCount = groups.Today.length;
  const tomorrowCount = groups["This week"].filter((item) => {
    const due = parseDue(item.dueDate);
    return (
      due &&
      due >= groups._boundaries.tomorrow &&
      due < groups._boundaries.dayAfterTomorrow
    );
  }).length;
  if (!todayCount && !tomorrowCount) {
    summaryEl.textContent = "Nothing due today";
    return;
  }
  const sentence = [];
  if (todayCount)
    sentence.push(
      `${todayCount} ${todayCount === 1 ? "deadline" : "deadlines"} due today`,
    );
  if (tomorrowCount) sentence.push(`${tomorrowCount} due by tomorrow`);
  summaryEl.textContent = `You have ${sentence.join(" and ")}.`;
}

function renderFilters() {
  filtersEl.replaceChildren();
  assignCourseColors();
  const counts = new Map();
  for (const item of homeDeadlines())
    counts.set(
      String(item.orgUnitId),
      (counts.get(String(item.orgUnitId)) || 0) + 1,
    );
  const allCount = homeDeadlines().length;
  filtersEl.append(
    courseChip(null, allCount, activeCourseFilter === "all", true),
  );
  for (const course of cachedCourses.filter(
    (course) => !isCourseHidden(course.orgUnitId),
  )) {
    filtersEl.append(
      courseChip(
        course,
        counts.get(String(course.orgUnitId)) || 0,
        activeCourseFilter === course.orgUnitId,
      ),
    );
  }
}

function getVisibleDeadlines() {
  return cachedDeadlines.filter((item) => {
    if (isCourseHidden(item.orgUnitId)) return false;
    if (itemState[item.id]?.removed && !justRemovedThisSession.has(item.id))
      return false;
    return (
      activeCourseFilter === "all" ||
      String(item.orgUnitId) === String(activeCourseFilter)
    );
  });
}

function courseForItem(item) {
  return (
    cachedCourses.find(
      (course) => String(course.orgUnitId) === String(item.orgUnitId),
    ) || {
      orgUnitId: item.orgUnitId,
      code: item.courseCode,
      name: item.courseName,
    }
  );
}

function safeItemUrl(item) {
  const fallback = `https://dal.brightspace.com/d2l/home/${encodeURIComponent(item.orgUnitId)}`;
  try {
    const url = new URL(item.url || fallback);
    return url.protocol === "https:" && url.hostname === "dal.brightspace.com"
      ? url.href
      : fallback;
  } catch {
    return fallback;
  }
}

function addGroup(parent, label, items, boundaries) {
  if (!items.length) return;
  const section = document.createElement("section");
  section.className = "deadline-group";
  const heading = document.createElement("h2");
  heading.className = "group-title";
  const labelEl = document.createElement("span");
  labelEl.className = "group-label";
  labelEl.textContent = label;
  heading.append(labelEl);
  const range = groupRange(label, boundaries);
  if (range) {
    const rangeEl = document.createElement("span");
    rangeEl.className = "group-range";
    rangeEl.textContent = `· ${range}`;
    heading.append(rangeEl);
  }
  section.append(heading);
  for (const item of items) {
    section.append(
      itemState[item.id]?.removed ? renderUndoCard(item) : renderCard(item),
    );
  }
  parent.append(section);
}

function render(deadlines, _lastRefreshed, lastError, status = liveStatus) {
  if (deadlines !== undefined) cachedDeadlines = deadlines || [];
  listEl.replaceChildren();
  statusEl.textContent =
    status?.outcome === "partial"
      ? ""
      // not all api reads are partial, it still keeps coming back even though its not necessary
      : lastError
        ? "Couldn't reach Brightspace. Showing your last saved deadlines."
        : "";
  const isSignedOutEmpty =
    cachedDeadlines.length === 0 && status?.outcome === "not-signed-in";
  summaryEl.hidden = isSignedOutEmpty;
  if (!isSignedOutEmpty) renderSummary();

  const visible = getVisibleDeadlines();
  if (!visible.length) {
    if (isSignedOutEmpty) {
      listEl.append(renderSignedOutCard());
    } else {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent =
        cachedDeadlines.length === 0
          ? "No deadlines found yet. Refresh and make sure you're logged into Brightspace."
          : "No deadlines match this course filter.";
      listEl.append(empty);
    }
    return;
  }

  const groups = groupDeadlines(visible);
  for (const label of ["Today", "This week", "Next week", "Later"]) {
    addGroup(listEl, label, groups[label], groups._boundaries);
  }
  addGroup(listEl, "No date", groups._undated, groups._boundaries);
}

function renderSignedOutCard() {
  const card = document.createElement("section");
  card.className = "sign-in-card";
  const heading = document.createElement("h2");
  heading.textContent = "Sign in to Brightspace first";
  const copy = document.createElement("p");
  copy.textContent =
    "DALnow reads Brightspace through the session in this browser. Open Brightspace and sign in. Your deadlines show up here once a Brightspace page loads. If they don't, select Try again.";
  const actions = document.createElement("div");
  actions.className = "sign-in-actions";
  const open = document.createElement("a");
  open.className = "primary-action";
  open.href = "https://dal.brightspace.com";
  open.target = "_blank";
  open.rel = "noopener noreferrer";
  open.textContent = "Open Brightspace";
  const retry = document.createElement("button");
  retry.className = "secondary-action";
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", refreshNow);
  actions.append(open, retry);
  card.append(heading, copy, actions);
  return card;
}

function renderCard(item) {
  const card = document.createElement("article");
  card.className = `item${itemState[item.id]?.checked ? " checked" : ""}`;
  const course = courseForItem(item);
  const courseColor = courseColors.get(String(item.orgUnitId)) || "--course-1";
  const type = TYPE_DETAILS[item.type] ? item.type : "assignment";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "check";
  checkbox.checked = Boolean(itemState[item.id]?.checked);
  checkbox.setAttribute("aria-label", `Mark ${item.title} complete`);
  checkbox.addEventListener("click", (event) => event.stopPropagation());
  checkbox.addEventListener("change", async () =>
    setItemState(item.id, { checked: checkbox.checked }),
  );

  const content = document.createElement("div");
  content.className = "item-content";
  const topLine = document.createElement("div");
  topLine.className = "item-topline";
  const coursePill = document.createElement("span");
  coursePill.className = "item-course";
  coursePill.style.setProperty("--course-color", `var(${courseColor})`);
  coursePill.textContent = courseLabel(course);
  coursePill.title = courseLabel(course);
  const typeBadge = document.createElement("span");
  typeBadge.className = "item-type";
  typeBadge.setAttribute("aria-label", TYPE_DETAILS[type].singular);
  typeBadge.innerHTML = `${icon(TYPE_DETAILS[type].icon)}<span class="item-type-label">${TYPE_DETAILS[type].singular}</span>`;
  topLine.append(coursePill, typeBadge);

  const title = document.createElement("a");
  title.className = "item-title";
  title.textContent = item.title || "Untitled deadline";
  title.href = safeItemUrl(item);
  title.target = "_blank";
  title.rel = "noopener noreferrer";
  content.append(topLine, title);

  const due = document.createElement("div");
  due.className = "item-due";
  due.textContent = `${item.dueType === "closes" ? "Closes" : "Due"} ${formatDue(item.dueDate)}`;

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove-button";
  removeBtn.type = "button";
  removeBtn.innerHTML = icon("close");
  removeBtn.title = "Remove deadline";
  removeBtn.setAttribute("aria-label", `Remove ${item.title} from DALnow`);
  removeBtn.addEventListener("click", async () => {
    justRemovedThisSession.add(item.id);
    await setItemState(item.id, { removed: true });
  });
  card.append(checkbox, content, due, removeBtn);
  return card;
}

function renderUndoCard(item) {
  const card = document.createElement("article");
  card.className = "item undo";
  const label = document.createElement("span");
  label.className = "undo-label";
  label.textContent = `Removed “${item.title}”`;
  const button = document.createElement("button");
  button.className = "undo-button";
  button.type = "button";
  button.textContent = "Undo";
  button.addEventListener("click", async () => {
    justRemovedThisSession.delete(item.id);
    await setItemState(item.id, { removed: false });
  });
  card.append(label, button);
  return card;
}

function renderReminderSettings() {
  typeSettingsEl.replaceChildren();
  for (const type of TYPE_ORDER) {
    const details = TYPE_DETAILS[type];
    const setting = reminderSettings.types[type];
    const card = document.createElement("section");
    card.className = "setting-card type-setting";
    const head = document.createElement("div");
    head.className = "type-setting-head";
    head.innerHTML = icon(details.icon);
    const name = document.createElement("span");
    name.className = "type-setting-name";
    name.textContent = details.label;
    head.append(name);

    const toggle = makeToggle(
      `reminder-${type}`,
      `Reminders for ${details.label.toLowerCase()}`,
      setting.enabled,
      "var(--brand-gold)",
    );
    toggle.input.addEventListener("change", () => {
      const next = structuredClone(reminderSettings);
      next.types[type].enabled = toggle.input.checked;
      setReminderSettings(next);
    });

    const label = document.createElement("label");
    label.className = "lead-label";
    label.htmlFor = `lead-${type}`;
    label.textContent =
      setting.leadDays === 0
        ? "Morning of (bro you've gotta lock in 😭)"
        : `${setting.leadDays} ${setting.leadDays === 1 ? "day" : "days"} before`;
    const range = document.createElement("input");
    range.className = "lead-range";
    range.id = `lead-${type}`;
    range.type = "range";
    range.min = "0";
    range.max = "7";
    range.step = "1";
    range.value = String(setting.leadDays);
    range.disabled = !setting.enabled;
    range.setAttribute(
      "aria-label",
      `Days before ${details.singular} due date`,
    );
    range.dir = "rtl";
    range.addEventListener("keydown", (event) => {
      const delta =
        event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      range.value = String(
        Math.min(7, Math.max(0, Number(range.value) + delta)),
      );
      range.dispatchEvent(new Event("input", { bubbles: true }));
      range.dispatchEvent(new Event("change", { bubbles: true }));
    });
    range.addEventListener("input", () => {
      label.textContent =
        Number(range.value) === 0
          ? "Morning of (bro you've gotta lock in 😭)"
          : `${range.value} ${range.value === "1" ? "day" : "days"} before`;
    });
    range.addEventListener("change", () => {
      const next = structuredClone(reminderSettings);
      next.types[type].leadDays = Number(range.value);
      setReminderSettings(next);
    });
    const scale = document.createElement("div");
    scale.className = "lead-scale";
    scale.setAttribute("aria-hidden", "true");
    for (const value of [7, 6, 5, 4, 3, 2, 1]) {
      const mark = document.createElement("span");
      mark.textContent = String(value);
      scale.append(mark);
    }
    const morning = document.createElement("span");
    morning.textContent = "morning of";
    scale.append(morning);
    card.append(head, toggle.wrapper, label, range, scale);
    typeSettingsEl.append(card);
  }

  courseSettingsEl.replaceChildren();
  if (!cachedCourses.length) {
    const note = document.createElement("p");
    note.className = "data-copy";
    note.textContent =
      "Your courses show up here after DALnow reads Brightspace.";
    courseSettingsEl.append(note);
    return;
  }
  for (const course of cachedCourses) {
    const id = String(course.orgUnitId);
    const hidden = isCourseHidden(id);
    const row = document.createElement("div");
    row.className = "setting-card course-setting";
    const chip = document.createElement("span");
    chip.className = "course-chip";
    const deadlineCount = activeDeadlines().filter(
      (item) => String(item.orgUnitId) === id,
    ).length;
    chip.append(document.createTextNode(courseLabel(course)));
    const count = document.createElement("span");
    count.className = "course-count";
    count.textContent = `· ${deadlineCount}`;
    chip.append(count);
    chip.title = courseLabel(course);
    chip.style.setProperty(
      "--course-color",
      `var(${courseColors.get(id) || "--course-1"})`,
    );
    const nameLabel = document.createElement("label");
    nameLabel.className = "course-name-label";
    nameLabel.htmlFor = `course-name-${id}`;
    nameLabel.textContent = "Course name";
    const nameInput = document.createElement("input");
    nameInput.className = "course-name-input";
    nameInput.id = `course-name-${id}`;
    nameInput.type = "text";
    nameInput.maxLength = MAX_COURSE_NAME_LENGTH;
    nameInput.value =
      courseOverrides[id]?.customName || defaultCourseLabel(course);
    nameInput.placeholder = defaultCourseLabel(course);
    nameInput.setAttribute(
      "aria-label",
      `Custom name for ${defaultCourseLabel(course)}`,
    );
    nameInput.addEventListener("change", () =>
      setCourseCustomName(course, nameInput.value),
    );

    const controls = document.createElement("div");
    controls.className = "course-controls";
    const visibilityControl = document.createElement("div");
    visibilityControl.className = "course-control";
    const visibilityLabel = document.createElement("span");
    visibilityLabel.textContent = "Show on Home";
    const visibilityToggle = makeToggle(
      `course-visible-${id}`,
      `Show ${courseLabel(course)} on Home`,
      !hidden,
      `var(${courseColors.get(id) || "--course-1"})`,
    );
    visibilityToggle.input.addEventListener("change", () =>
      setCourseVisibility(course, visibilityToggle.input.checked),
    );
    visibilityControl.append(visibilityLabel, visibilityToggle.wrapper);

    const reminderControl = document.createElement("div");
    reminderControl.className = "course-control";
    const reminderLabel = document.createElement("span");
    reminderLabel.textContent = "Reminders";
    const reminderToggle = makeToggle(
      `course-${id}`,
      `Reminders for ${courseLabel(course)}`,
      !hidden && reminderSettings.courses[id] !== false,
      `var(${courseColors.get(id) || "--course-1"})`,
    );
    reminderToggle.input.disabled = hidden;
    reminderToggle.wrapper.classList.toggle("is-disabled", hidden);
    reminderToggle.input.addEventListener("change", () => {
      const next = structuredClone(reminderSettings);
      next.courses[id] = reminderToggle.input.checked;
      setReminderSettings(next);
    });
    reminderControl.append(reminderLabel, reminderToggle.wrapper);
    controls.append(visibilityControl, reminderControl);
    row.append(chip, nameLabel, nameInput, controls);
    courseSettingsEl.append(row);
  }
}

function makeToggle(id, label, checked, color) {
  const wrapper = document.createElement("label");
  wrapper.className = "toggle";
  wrapper.style.setProperty("--toggle-color", color);
  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = id;
  input.checked = checked;
  input.setAttribute("role", "switch");
  input.setAttribute("aria-label", label);
  const track = document.createElement("span");
  track.className = "toggle-track";
  wrapper.append(input, track);
  return { wrapper, input };
}

async function setItemState(id, patch) {
  itemState[id] = { ...(itemState[id] || {}), ...patch };
  try {
    await chrome.storage.local.set({ itemState });
  } catch {
    /* Keep this panel responsive if storage is temporarily unavailable. */
  }
  render();
}

async function load() {
  const stored = await chrome.storage.local.get([
    "deadlines",
    "courses",
    "itemState",
    "lastRefreshed",
    "lastError",
    "liveStatus",
    "themePreference",
    "reminderSettings",
    "courseOverrides",
    "searchIndexStatus",
    "searchIndexRefreshed",
    "searchShortcutUnassigned",
  ]);
  cachedDeadlines = stored.deadlines || [];
  cachedCourses = stored.courses || deriveCourses(cachedDeadlines);
  itemState = stored.itemState || {};
  liveStatus = stored.liveStatus || {
    outcome: stored.lastError === "not-signed-in" ? "not-signed-in" : "success",
  };
  applyThemePreference(stored.themePreference);
  courseOverrides = normalizeCourseOverrides(stored.courseOverrides);
  reminderSettings = ensureHiddenCoursesHaveNoReminders(
    stored.reminderSettings,
  );
  renderFilters();
  render(cachedDeadlines, stored.lastRefreshed, stored.lastError, liveStatus);
  renderReminderSettings();
  renderSearchIndexStatus(stored);
}

function renderSearchIndexStatus(stored) {
  const outcome = stored.searchIndexStatus?.outcome;
  if (
    (outcome === "success" || outcome === "partial") &&
    stored.searchIndexRefreshed
  ) {
    const partialNote =
      outcome === "partial" ? " Some course tools were unavailable." : "";
    searchIndexStatusEl.textContent = `Last indexed ${new Date(stored.searchIndexRefreshed).toLocaleString()}.${partialNote}`;
  } else if (outcome === "not-signed-in") {
    searchIndexStatusEl.textContent =
      "Sign in to Brightspace, then rebuild the index.";
  } else if (outcome) {
    searchIndexStatusEl.textContent =
      "Could not rebuild. Your previous search index is still available.";
  } else {
    searchIndexStatusEl.textContent = "Your search index is being prepared.";
  }
  if (stored.searchShortcutUnassigned) {
    searchIndexStatusEl.textContent +=
      " Alt+K is unassigned; set it in chrome://extensions/shortcuts.";
  }
}

function deriveCourses(deadlines) {
  const courses = new Map();
  for (const item of deadlines || []) {
    const key = String(item.orgUnitId);
    if (!courses.has(key))
      courses.set(key, {
        orgUnitId: item.orgUnitId,
        name: item.courseName,
        code: item.courseCode,
      });
  }
  return [...courses.values()];
}

async function refreshNow() {
  refreshBtn.classList.add("is-refreshing");
  refreshStatusEl.textContent = "Refreshing…";
  statusEl.textContent = "";
  try {
    const result = await chrome.runtime.sendMessage({ type: "REFRESH_NOW" });
    liveStatus = { outcome: result?.outcome || "api-error" };
    await load();
  } catch {
    statusEl.textContent =
      "Couldn't reach Brightspace. Showing your last saved deadlines.";
  } finally {
    refreshBtn.classList.remove("is-refreshing");
    refreshStatusEl.textContent = "";
  }
}

async function rebuildSearchIndex() {
  rebuildSearchIndexBtn.disabled = true;
  searchIndexStatusEl.textContent = "Rebuilding search index…";
  try {
    const result = await chrome.runtime.sendMessage({
      type: "REBUILD_SEARCH_INDEX",
    });
    if (!result?.ok) throw new Error("Search index rebuild failed");
  } catch {
    searchIndexStatusEl.textContent =
      "Could not rebuild. Your previous search index is still available.";
  } finally {
    rebuildSearchIndexBtn.disabled = false;
    await load();
  }
}

refreshBtn.addEventListener("click", refreshNow);
rebuildSearchIndexBtn.addEventListener("click", rebuildSearchIndex);

settingsBtn.addEventListener("click", openSettings);
backBtn.addEventListener("click", closeSettings);
for (const option of themeOptionEls) {
  option.addEventListener("click", () =>
    setThemePreference(option.dataset.themePreference),
  );
}
deleteDataBtn.addEventListener("click", deleteLocalData);
backgroundAppsGuideBtn.addEventListener("click", () => {
  const expanded =
    backgroundAppsGuideBtn.getAttribute("aria-expanded") === "true";
  backgroundAppsGuideBtn.setAttribute("aria-expanded", String(!expanded));
  backgroundAppsGuide.hidden = expanded;
});
commonIssuesHelpBtn.addEventListener("click", () => {
  const expanded = commonIssuesHelpBtn.getAttribute("aria-expanded") === "true";
  commonIssuesHelpBtn.setAttribute("aria-expanded", String(!expanded));
  commonIssuesHelp.hidden = expanded;
});
reportBugBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.themePreference)
    applyThemePreference(changes.themePreference.newValue);
  if (
    changes.deadlines ||
    changes.lastError ||
    changes.liveStatus ||
    changes.courses ||
    changes.itemState ||
    changes.reminderSettings ||
    changes.courseOverrides ||
    changes.searchIndexStatus ||
    changes.searchIndexRefreshed ||
    changes.searchShortcutUnassigned
  ) {
    if (changes.deadlines && !changes.deadlines.newValue) {
      activeCourseFilter = "all";
      justRemovedThisSession.clear();
    }
    load();
  }
});

load();
