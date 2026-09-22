---
name: ui-layout-typography
description: Best practices for responsive UI layout, fluid typography, text containment, overflow prevention, and visual rhythm. Use when reviewing or implementing layouts to ensure text never clips or breaks boundaries, titles scale gracefully, modals and cards do not stretch awkwardly, and interactive controls maintain perfect touch targets.
---

# UI Layout, Containment & Typography Guidelines

## 1. The Container Containment Rule (Zero Overflow)

In CSS Flexbox and Grid layouts, text elements frequently overflow or push parent containers beyond the screen width because the default `min-width` of a flex/grid child is `auto`, NOT `0`.

### Hard Rule: Always apply `min-width: 0` to flex and grid containers with text:
```css
.flex-item-with-text,
.now-playing-info,
.track-meta,
.item-info,
.sidebar-item,
.modal-body {
  min-width: 0;
  max-width: 100%;
}
```

### Truncation Checklist:
1. **Single-line truncation** (titles, song names, file paths, author tags):
```css
.text-truncate {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
```
2. **Multi-line clamping** (descriptions, lyric snippets, card subtitles):
```css
.text-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}
```
3. **Paths / Raw URLs / Non-breaking tokens**:
```css
.code-path, .url-link {
  overflow-wrap: anywhere;
  word-break: break-word;
}
```

## 2. Fluid Typography Over Awkward Line Wrapping

When text is too large for its container (e.g. track titles in banners, modal headers, player titles), wrapping onto 3–4 lines stretches modals and cards awkwardly, pushing action buttons off screen.

### Hard Rule: Use `clamp()` for responsive text sizing:
- **Hero / Banner Titles**:
  `font-size: clamp(20px, 3.5vw, 44px);`
- **Modal Headers**:
  `font-size: clamp(18px, 2.5vw, 22px);`
- **Fullscreen Mobile Track Titles**:
  `font-size: clamp(18px, 5vw, 24px);`
- **Mini-Player Titles**:
  `font-size: clamp(12px, 3.5vw, 14px);`

Adjust line-height proportionally:
- Display/Headlines: `line-height: 1.15 - 1.25` (tight, connected)
- Body text: `line-height: 1.4 - 1.5`
- Small labels / metadata: `line-height: 1.2 - 1.3`

## 3. Modal & Card Boundary Enforcement

Modals must NEVER overflow the screen or push action buttons out of reach:
```css
.modal-overlay {
  padding: 16px;
  overflow-y: auto;
}

.modal-card {
  width: 480px;
  max-width: 100%;
  max-height: calc(100dvh - 32px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modal-body {
  overflow-y: auto;
  overscroll-behavior: contain;
  flex: 1;
}

.modal-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
```

## 4. Touch Targets & Safe Spacing

1. **Interactive Zones**: All clickable buttons and icons must have at least 40×40px (desktop) and 44×44px (mobile) touch targets, even if the visible SVG icon is 16–20px.
2. **Safe Areas**:
   - `padding-top: calc(12px + env(safe-area-inset-top, 0px));`
   - `padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));`
3. **No Horizontal Scroll on Page**:
   `overflow-x: hidden; width: 100vw; max-width: 100%;`

## 5. Visual Hierarchy & Contrast

1. **Primary text**: High contrast (`#ffffff` or equivalent).
2. **Secondary text**: Subdued (`#b3b3b3` / `rgba(255,255,255,0.7)`).
3. **Muted metadata / timings**: Tabular numbers (`font-variant-numeric: tabular-nums`), `#a7a7a7`.
4. **Spacing scale**: Strict 4px/8px rhythm (4, 8, 12, 16, 24, 32px).
