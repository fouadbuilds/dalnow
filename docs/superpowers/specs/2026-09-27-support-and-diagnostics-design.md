# DALnow support and diagnostics design

## Goal

Add a clear signed-out recovery state, improve reminder/settings clarity, and
provide a privacy-safe bug-report page. Preserve all existing deadline,
reminder, storage, and course-filter behavior.

## Signed-out recovery

When the last live refresh fails with the existing `NOT_LOGGED_IN` outcome and
there are no cached deadlines to show, Home renders a clay card instead of the
generic empty message.

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
opens that page.

The page presents the exact supplied structure: Report a Bug; Debug report;
Instagram guidance; a last-live-read summary; **Copy debug info**; and the
non-affiliation footer. Copy uses the clipboard API and reports success/failure
without navigating away.

The service worker records a bounded `liveDebug` object for each refresh. It
contains only operational metadata: `kind`, extension version, base origin,
run/outcome, start/finish timestamps, success counts, failure count, endpoint
template, status, duration, and transport context. It does **not** include
course names or codes, deadline titles, Brightspace user identity, request
cookies, authorization headers, response bodies, response shapes, or full URLs
with user data. The options page serializes that object with JSON indentation;
the user can inspect it before sharing.

## Verification

- Signed-out card appears only for `NOT_LOGGED_IN` plus no cached deadlines;
  both actions work.
- Generic empty and cached-error states remain distinct.
- Home and Settings show the reduced motion, heading range, title hover,
  course badge, footer, slider scale, and icon corrections in both themes.
- Notification instructions expand and collapse without losing keyboard focus.
- Options page opens, its summary agrees with stored `liveDebug`, and copied
  JSON contains no course/title/identity/body fields.
- Confirm the new page and local stylesheet/font links resolve in an unpacked
  extension.
