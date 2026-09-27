const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const summaryEl = document.getElementById("summary");
const filtersEl = document.getElementById("filters");
const refreshBtn = document.getElementById("refreshBtn");
const settingsBtn = document.getElementById("settingsBtn");
const backBtn = document.getElementById("backBtn");
const panelTitleEl = document.getElementById("panelTitle");
const deadlineViewEl = document.getElementById("deadlineView");
const settingsViewEl = document.getElementById("settingsView");
const themeDescriptionEl = document.getElementById("themeDescription");
const themeOptionEls = [...document.querySelectorAll(".theme-option")];

const THEME_PREFERENCES = new Set(["system", "light", "dark"]);
const THEME_DESCRIPTIONS = {
  system: "Match this device's appearance.",
  light: "Always use the light appearance.",
  dark: "Always use the dark appearance.",
};

// Session-scoped only: ids removed during THIS panel session, for the
// in-place Undo card. Plain in-memory JS state — never written to storage.
// Closing/reopening the panel clears this set; anything still flagged
// `removed: true` in storage is then simply absent with no undo.
const justRemovedThisSession = new Set();

let activeCourseFilter = "all"; // "all" | orgUnitId (number)
let cachedDeadlines = [];
let cachedCourses = [];
let itemState = {}; // id -> { checked: bool, removed: bool }
let themePreference = "system";
let deadlineScrollTop = 0;

function normaliseThemePreference(value) {
  return THEME_PREFERENCES.has(value) ? value : "system";
}

function applyThemePreference(value) {
  themePreference = normaliseThemePreference(value);
  if (themePreference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = themePreference;
  }
  for (const option of themeOptionEls) {
    const selected = option.dataset.themePreference === themePreference;
    option.setAttribute("aria-pressed", String(selected));
  }
  themeDescriptionEl.textContent = THEME_DESCRIPTIONS[themePreference];
}

async function setThemePreference(value) {
  applyThemePreference(value);
  try {
    await chrome.storage.local.set({ themePreference });
  } catch {
    // Keep the immediate choice for this panel session. A new panel session
    // falls back to the last successfully stored value (or System).
  }
}

function openSettings() {
  deadlineScrollTop = document.scrollingElement?.scrollTop ?? 0;
  deadlineViewEl.hidden = true;
  settingsViewEl.hidden = false;
  panelTitleEl.textContent = "Settings";
  refreshBtn.hidden = true;
  settingsBtn.hidden = true;
  backBtn.hidden = false;
  backBtn.focus();
}

function closeSettings() {
  settingsViewEl.hidden = true;
  deadlineViewEl.hidden = false;
  panelTitleEl.textContent = "DalNow";
  refreshBtn.hidden = false;
  settingsBtn.hidden = false;
  backBtn.hidden = true;
  requestAnimationFrame(() => {
    if (document.scrollingElement) document.scrollingElement.scrollTop = deadlineScrollTop;
  });
  settingsBtn.focus();
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseDue(dateStr) {
  // Fault-tolerant: never throw on malformed/missing dates.
  try {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  } catch {
    return null;
  }
}

function groupDeadlines(deadlines) {
  // Groups per spec: Today, This week, Next week, Later.
  // No "Overdue" group — past-due items are filtered out in the background
  // worker before they ever reach storage/UI (deliberate simplification).
  const now = new Date();
  const today0 = startOfDay(now);
  const tomorrow0 = new Date(today0);
  tomorrow0.setDate(tomorrow0.getDate() + 1);
  const dayAfterTomorrow0 = new Date(today0);
  dayAfterTomorrow0.setDate(dayAfterTomorrow0.getDate() + 2);
  const weekEnd = new Date(today0);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const nextWeekEnd = new Date(today0);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 14);

  const groups = {
    Today: [],
    "This week": [],
    "Next week": [],
    Later: [],
  };
  // Undated/unparseable items go here so they stay visible instead of
  // crashing the render or vanishing silently.
  const undated = [];

  for (const d of deadlines) {
    const due = parseDue(d.dueDate);
    if (!due) {
      undated.push(d);
      continue;
    }
    // Defensive: skip anything that slipped through past-due (clock skew,
    // stale storage) — same intentional rule as the background filter.
    if (due.getTime() < now.getTime()) continue;
    if (due < tomorrow0) groups.Today.push(d);
    else if (due < weekEnd) groups["This week"].push(d);
    else if (due < nextWeekEnd) groups["Next week"].push(d);
    else groups.Later.push(d);
  }

  // Expose day boundaries for the summary line without recomputing.
  groups._boundaries = { today0, tomorrow0, dayAfterTomorrow0 };
  if (undated.length) groups._undated = undated;
  return groups;
}

function formatTimeOnly(d) {
  try {
    return d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function formatDue(dateStr) {
  // Always date + time together, by priority per spec:
  //   "Today, [time]" / "Tomorrow, [time]" /
  //   "[Mon short], [day], [time]" e.g. "Sep 24, 11:59 PM".
  // All API due dates are UTC ISO strings; the Date constructor converts
  // to the user's local time zone for both grouping and display.
  const d = parseDue(dateStr);
  if (!d) return "Date unavailable";
  try {
    const now = new Date();
    const today0 = startOfDay(now);
    const tomorrow0 = new Date(today0);
    tomorrow0.setDate(tomorrow0.getDate() + 1);
    const dayAfter0 = new Date(today0);
    dayAfter0.setDate(dayAfter0.getDate() + 2);
    const time = formatTimeOnly(d);
    if (d >= today0 && d < tomorrow0) return `Today, ${time}`;
    if (d >= tomorrow0 && d < dayAfter0) return `Tomorrow, ${time}`;
    const datePart = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `${datePart}, ${time}`;
  } catch {
    return "Date unavailable";
  }
}

function courseUrl(orgUnitId) {
  return `https://dal.brightspace.com/d2l/home/${orgUnitId}`;
}

function itemUrl(item) {
  // Prefer the per-type deep link built in the background worker
  // (assignment → dropbox pattern, quiz → quiz pattern, both confirmed).
  // Discussion falls back to the course homepage (pattern unverified).
  if (item.url) return item.url;
  return courseUrl(item.orgUnitId);
}

function shortCourseLabel(course) {
  return course.code || course.name || `Course ${course.orgUnitId}`;
}

function renderSummary(groups) {
  // Plain sentence derived from already-grouped data, no separate logic.
  const todayCount = groups.Today.length;
  let tomorrowCount = 0;
  try {
    const { tomorrow0, dayAfterTomorrow0 } = groups._boundaries;
    tomorrowCount = groups["This week"].filter((item) => {
      const due = parseDue(item.dueDate);
      return due && due >= tomorrow0 && due < dayAfterTomorrow0;
    }).length;
  } catch {
    tomorrowCount = 0;
  }

  if (todayCount === 0 && tomorrowCount === 0) {
    summaryEl.textContent = "Nothing due today.";
    return;
  }
  const plural = (n) => (n === 1 ? "deadline" : "deadlines");
  let text = "";
  if (todayCount > 0) {
    text = `You have ${todayCount} ${plural(todayCount)} due today`;
  }
  if (tomorrowCount > 0) {
    text += todayCount > 0
      ? `, and ${tomorrowCount} due tomorrow.`
      : `You have ${tomorrowCount} ${plural(tomorrowCount)} due tomorrow.`;
    if (todayCount > 0) text += ".";
  } else if (todayCount > 0) {
    text += ".";
  }
  summaryEl.textContent = text;
}

function renderFilters() {
  filtersEl.innerHTML = "";
  const makeBtn = (label, value, selected) => {
    const btn = document.createElement("button");
    btn.className = "pill" + (selected ? " selected" : "");
    btn.textContent = label;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", selected ? "true" : "false");
    btn.addEventListener("click", () => {
      activeCourseFilter = value;
      renderFilters();
      render();
    });
    return btn;
  };

  filtersEl.appendChild(makeBtn("All", "all", activeCourseFilter === "all"));
  for (const course of cachedCourses) {
    filtersEl.appendChild(
      makeBtn(
        shortCourseLabel(course),
        course.orgUnitId,
        activeCourseFilter === course.orgUnitId
      )
    );
  }
}

function getVisibleDeadlines() {
  // Apply persistent `removed` flag + active course filter.
  return cachedDeadlines.filter((item) => {
    const state = itemState[item.id];
    if (state && state.removed) {
      // Removed items stay hidden, except: while the id is in this
      // session's just-removed set we render an Undo card in its place
      // (handled in render(), so keep the item in the pipeline).
      if (!justRemovedThisSession.has(item.id)) return false;
    }
    if (activeCourseFilter !== "all" && item.orgUnitId !== activeCourseFilter) {
      return false;
    }
    return true;
  });
}

function render(deadlines, lastRefreshed, lastError) {
  if (deadlines !== undefined) cachedDeadlines = deadlines || [];
  listEl.innerHTML = "";

  if (lastError) {
    statusEl.textContent = `Couldn't reach Learn — showing last saved list. (${lastError})`;
  } else if (lastRefreshed) {
    try {
      statusEl.textContent = `Updated ${new Date(lastRefreshed).toLocaleTimeString()}`;
    } catch {
      statusEl.textContent = "";
    }
  } else {
    statusEl.textContent = "";
  }

  const visible = getVisibleDeadlines();

  if (!visible || visible.length === 0) {
    summaryEl.textContent =
      cachedDeadlines.length === 0
        ? "Nothing due today."
        : "No deadlines match this filter.";
    if (cachedDeadlines.length === 0) {
      listEl.innerHTML = `<div class="empty">No deadlines found yet. If you just installed this, click refresh, and make sure you're logged into Learn.</div>`;
    }
    return;
  }

  const groups = groupDeadlines(
    visible.filter((item) => {
      const state = itemState[item.id];
      return !(state && state.removed);
    })
  );
  // Undo cards are rendered in place — collect them separately so the
  // layout position matches the original card's group.
  const undoItems = visible.filter(
    (item) => itemState[item.id] && itemState[item.id].removed
  );
  renderSummary(groups);

  const order = ["Today", "This week", "Next week", "Later"];
  for (const label of order) {
    const items = groups[label];
    // Interleave any session-removed undo cards that belonged to this group
    // by original sort position (deadlines are pre-sorted by due date).
    const groupUndo = undoItems.filter((u) => {
      const g = groupDeadlines([u]);
      return g[label] && g[label].length === 1;
    });
    const combined = [...items];
    // Simplest stable approach: undo cards for this group render at the top
    // of their original group so layout doesn't jump pages.
    if (items.length === 0 && groupUndo.length === 0) continue;

    const heading = document.createElement("div");
    heading.className = "group-title";
    heading.textContent = label;
    listEl.appendChild(heading);

    for (const item of groupUndo) {
      listEl.appendChild(renderUndoCard(item));
    }
    for (const item of items) {
      listEl.appendChild(renderCard(item));
    }
  }

  if (groups._undated && groups._undated.length) {
    const heading = document.createElement("div");
    heading.className = "group-title";
    heading.textContent = "No date";
    listEl.appendChild(heading);
    for (const item of groups._undated) {
      listEl.appendChild(renderCard(item));
    }
  }
}

function renderCard(item) {
  const state = itemState[item.id] || {};
  const el = document.createElement("div");
  el.className = "item" + (state.checked ? " checked" : "");

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "check";
  checkbox.checked = !!state.checked;
  checkbox.setAttribute("aria-label", "Mark as done");
  checkbox.addEventListener("click", (e) => e.stopPropagation());
  checkbox.addEventListener("change", async () => {
    await setItemState(item.id, { checked: checkbox.checked });
  });

  const body = document.createElement("div");
  body.className = "body";
  body.innerHTML = `
    <div class="title">${escapeHtml(item.title)}</div>
    <div class="meta">${escapeHtml(item.courseCode || item.courseName || "")} · ${escapeHtml(item.type || "")}</div>
  `;
  body.addEventListener("click", () => {
    // No `tabs` permission per spec — open via a plain anchor/new tab.
    window.open(itemUrl(item), "_blank", "noopener");
  });

  const due = document.createElement("div");
  due.className = "due";
  due.textContent = formatDue(item.dueDate);

  const removeBtn = document.createElement("button");
  removeBtn.className = "remove";
  removeBtn.textContent = "✕";
  removeBtn.title = "Remove";
  removeBtn.setAttribute("aria-label", "Remove this deadline");
  removeBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    justRemovedThisSession.add(item.id);
    await setItemState(item.id, { removed: true });
  });

  el.appendChild(checkbox);
  el.appendChild(body);
  el.appendChild(due);
  el.appendChild(removeBtn);
  return el;
}

function renderUndoCard(item) {
  const el = document.createElement("div");
  el.className = "item undo";
  const label = document.createElement("span");
  label.className = "undo-label";
  label.textContent = `Removed "${item.title}"`;
  const btn = document.createElement("button");
  btn.className = "undo-btn";
  btn.textContent = "Undo";
  btn.addEventListener("click", async () => {
    justRemovedThisSession.delete(item.id);
    await setItemState(item.id, { removed: false });
  });
  el.appendChild(label);
  el.appendChild(btn);
  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function setItemState(id, patch) {
  const current = itemState[id] || {};
  itemState[id] = { ...current, ...patch };
  try {
    await chrome.storage.local.set({ itemState });
  } catch {
    // Storage failure shouldn't break the panel render.
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
    "themePreference",
  ]);
  cachedDeadlines = stored.deadlines || [];
  cachedCourses = stored.courses || deriveCourses(cachedDeadlines);
  itemState = stored.itemState || {};
  applyThemePreference(stored.themePreference);
  renderFilters();
  render(cachedDeadlines, stored.lastRefreshed, stored.lastError);
}

function deriveCourses(deadlines) {
  // Fallback if `courses` was stored by an older worker version.
  const map = new Map();
  for (const d of deadlines || []) {
    if (!map.has(d.orgUnitId)) {
      map.set(d.orgUnitId, {
        orgUnitId: d.orgUnitId,
        name: d.courseName,
        code: d.courseCode,
      });
    }
  }
  return [...map.values()];
}

refreshBtn.addEventListener("click", async () => {
  statusEl.textContent = "Refreshing…";
  await chrome.runtime.sendMessage({ type: "REFRESH_NOW" });
  await load();
});

settingsBtn.addEventListener("click", openSettings);
backBtn.addEventListener("click", closeSettings);

for (const option of themeOptionEls) {
  option.addEventListener("click", () => setThemePreference(option.dataset.themePreference));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") {
    if (changes.themePreference) applyThemePreference(changes.themePreference.newValue);
    if (changes.deadlines || changes.lastError || changes.courses) load();
  }
});

load();
