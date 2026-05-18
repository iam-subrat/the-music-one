# Dark Theme + Dark Neumorphism Design Spec

**Date:** 2026-05-18  
**Status:** Approved

---

## Overview

Add a toggleable dark theme to MusicOne using CSS custom properties. Theme is a deep-indigo dark neumorphism using the same shadow formula as light mode, just with adjusted colors. Toggle lives in AuthBar. Preference persists in localStorage.

---

## CSS Variables

### Light (existing `:root`)

```css
--bg: #ecebf3;      --surface: #ecebf3;
--sd: #c5c4d0;      --sl: #ffffff;
--text: #2d2b3d;    --muted: #7a7891;    --icons: #4a4860;
--accent: #8874d1;  --accent2: #b09de8;
--accent-glow: rgba(118, 96, 199, 0.45);
--accent-soft: rgba(136, 116, 209, 0.10);
--modal-overlay: rgba(236, 235, 243, 0.7);
```

### Dark (`[data-theme="dark"]`)

```css
--bg: #1a1a2e;      --surface: #1a1a2e;
--sd: #0f0f1e;      --sl: rgba(255,255,255,0.08);
--text: #e8e8f0;    --muted: #a0a0b0;    --icons: #c0c0d0;
--accent: #8874d1;  --accent2: #a88ee6;
--accent-glow: rgba(136, 116, 209, 0.35);
--accent-soft: rgba(136, 116, 209, 0.15);
--modal-overlay: rgba(26, 26, 46, 0.8);
```

Shadow formula unchanged — same offsets, same structure, just colors flip via `--sd`/`--sl`.

---

## Architecture

**Approach:** CSS `data-theme` attribute on `<html>` + single hook.

```
[data-theme="dark"]  ← set on <html>
  └── base.css override block
        └── all CSS vars flip automatically
              └── all components update (zero JS changes to components)
```

No ThemeContext. No prop drilling. No component changes.

---

## Components

### New: `src/hooks/useTheme.js`

```
- reads localStorage key "theme" on init
- sets data-theme on <html>
- returns { theme: "light"|"dark", toggle }
- toggle(): flips theme, saves to localStorage, updates <html>
```

### Modified: `src/styles/base.css`

- Add `--modal-overlay` to `:root`
- Add `[data-theme="dark"] { ... }` block with all dark vars

### Modified: `src/styles/jam.module.css`

- `.modalOverlay` background: hardcoded `rgba(236, 235, 243, 0.7)` → `var(--modal-overlay)`

### Modified: `src/components/AuthBar.jsx`

- Import `useTheme`
- Add sun/moon icon toggle button in pill (left of sign in/out)
- Button uses existing pill styling (`var(--muted)` color, no border, transparent bg)

### Modified: `ui/index.html`

- Add inline `<script>` before `<body>` to read localStorage and set `data-theme` pre-render
- Prevents white flash on dark-mode users

### Modified: `src/components/base/NeuInput.jsx`

- Simplified to flat raised-sm container (no recessed inner wrapper)
- Matches preview styling — cleaner, single-layer neumorphic

---

## No-Flash Strategy

```html
<!-- ui/index.html, before </head> -->
<script>
  (function() {
    var t = localStorage.getItem('theme');
    if (t) document.documentElement.setAttribute('data-theme', t);
  })();
</script>
```

Runs synchronously before React hydration → no theme flash.

---

## Edge Cases

| Case | Resolution |
|---|---|
| Modal overlay hardcoded color | Replace with `--modal-overlay` CSS var |
| `NeuButton` primary glow | `--accent-glow` already a var — works in dark automatically |
| `btn-primary` gradient | Static gradient (`#9b88e0 → #7660c7`) — works on both themes |
| First visit (no localStorage) | Defaults to light (`:root` vars) |

---

## Out of Scope

- System `prefers-color-scheme` detection
- Per-page themes
- Any backend persistence of theme preference
