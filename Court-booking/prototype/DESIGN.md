---
name: Court Clean Minimal
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#3f493f'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#6f7a6e'
  outline-variant: '#becabc'
  surface-tint: '#006d30'
  primary: '#00652c'
  on-primary: '#ffffff'
  primary-container: '#15803d'
  on-primary-container: '#d3ffd5'
  inverse-primary: '#79db8d'
  secondary: '#565e74'
  on-secondary: '#ffffff'
  secondary-container: '#dae2fd'
  on-secondary-container: '#5c647a'
  tertiary: '#53585b'
  on-tertiary: '#ffffff'
  tertiary-container: '#6b7073'
  on-tertiary-container: '#f0f4f8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#95f8a7'
  primary-fixed-dim: '#79db8d'
  on-primary-fixed: '#00210a'
  on-primary-fixed-variant: '#005323'
  secondary-fixed: '#dae2fd'
  secondary-fixed-dim: '#bec6e0'
  on-secondary-fixed: '#131b2e'
  on-secondary-fixed-variant: '#3f465c'
  tertiary-fixed: '#dfe3e7'
  tertiary-fixed-dim: '#c3c7cb'
  on-tertiary-fixed: '#171c1f'
  on-tertiary-fixed-variant: '#43474b'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display:
    fontFamily: Plus Jakarta Sans
    fontSize: 40px
    fontWeight: '600'
    lineHeight: 48px
    letterSpacing: -0.02em
  display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

The design system embodies a calm, purposeful, and ultra-minimal athletic aesthetic tailored for effortless court reservations. Built for community players, club members, and facility operators alike, the interface strips away cognitive overload to focus entirely on availability, scheduling, and seamless confirmation.

### Design Movement
The system relies on high-order **Minimalism** blended with quiet European editorial restraint:
- **Calm Utility:** Information architecture prioritizes clarity over ornamentation. Visual hierarchy is established through disciplined typographic scales, crisp alignment, and deliberate white space rather than heavy decorative elements.
- **Natural Tactility:** Digital courts evoke the quiet focus of morning play—crisp whites, grounding slate, and subtle lawn-inspired emerald accents.
- **Zero Distraction:** No gamified badges, high-saturation neon highlights, flashing alerts, or synthetic skeuomorphism. Interactive states remain understated, reactive, and reassuring.

## Colors

The color palette prioritizes calm contrast, outdoor sport references, and effortless readability under diverse lighting conditions.

### Palette Architecture
- **Primary (`#15803D` / Deep Emerald):** Reserved for high-value actions, confirmed bookings, and primary calls to action. A secondary green (`#16A34A`) serves strictly for active hover states and available booking indicator dots.
- **Secondary (`#0F172A` / Slate Charcoal):** Used for primary typography, authoritative headings, focused outlines, and prominent structural markers.
- **Tertiary (`#F1F5F9` / Cool Slate Grey):** Applied to inactive slot fills, subtle pill backgrounds, and structural table headers.
- **Neutral Surface (`#F8FAFC` / Warm Off-White):** Canvas backdrop creating a gentle, glare-free reading surface compared to stark pure white.
- **Pure White (`#FFFFFF`):** Applied exclusively to cards, active selection tiles, popovers, and elevated modal surfaces.
- **Border / Divider (`#E2E8F0`):** Soft, structural boundary tone ensuring clear element separation without high visual weight.
- **Muted Text (`#64748B`):** Secondary typography, metadata, timestamps, and structural labels.

## Typography

Typographic choices prioritize clarity, neutral geometry, and open letterforms. `Plus Jakarta Sans` provides approachable, modern humanist details that maintain high legibility across schedule grids, small time slots, and high-density court listings.

### Implementation Rules
- Headings use medium and semibold weights (`500`/`600`), avoiding extreme black or heavy display cuts to maintain visual calm.
- Numerical values (times, court numbers, price tallies) utilize tabular figures (`font-variant-numeric: tabular-nums`) to ensure alignment across booking matrix rows.
- Uppercase styling is limited exclusively to `label-sm` elements (such as court tags, AM/PM markers, and status indicators) with light tracking (`0.04em`).

## Layout & Spacing

The layout is built around an open, content-first grid that prevents visual congestion even during peak schedule displays.

### Grid Architecture
- **Desktop (1024px+):** 12-column grid, max-width `1200px` centered, with `2rem` outer margins and `1.5rem` gutters.
- **Tablet (768px - 1023px):** 8-column fluid layout with `1.5rem` outer margins and `1rem` gutters.
- **Mobile (< 768px):** 4-column fluid layout with `1rem` outer margins. Slot pickers reflow into horizontal date carousels paired with vertical court lists.

### Spacing Principles
- Consistent base factor of `8px` (`0.5rem`).
- Internal container gaps never compress below `space-sm` (`0.5rem`).
- Form groups, schedule cards, and summary sheets maintain generous separation to avoid mis-taps during mobile booking.

## Elevation & Depth

This design system uses a flat, architectural layering system grounded in **low-contrast outlines** and **subtle tonal surfaces** rather than dramatic drop shadows.

### Depth Hierarchy
1. **Base Layer (Canvas):** Tone `#F8FAFC`. Houses layout scaffolding, calendar headers, and passive navigation.
2. **Surface Layer (Cards & Grids):** Pure `#FFFFFF` resting over `#F8FAFC`. Delimited by a crisp `1px solid #E2E8F0` border.
3. **Selected / Active Layer:** White background framed with an active `2px solid #15803D` border. Zero displacement, zero shadow.
4. **Floating Panels (Modals, Context Menus, Floating Sheets):** `#FFFFFF` surface with `1px solid #E2E8F0` and an ultra-diffused, ambient shadow:
   - `box-shadow: 0 8px 30px -4px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.03)`

## Shapes

The design system applies a balanced, modern border radius (`0.5rem` base) to project approachability without looking toy-like or juvenile.

### Radius Assignments
- **Inputs, Buttons, Time Slot Badges:** `0.5rem` (`roundedness: 2`).
- **Cards, Court Containers, Calendar Matrices:** `0.75rem` (`rounded-lg`).
- **Modal Dialogs & Slide-overs:** `1rem` (`rounded-xl`).
- **Status Indicators & Filter Chips:** Full-pill (`9999px`) where continuous contour signals toggleable states.

## Components

### Buttons
- **Primary:** Background `#15803D`, text `#FFFFFF`, border `none`, padding `0.625rem 1.25rem`. Hover: `#16A34A`. Active: `#14532D`.
- **Secondary:** Background `#FFFFFF`, text `#0F172A`, border `1px solid #E2E8F0`, padding `0.625rem 1.25rem`. Hover: background `#F8FAFC`, border `#CBD5E1`.
- **Ghost:** Background transparent, text `#64748B`, padding `0.5rem 1rem`. Hover: text `#0F172A`, background `#F1F5F9`.

### Chips & Filter Pills
- Base: Height `34px`, border-radius `9999px`, font `label-md`, background `#FFFFFF`, border `1px solid #E2E8F0`, text `#0F172A`.
- Active / Selected: Background `#F0FDF4`, border `1px solid #15803D`, text `#15803D`, font weight `600`.

### Time Slot Tiles
- Individual booking slots within the court matrix are styled as clear interactive tiles:
  - **Available:** `#FFFFFF` background, border `1px solid #E2E8F0`, text `#0F172A`. Hover: border `#15803D`, background `#F0FDF4`.
  - **Selected:** `#15803D` background, text `#FFFFFF`, border `1px solid #15803D`.
  - **Reserved / Unavailable:** `#F8FAFC` background, text `#94A3B8`, border `1px dashed #E2E8F0`, cursor not-allowed.

### Form Inputs
- Background `#FFFFFF`, border `1px solid #E2E8F0`, text `#0F172A`, border-radius `0.5rem`, padding `0.625rem 0.875rem`.
- Focus ring: `2px solid #15803D` outline offset by `1px`. Error state uses `#DC2626` outline without layout shift.

### Checkboxes & Radios
- Size `18px x 18px`, border `1.5px solid #CBD5E1`, border-radius `4px` (checkbox) or `50%` (radio).
- Checked: Background `#15803D`, border-color `#15803D`, white checkmark or center pip.

### Cards & Court Panels
- Background `#FFFFFF`, border `1px solid #E2E8F0`, border-radius `0.75rem`, padding `1.5rem`.
- Header houses court designation (`headline-sm`) alongside surface tags (e.g., "Indoor CushionX", "Outdoor Acrylic") set in `label-sm` muted text.
- Footer features straightforward pricing per hour and a prominent slot action button.