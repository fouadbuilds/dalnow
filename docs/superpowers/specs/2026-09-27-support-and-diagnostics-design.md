# DALnow support and diagnostics design

## Goal

Add a clear signed-out recovery state, improve reminder/settings clarity, and
provide a privacy-safe bug-report page. Preserve all existing deadline,
reminder, storage, and course-filter behavior.

## Signed-out recovery

The service worker persists a typed `liveStatus` after every refresh. Its
`outcome` is one of `success`, `not-signed-in`, `network-error`, or `api-error`.
`getApiVersions`, `apiGet`, and every per-course getter must convert 401/403 to
`not-signed-in` and propagate that outcome rather than silently treating an
auth failure as an empty endpoint. A successful refresh overwrites the status
with `success`; it never leaves an earlier failure active. `REFRESH_NOW`
responds with that latest outcome.

When the latest outcome is `not-signed-in` and there are no cached deadlines to
show, Home renders a clay card instead of the generic empty message.

The card contains:

- **Sign in to Brightspace first**
- “DALnow reads Brightspace through the session in this browser. Open
  Brightspace and sign in. Your deadlines show up here once a Learn page
  loads. If they don't, select Try again.”
- **Open Brightspace**, an ordinary secure link to `https://dal.brightspace.com`
  that opens in a new tab.
- **Try again**, which invokes the existing `REFRESH_NOW` flow.

The generic empty state remains for a successful empty read. A failed refresh
with cached deadlines continues to show those cached deadlines and the existing
non-blocking error status.

## Clay interaction corrections

- Buttons only lift slightly on hover. Presses use a small scale/depth change;
  no broad card lift or long movement is introduced.
- Date-range text inside group headings is not underlined. The group label keeps
  the gold underline.
- Deadline titles change colour to the link blue on hover, with no underline.
- The affiliation footer is centred.
- The settings icon uses the existing inline Lucide-style SVG grammar and is
  sized/aligned consistently with refresh and back icons.
- Typography and component dimensions reduce slightly but remain above the
  existing compact-side-panel readability threshold.

## Course colour treatment

The ten course token values may be replaced with brighter, visually distinct
values that remain legible against the clay ground. Course colour remains only
for course identifiers: filter dots, deadline pills, and the course setting
badge. The settings badge has a small rounded rectangle rather than a pill and
uses a flat, matte fill (no inset highlight or glow).

## Reminder controls and settings order

Each reminder slider exposes its destination below the track: `7` at the left,
descending to `0`, and **Morning of** at the right. The visual direction is
reversed so the displayed scale agrees with the existing `0 = Morning of`
storage semantics. The live label above the track remains the selected value.
The stored value, `aria-valuenow`, and label retain that existing semantic:
left/pointer at 7 saves `7`; right/pointer at Morning of saves `0`; Arrow keys
must adjust and announce the same values without a visually reversed but
semantically inverted result.

Settings is ordered as follows:

1. Reminders / deadline type cards.
2. Courses, with “Your courses show up here after DALnow reads Brightspace.”
   if there are none.
3. Notification guidance: “Notifications only show while Chrome is open. To
   keep getting them after you close every Chrome window, turn on Continue
   running background apps in Chrome's system settings.” The setting phrase is
   an underlined button that reveals a small in-page clay instruction card:
   **Keep reminders coming after you close Chrome** followed by the three
   Chrome menu instructions supplied by the user.
4. Appearance: Match system / Light / Dark; existing preference behavior stays.
5. My data explanation and Delete my data action.
6. Report a bug entry point.
7. Centred non-affiliation footer.

## Bug report page

`extension/options/` gains `debug.html` and `debug.js`; its styles remain in
`extension/styles/` and reuse the extension's tokens. The manifest declares
this as the extension options page. Selecting **Report a bug** from Settings
opens that page. The expandable Chrome help card says exactly:

**Keep reminders coming after you close Chrome**

1. Open the three-dot menu at the top right of Chrome.
2. Choose Settings, then System in the left sidebar.
3. Turn on **Continue running background apps when Google Chrome is closed.**

The page presents this structure and literal labels: **Report a Bug**;
**Debug report**; “Send the debug report via Instagram @fouaden_ and he might
buy you  Subway :). Your Brightspace info is not in the report (you can check
it first by pasting it somewhere and Ctrl+F your info).”; a **Last live read**
summary; **Copy debug info**; and “Not affiliated with Brightspace or Dalhousie
University.” Copy uses the clipboard API and reports success/failure without
navigating away.

The service worker overwrites one bounded `liveDebug` object per refresh; it
does not accumulate diagnostic history. Its allowed keys are exactly `kind`
(`dalnow-live-debug`), `version`, `base` (`https://dal.brightspace.com` only),
`run` (`refresh`), `outcome` (the four symbolic outcomes above), `startedAt`,
`finishedAt`, `counts` (`courses` and `deadlines` numeric/null only),
`failedRequests` (number), `requests` (at most 50 entries), and
`lastLiveRead` (an object with only `at` as an ISO timestamp/null and `message`
as one of these fixed templates: “Read {courses} courses and {deadlines}
deadlines.”, “Brightspace was not signed in.”, “DALnow could not complete the
last read.”). Each request has only `endpoint` (one of exactly
`/d2l/api/versions/`, `/d2l/api/lp/{v}/users/whoami`,
`/d2l/api/lp/{v}/enrollments/myenrollments/`,
`/d2l/api/le/{v}/{orgUnitId}/dropbox/folders/`,
`/d2l/api/le/{v}/{orgUnitId}/quizzes/`, or
`/d2l/api/le/{v}/{orgUnitId}/discussions/`), `status` (number/null), `ms`
(number), and `via` (`worker` only). Errors are represented only by the
top-level outcome; error messages, exception names/stacks,
interpolated paths, org-unit IDs, URLs/query strings, headers/cookies, response
bodies, response shapes, user identity, course names/codes, and deadline titles
are prohibited. The options page serializes this object with JSON indentation;
the user can inspect it before sharing.

## Verification

- Signed-out card appears only for `not-signed-in` plus no cached deadlines;
  both actions work.
- Generic empty and cached-error states remain distinct.
- Home and Settings show the reduced motion, heading range, title hover,
  course badge, footer, slider scale, and icon corrections in both themes.
- Notification instructions expand and collapse without losing keyboard focus.
- Verify both slider endpoints and an intermediate value by pointer and
  keyboard, confirming the visual scale, stored value, and live label agree.
- Options page opens, its summary agrees with stored `liveDebug`, and copied
  JSON contains no course/title/identity/body fields.
- Exercise 401/403 sign-out resulting in the persisted `not-signed-in` outcome,
  a non-auth network/API failure, and a per-course auth failure. In every copied
  result, inspect for literal course/org-unit IDs,
  URLs/query strings, headers/cookies, response/error bodies, and stack/error
  text. Confirm only the current report is stored after repeated refreshes.
- Confirm the new page and local stylesheet/font links resolve in an unpacked
  extension.
