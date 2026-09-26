const listEl = document.getElementById("list");
const statusEl = document.getElementById("status");
const refreshBtn = document.getElementById("refreshBtn");

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function groupDeadlines(deadlines) {
  const now = new Date();
  const today0 = startOfDay(now);
  const tomorrow0 = new Date(today0);
  tomorrow0.setDate(tomorrow0.getDate() + 1);
  const weekEnd = new Date(today0);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const nextWeekEnd = new Date(today0);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 14);

  const groups = {
    Overdue: [],
    Today: [],
    "This week": [],
    "Next week": [],
    Later: [],
  };

  for (const d of deadlines) {
    const due = new Date(d.dueDate);
    if (due < now) groups.Overdue.push(d);
    else if (due < tomorrow0) groups.Today.push(d);
    else if (due < weekEnd) groups["This week"].push(d);
    else if (due < nextWeekEnd) groups["Next week"].push(d);
    else groups.Later.push(d);
  }
  return groups;
}

function formatDue(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function courseUrl(orgUnitId) {
  return `https://dal.brightspace.com/d2l/home/${orgUnitId}`;
}

function render(deadlines, lastRefreshed, lastError) {
  listEl.innerHTML = "";

  if (lastError) {
    statusEl.textContent = `Couldn't reach Learn — showing last saved list. (${lastError})`;
  } else if (lastRefreshed) {
    statusEl.textContent = `Updated ${new Date(lastRefreshed).toLocaleTimeString()}`;
  } else {
    statusEl.textContent = "";
  }

  if (!deadlines || deadlines.length === 0) {
    listEl.innerHTML = `<div class="empty">No deadlines found yet. If you just installed this, click refresh, and make sure you're logged into Learn.</div>`;
    return;
  }

  const groups = groupDeadlines(deadlines);

  for (const [label, items] of Object.entries(groups)) {
    if (items.length === 0) continue;

    const heading = document.createElement("div");
    heading.className = "group-title";
    heading.textContent = label;
    listEl.appendChild(heading);

    for (const item of items) {
      const el = document.createElement("div");
      el.className = "item";
      if (label === "Overdue") el.classList.add("overdue");
      if (label === "Today") el.classList.add("today");

      el.innerHTML = `
        <div class="title">${escapeHtml(item.title)}</div>
        <div class="meta">${escapeHtml(item.courseCode || item.courseName)} · ${item.type}</div>
        <div class="meta due">${formatDue(item.dueDate)}</div>
      `;
      el.addEventListener("click", () => {
        chrome.tabs.create({ url: courseUrl(item.orgUnitId) });
      });
      listEl.appendChild(el);
    }
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

async function load() {
  const { deadlines, lastRefreshed, lastError } = await chrome.storage.local.get([
    "deadlines",
    "lastRefreshed",
    "lastError",
  ]);
  render(deadlines, lastRefreshed, lastError);
}

refreshBtn.addEventListener("click", async () => {
  statusEl.textContent = "Refreshing…";
  await chrome.runtime.sendMessage({ type: "REFRESH_NOW" });
  await load();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && (changes.deadlines || changes.lastError)) {
    load();
  }
});

load();
