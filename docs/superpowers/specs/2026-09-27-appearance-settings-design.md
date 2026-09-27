# Phase 2 Appearance Settings Design

## Scope

Add DalNow's Phase 2 appearance preference: `system` (default), `light`, or
`dark`. It is a local presentation setting only; it adds no permissions,
network calls, background-worker behavior, or data sharing.

## User experience

Selecting the existing header settings icon replaces the deadline view with a
small Settings view. A Back button returns to the same deadline panel. The
view has one Appearance section containing an accessible segmented control:
System, Light, and Dark. System is selected by default and follows the
operating system preference.

Selecting a segment changes the panel immediately and persists the selection.
The control uses native buttons with clear pressed-state semantics, so it is
usable by keyboard and assistive technology.

## Data flow

The panel reads and writes `themePreference` in `chrome.storage.local`. The
value is validated against `system`, `light`, and `dark`; invalid or missing
values fall back to `system`. The panel applies a document-level theme marker:
manual values override the existing media-query color tokens, while System
continues to rely on `prefers-color-scheme`.

## Boundaries and error handling

This phase is intentionally contained in the side-panel HTML, CSS, and
JavaScript. It does not alter deadline aggregation or the background service
worker. A storage failure leaves the selected appearance visible for the
current panel session and does not interrupt navigation or deadline rendering.

## Verification

Manually verify the default System state, immediate Light and Dark changes,
persistence after closing and reopening the panel, System behavior under both
operating-system color schemes, keyboard operation, and Back navigation.
