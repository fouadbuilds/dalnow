# Changelog

All notable changes to DALnow are documented here, grouped by impact for
consumers. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-26

### Added
- Chrome extension scaffold (Manifest V3) with side panel — `extension/manifest.json`, `extension/panel/sidepanel.html`
- Side panel deadline grouping (Overdue / Today / This week / Next week / Later) and locale-aware due-date formatting — `extension/panel/sidepanel.js`
- Side panel styles — `extension/panel/sidepanel.css`
- Background service worker with Valence API version discovery (`/d2l/api/versions/`) and GET-only fetches for enrollments, assignments, quizzes, and discussions — `extension/src/background.js`
- App icons (16/48/128) — `extension/icons/`
- Localization (en/fr) — `extension/_locales/`

[0.1.0]: https://github.com/fouadbuilds/DALnow/releases/tag/v0.1.0



# DalNow — Phase 2 Build Spec (Settings, Reminders, Appearance, My Data)

Builds directly on the Phase 1 spec (`dalnow-phase1-spec.md`). Nothing in
Phase 1's architecture, past-due rule, or checkbox/remove/undo behavior
changes here — this phase only adds the settings panel and the new
capabilities it exposes.

---

## New manifest requirement

Add the `"notifications"` permission:

```json
"permissions": ["storage", "sidePanel", "alarms", "notifications"]
```

Everything else in the manifest (host permissions, background/side panel
paths) is unchanged from Phase 1.

---

## 1. Reminder system

### What triggers a reminder

For each active (non-past-due, non-removed) item, on every background
refresh cycle (same 30-min alarm from Phase 1 — no new alarm needed), check
whether the item has newly crossed into a reminder window since the last
check.

- Lead times: **1 day, 2 days, 3 days before due date** — independently
  toggleable, any combination can be active at once (multi-select, not
  single-choice).
- "Morning of" is **not** a separate control — it's simply what the
  closest enabled lead-time reminder naturally covers when the due date
  arrives. No distinct "morning of" toggle exists.
- Granularity: **per item-type only** (assignment / lab / quiz /
  discussion), applied uniformly across all courses — no per-course
  toggle in this phase.

### Avoiding duplicate/repeated notifications

Each item needs a new persisted field (alongside `checked`/`removed` from
Phase 1), tracking which lead-time thresholds have already fired for it:

```js
// per item id, e.g. "dropbox-320739"
remindersFired: { "3day": false, "2day": false, "1day": false }
```

On each refresh cycle, for each active item and each **enabled** lead-time
setting:

1. Compute `dueDate - leadDays` → the threshold moment.
2. If `now >= threshold` **and** `remindersFired[leadKey]` is still
   `false` → fire the reminder (see below) and set
   `remindersFired[leadKey] = true`.
3. If a lead-time setting is toggled off, simply skip evaluating it — no
   retroactive firing if it's turned back on later (avoids a flood of
   "overdue" reminders for thresholds that passed while the setting was
   off).

This guarantees each threshold fires **exactly once** per item, no matter
how many refresh cycles happen between crossing the threshold and the due
date.

### What firing a reminder actually does (combined behavior, no separate toggle)

A single event does both of the following — there is no setting to
decouple them:

- **Chrome notification**: `chrome.notifications.create()` with the item's
  title, course code, and due date/time.
- **Panel highlight**: the corresponding card gets a visual highlight
  state next time the panel is open/rendered (e.g. a colored left border
  or subtle background tint) until the user views/interacts with it.

### Clicking the notification

Recommended and confirmed: clicking a fired notification should **open
the side panel**, ideally scrolled/focused to that specific item. Use
`chrome.notifications.onClicked` → `chrome.sidePanel.open(...)`. If
scrolling directly to the item proves fiddly given side-panel APIs, a
reasonable fallback is opening the panel with that item pre-highlighted at
minimum — full scroll-to-item is a nice-to-have, not a hard requirement.

---

## 2. Settings panel — structure

Opened via the settings button in the header (currently a no-op placeholder
from Phase 1 — now wire it to actually open this panel).

### Section: Reminders
- Three toggles: **3 days before**, **2 days before**, **1 day before**
  (each independently on/off, multi-select as decided above)
- Four toggles, one per item type: **Assignments**, **Labs**, **Quizzes**,
  **Discussions** — each on/off, applied globally across all courses (no
  per-course granularity this phase)
- A reminder only actually fires if both its lead-time toggle AND the
  relevant type toggle are on

### Section: Appearance
- Three-way control: **Light / Dark / System** (System = respect OS
  preference via the existing `prefers-color-scheme` CSS, which already
  exists from Phase 0/1)
- Manual Light/Dark choice overrides the CSS media query — needs a small
  JS layer to apply an explicit class/attribute when the user picks a
  manual mode, falling back to the media query only when System is
  selected

### Section: My Data
- Plain-language explanation, roughly: *"DalNow reads your Brightspace
  deadlines using the login session you already have in this browser. It
  never sees or stores your password. Nothing is sent to any server —
  everything shown here stays on this device."*
- **Delete my data** button — confirmed scope: wipes **everything** in
  `chrome.storage.local`, meaning:
  - Cached deadlines
  - `checked` / `removed` per-item state
  - `remindersFired` per-item state
  - Reminder toggle settings (lead-times + type toggles)
  - Appearance preference
  - This is a full reset to first-install state, not a partial clear —
    confirmed deliberately, since a button called "delete my data" that
    quietly keeps some preferences around would undercut its own purpose
  - Should trigger a background refresh immediately after clearing, so the
    panel doesn't sit empty — it repopulates deadline data (with all
    checked/removed/reminder state freshly reset) rather than looking
    broken

---

## Storage schema additions (on top of Phase 1's per-item `checked` /
`removed`)

```js
// per item, e.g. under key "item:dropbox-320739"
{
  checked: false,
  removed: false,
  remindersFired: { "3day": false, "2day": false, "1day": false }
}

// global settings, e.g. under key "settings"
{
  reminderLeadTimes: { "3day": true, "2day": true, "1day": true },
  reminderTypes: { assignment: true, lab: true, quiz: true, discussion: true },
  appearance: "system" // "light" | "dark" | "system"
}
```

---

## Explicitly still out of scope

- Full visual/UX redesign pass — still deliberately last, unaffected by
  this phase
- Per-course reminder toggles (only per-type exists this phase)
- Any server-side or cross-device sync of settings — everything here is
  still `chrome.storage.local`, single-browser, single-device, consistent
  with the whole project's no-backend stance