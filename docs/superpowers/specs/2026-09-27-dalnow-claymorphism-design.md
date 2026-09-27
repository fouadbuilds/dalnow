# DalNow claymorphism design

## Goal

Restyle the existing DalNow extension to match the supplied WatNow-inspired
claymorphism references without changing its deadline, filtering, reminder,
storage, or navigation behavior. The panel should feel like soft modelling clay
on a powder-blue ground rather than a dark utility dashboard.

## Visual direction

Light mode is the primary expression: a powder-blue page ground with gently
varied blue glows, off-white sculpted surfaces, and a single coherent clay
lighting model. Each raised surface has a soft outer shadow, a darker inset
edge at lower-right, and a bright inset edge at upper-left. Dark mode remains
available through the existing Light / Dark / System preference and uses the
same material model under a dim indigo lamp.

DalNow's existing Wingtip Black, Cloud White, and Beak Gold remain the brand
palette. Gold is deliberately scarce: the mark, primary controls, the active
filter, section underlines, and high-attention date treatment. Course colors
retain their existing identity and remain reserved for course chips and pills.
They will be expressed as lighter clay/highlighter surfaces rather than
introducing unrelated brand colors.

## Typography and assets

- Bundle Schibsted Grotesk locally as the display and interface typeface:
  wordmark, headings, course chips, primary labels, and deadline titles.
- Bundle DM Sans locally as the body typeface: supporting copy, dates,
  metadata, settings guidance, and status text.
- Replace the Public Sans asset and its associated local licence/style files.
  Font files stay inside `extension/assets` and are referenced only from
  extension-local CSS, preserving offline operation and extension CSP
  compatibility.

## Component treatment

### Home

- Remove the flat, sticky header bar. The logo/wordmark and round refresh and
  settings controls float directly on the powder-blue ground.
- Make summary content an oversized pale-clay slab with strong display
  hierarchy; it presents the current deadline summary without changing its
  wording logic.
- Use rounded, sculpted filter pills. The selected All or course filter uses
  gold; inactive course filters use a neutral clay base with a small coloured
  course dot.
- Give group headings a heavy display face and gold underline rather than a
  divider. Date-range text remains secondary.
- Make each deadline a large soft card: carved square checkbox, course pill,
  type icon and label, bold linked title, and right-aligned due state. Urgent
  or changed dates use the existing danger/gold emphasis while ordinary dates
  use ink. The entire card remains static on hover; controls and the title
  retain their discrete interaction states.

### Settings

- Use the same floating back control and ground as Home; there is no flat
  header bar.
- Render reminder rows and course rows as carved clay cards. Sliders have a
  recessed track and gold sculpted thumb. Switches have a recessed neutral
  track and a raised knob, becoming gold when on.
- Keep the existing three-option appearance control but make it a clay groove
  with a raised active segment.
- Keep destructive data actions visibly distinct through the established red
  danger role; they retain clay depth but are never mistaken for a gold product
  action.

## Token and stylesheet architecture

`extension/styles/tokens.css` remains the token source. It will define light
and dark semantic roles, clay shadow recipes, type families, spacing, radii,
motion, and course colors. `extension/styles/styles.css` consumes those tokens
for every component. Values are not duplicated ad hoc in component rules.

The current `data-theme` preference behavior remains untouched. System uses
the OS media query; explicit Light and Dark selections continue to override it.

## Interaction, accessibility, and responsiveness

- Retain every current keyboard control, ARIA label, focus state, and storage
  behavior.
- Use visible high-contrast focus rings that fit the clay palette.
- Preserve reduced-motion behavior; presses use short transform and shadow
  changes only when motion is allowed.
- Keep the filter row wrapped and deadline cards usable at narrow side-panel
  widths. At small widths the due state moves below the main deadline content
  rather than causing horizontal overflow.

## Scope boundaries

No reminder scheduling, fetching, notification, data deletion, or deadline
business logic changes are part of this redesign. No new remote dependencies,
build step, or external font request is introduced.

## Verification

- Confirm font files and CSS links resolve from the unpacked extension.
- Verify Home and Settings in Light, Dark, and System modes.
- Check the existing refresh, filter, checkbox, remove/undo, reminder toggle,
  slider, course toggle, appearance, and Delete my data flows.
- Confirm narrow side-panel layouts remain readable and no controls are hidden
  or horizontally clipped.
