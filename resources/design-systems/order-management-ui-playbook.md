# Order Management UI Playbook

This document is the single source of truth for UI consistency across Counter, Production, Orders, and Sidebar flows.

## 1) Core Color System

Primary brand colors:

- Red 500: #E21E26 (RGB 226, 30, 38)
- Red 600 (hover): #C91820 (RGB 201, 24, 32)
- Blue 700: #174395 (RGB 23, 67, 149)
- Blue 800 (hover): #12367A (RGB 18, 54, 122)

Neutral system:

- Surface: #FFFFFF
- App background: slate-100
- Border: slate-200
- Text primary: slate-900
- Text secondary: slate-600 / slate-500

Semantic states:

- Success: emerald-50 / emerald-200 / emerald-700
- Warning and in-progress states must use red theme unless explicitly overridden by product rules.

## 2) Global Tokens (CSS Variables)

Reference values used by the app:

- --primary: #E21E26
- --primary-foreground: #ffffff
- --ring: #E21E26

Sidebar token baseline:

- --sidebar: #111318
- --sidebar-foreground: #cbd5e1
- --sidebar-primary: #E21E26
- --sidebar-primary-foreground: #ffffff
- --sidebar-accent: #E21E26
- --sidebar-accent-foreground: #ffffff
- --sidebar-border: #2b313d
- --sidebar-ring: #E21E26

## 3) Component Standards

### 3.1 Sidebar Active State

Use this exact visual for active item in both menu and submenu:

- background: #E21E26
- text: #FFFFFF
- radius: rounded-xl
- shadow: shadow-sm

Class standard:

- bg-[#E21E26] text-white rounded-xl shadow-sm

### 3.2 Timeline Button (Counter + Production)

Use a solid blue button with white text:

- border: #174395
- background: #174395
- text: #FFFFFF
- hover border: #12367A
- hover background: #12367A
- hover text: #FFFFFF

Class standard:

- h-7 border-[#174395] bg-[#174395] px-2 text-[11px] text-white transition-colors duration-150 ease-out hover:border-[#12367A] hover:bg-[#12367A] hover:text-white

### 3.3 Primary Action Button

Use red solid CTA:

- background: #E21E26
- text: #FFFFFF
- hover background: #C91820

Recommended class:

- rounded-lg bg-[#E21E26] text-white hover:bg-[#C91820]

### 3.4 Secondary Neutral Button

Use neutral border with readable text:

- background: #FFFFFF
- border: gray-100 or slate-200
- text: slate-500
- hover: slate-50 and slate-900

### 3.5 Badge Mapping

Production/status badges:

- In-progress, rejected, deposit, pending: red-themed outline
- Completed/paid: emerald-themed outline
- Shipping neutral display: slate-themed outline

Red badge pattern:

- border-[#E21E26]/25 bg-[#E21E26]/10 text-[#E21E26]

### 3.6 Table Behavior

- Header row: slate-50 surface
- Body row hover: slate-100
- Divider: slate-200
- Primary clickable code: red text with underline on hover

### 3.7 Dialog / Detail Panels

- Base panel: white + slate border
- Financial and highlighted info boxes: red-tinted background and border
- Avoid introducing cyan/orange accents in these panels.

## 4) Layout and Spacing Rules

- Use rounded-lg / rounded-xl / rounded-2xl consistently by hierarchy.
- Keep action buttons height consistent per zone:
    - small controls: h-7
    - filter controls: h-8
    - main actions: h-9
- Prefer slate neutral backgrounds for large container areas.

## 5) Do and Do Not

Do:

- Reuse the exact class strings for Sidebar active and Timeline button.
- Use token-driven colors first, hardcoded hex only for approved brand colors.
- Keep Counter and Production styles mirrored for shared patterns.

Do not:

- Introduce cyan, amber, or ad-hoc blue shades in production flow unless approved.
- Create alternative Timeline button styles in specific pages.
- Mix multiple visual patterns for the same semantic state.

## 6) QA Checklist Before Merge

- Timeline button in Counter is solid blue with white text.
- Timeline button in Production is the same as Counter.
- Sidebar active item is red with white text.
- Status and payment badges follow the red/emerald mapping.
- Table hover is slate-100.
- No legacy cyan/amber accents in updated screens.

## 7) Maintenance Workflow

When changing UI rules:

1. Update this playbook first.
2. Apply code changes across all affected domains.
3. Run visual pass on Counter, Production, Orders.
4. Record the final class standard in this file.

---

Last updated: 2026-07-30
Owner: Frontend UI Theme
