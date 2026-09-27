# Phase 2 Appearance Settings Design

## Scope

Add DalNow's Phase 2 appearance preference: `system` (default), `light`, or
`dark`. It is a local presentation setting only; it adds no permissions,
network calls, background-worker behavior, or data sharing.

## User experience

Selecting the existing header settings icon hides the existing deadline view
and shows a small Settings view. A clearly labelled Back button restores the
already-loaded deadline view without a refresh, preserving the active course
filter and current scroll position. Refresh is unavailable while Settings is
shown. The view has one Appearance section containing an accessible segmented
control: System, Light, and Dark. System is selected by default and follows
the operating system preference. The former no-op/"coming soon" label and
dimmed settings styling are removed.

Selecting a segment changes the panel immediately and persists the selection.
The control is a named Appearance group of native buttons; exactly one button
has `aria-pressed="true"`, and each has visible `:focus-visible` feedback. The
settings icon and Back button have accessible names.

## Data flow

The panel reads and writes `themePreference` in `chrome.storage.local`. The
value is validated against `system`, `light`, and `dark`; invalid or missing
values fall back to `system`. The panel applies a document-level theme marker.
Manual light and dark rules appear after the existing dark media query (or use
higher specificity) and set both the color tokens and `color-scheme` so native
controls match. System removes the marker and lets `prefers-color-scheme`
resume control.

## Boundaries and error handling

This phase is intentionally contained in the side-panel HTML, CSS, and
JavaScript. It does not alter deadline aggregation or the background service
worker. A storage failure leaves the selected appearance visible for the
current panel session and does not interrupt navigation or deadline rendering;
on reopening, the panel uses the last successfully stored value or System.

## Verification

Manually verify the default System state, immediate Light and Dark changes,
persistence after closing and reopening the panel, System behavior under both
operating-system color schemes, keyboard operation and visible focus, Back
navigation that preserves filter/scroll without refetching, and the
session-only fallback following a simulated storage failure.
