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
