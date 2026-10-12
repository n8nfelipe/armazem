---
name: Armazém
description: A compact warehouse operations console with cream surfaces and forest-green structure.
colors:
  ink: "#1c2924"
  ink-soft: "#45544c"
  muted: "#7f8982"
  paper: "#f5f4ef"
  white: "#fffefa"
  line: "#dedfd7"
  line-strong: "#c9cec3"
  forest: "#294a3e"
  forest-light: "#e5ebe4"
  amber: "#c49342"
  red: "#a8473e"
  green: "#3d7458"
typography:
  display:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "clamp(29px, 3.2vw, 40px)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-1.6px"
  body:
    fontFamily: "Segoe UI, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.5
  operational:
    fontFamily: "SFMono-Regular, Consolas, Liberation Mono, monospace"
    fontSize: "11px"
    fontWeight: 400
rounded:
  square: "0px"
spacing:
  field-gap: "7px"
  row-gap: "15px"
  sheet-inline: "22px"
components:
  button-primary:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.white}"
    rounded: "{rounded.square}"
    height: "42px"
    padding: "0 16px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.square}"
    height: "42px"
  input:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    height: "42px"
    padding: "0 11px"
  table-frame:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.square}"
  status-badge:
    backgroundColor: "#f5f6f1"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.square}"
    padding: "2px 6px"
---

# Design System: Armazém

## Overview

**Creative North Star: "The Warehouse Ledger"**

Armazém reads as an editorial operations console: restrained cream work surfaces, a forest-green navigation rail, fine rules, and compact records. The hierarchy helps an inventory operator scan quantities, identify exceptions, and act on a specific record. The replenishment screen extends this established language.

The interface uses flat surfaces and structured density. Operational measurements, references, dates, and small labels use monospace; titles and explanatory text use the system sans stack. Color marks action and status while the ledger remains mostly neutral.

**Key Characteristics:**

- Cream workspace with a dark forest navigation rail.
- Squared sheets, controls, rows, and status badges separated by fine borders.
- Compact tabular records with prominent quantities and restrained supporting copy.
- Mobile layouts that reflow records into readable field groups.

## Colors

Forest is the primary action and navigation color. Paper and warm white carry the workspace; ink and muted greens establish reading order. Amber highlights the brand detail and selected navigation edge. Red and green communicate operational exceptions and positive states.

### Primary

- **Forest** (`colors.forest`): primary actions, selected controls, and important measurements.
- **Forest light** (`colors.forest-light`): quiet green surface treatment.

### Secondary

- **Warehouse amber** (`colors.amber`): small brand and selection accents, never the main work surface.

### Neutral

- **Paper** (`colors.paper`) and **warm white** (`colors.white`): workspace and sheets.
- **Ink** (`colors.ink`), **soft ink** (`colors.ink-soft`), and **muted** (`colors.muted`): primary, secondary, and low emphasis text.
- **Rule** (`colors.line`) and **strong rule** (`colors.line-strong`): ledger divisions and control outlines.

### Status

- **Red** (`colors.red`): negative inventory and destructive emphasis.
- **Green** (`colors.green`): positive inventory or completion emphasis.

**The Ledger Rule.** Use fine rules and tonal surfaces to organize information; reserve saturated color for action, selection, and status.

## Typography

**Display and body font:** Segoe UI with Arial and sans-serif fallbacks. **Operational font:** SFMono-Regular with Consolas, Liberation Mono, and monospace fallbacks.

### Hierarchy

- **Page title:** bold system sans using the `display` token; establishes the screen’s subject.
- **Section title:** bold system sans (19px on the core pages); names an operation or record group.
- **Body:** system sans using the `body` token; carries explanations, names, and form labels.
- **Operational label:** small monospace, often uppercase with added tracking; identifies columns, counts, references, and system states.
- **Operational number:** monospace with stronger size or weight; makes stock, cost, and sales values easy to compare.

**The Measurement Rule.** Show operational values in monospace and keep their units or context adjacent.

## Layout

Desktop uses a fixed navigation rail (234px), a sticky top bar (62px), and a centered content region capped at 1130px. Forms and ledgers use CSS grids with compact rows; sections are separated by measured vertical gaps rather than large empty areas. The replenishment table uses explicit columns for selection, product, inventory, forecast, suggestion, priority, and actions.

At 1080px the rail and grid columns tighten. At 760px and below, the rail becomes a top strip, controls and form grids reflow, table headings disappear, and records become grouped mobile layouts. The replenishment table uses a stacked record layout on mobile. Narrower viewport rules further reduce horizontal padding.

## Elevation & Depth

The work surfaces are flat. Background changes, one-pixel borders, and the dark rail establish depth. The active navigation item has a narrow inset amber edge; the interface does not rely on floating cards or ambient shadows. Visible focus uses a three-pixel amber outline with offset.

## Shapes

Sheets, inputs, buttons, tables, and badges use square corners. Fine borders define their edges. The small round status dot is a semantic exception, not a general radius pattern.

## Components

### Buttons

- **Primary:** forest fill, light text, square edge, minimum height of 42px; darkens on hover and shows a disabled state.
- **Quiet:** transparent surface with muted text; used for secondary actions.
- **Focus:** the shared visible amber outline remains present for keyboard navigation.

### Inputs and search

- **Fields:** white background, fine neutral border, square edge, and 42px control height. Focus shifts the border toward green.
- **Search:** a bordered warm-white container with a distinct visible focus outline.

### Sheets, ledgers, and record rows

- **Sheets:** warm-white surfaces with strong neutral borders and compact internal padding.
- **Ledgers:** pale header bands, regular row dividers, small monospace headings, and separate action space.
- **Mobile records:** reflow the same information into grouped rows; preserve labels and operational context when column headings are hidden.

### Navigation and badges

- **Navigation:** dark forest rail on desktop and compact top strip on mobile. The active item uses a lighter forest field and amber inset marker.
- **Badges:** square, thin bordered, compact monospace labels. Status colors change by meaning, with priority treatments on replenishment records.

## Do's and Don'ts

### Do:

- **Do** reuse the cream, forest, border, and type tokens from the global stylesheet.
- **Do** keep quantitative records compact, aligned, and readable on mobile.
- **Do** pair color-coded statuses with visible text.

### Don't:

- **Don't** introduce rounded cards or controls into the warehouse workspace.
- **Don't** use decorative shadows to organize ordinary sheets and tables.
- **Don't** hide record actions or measurement context when a table reflows.
