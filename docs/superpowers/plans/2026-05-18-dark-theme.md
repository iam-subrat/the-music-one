# Dark Theme + Dark Neumorphism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a toggleable deep-indigo dark neumorphism theme to MusicOne with an AuthBar toggle button and localStorage persistence.

**Architecture:** CSS custom properties in `base.css` drive all theming — a `[data-theme="dark"]` selector overrides `:root` vars, so zero component changes are needed. A `useTheme` hook manages the toggle + localStorage. An inline script in `index.html` sets `data-theme` before React renders to prevent flash.

**Tech Stack:** React 18, Vite, CSS custom properties, localStorage

---

## Files

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `ui/src/styles/base.css` | Add `--modal-overlay` var + `[data-theme="dark"]` block |
| Modify | `ui/src/styles/jam.module.css` | Use `--modal-overlay` var in `.modalOverlay` |
| Create | `ui/src/hooks/useTheme.js` | Toggle logic + localStorage read/write |
| Modify | `ui/index.html` | Inline no-flash script before React hydration |
| Modify | `ui/src/components/AuthBar.jsx` | Sun/moon toggle button in pill |

> **Already done:** `ui/src/components/base/NeuInput.jsx` was simplified to flat raised-sm container (no recessed inner wrapper) during design phase.

---

### Task 1: CSS dark variables + modal overlay fix

**Files:**
- Modify: `ui/src/styles/base.css`
- Modify: `ui/src/styles/jam.module.css`

- [ ] **Step 1: Add `--modal-overlay` var to `:root` in `base.css`**

In `base.css`, add to the `:root` block after `--accent-soft`:

```css
  --modal-overlay: rgba(236, 235, 243, 0.7);
```

- [ ] **Step 2: Add `[data-theme="dark"]` block at end of `base.css`**

Append after all existing rules:

```css
[data-theme="dark"] {
  --bg:      #1a1a2e;
  --surface: #1a1a2e;

  --sd: #0f0f1e;
  --sl: rgba(255,255,255,0.08);

  --text:  #e8e8f0;
  --muted: #a0a0b0;
  --icons: #c0c0d0;

  --accent:      #8874d1;
  --accent2:     #a88ee6;
  --accent-glow: rgba(136, 116, 209, 0.35);
  --accent-soft: rgba(136, 116, 209, 0.15);

  --modal-overlay: rgba(26, 26, 46, 0.8);
}
```

- [ ] **Step 3: Replace hardcoded overlay color in `jam.module.css`**

Find `.modalOverlay` — replace:
```css
  background: rgba(236, 235, 243, 0.7);
```
With:
```css
  background: var(--modal-overlay);
```

- [ ] **Step 4: Verify dark vars work manually**

In browser devtools console (on any page):
```js
document.documentElement.setAttribute('data-theme', 'dark')
```
Page should flip to deep indigo. Shadows visible. Text readable. Accent stays purple.

Then remove:
```js
document.documentElement.removeAttribute('data-theme')
```
Page returns to light.

- [ ] **Step 5: Commit**

```bash
git add ui/src/styles/base.css ui/src/styles/jam.module.css
git commit -m "feat: add dark neumorphism CSS variables and modal overlay var"
```

---

### Task 2: `useTheme` hook

**Files:**
- Create: `ui/src/hooks/useTheme.js`

- [ ] **Step 1: Create the hook**

Create `ui/src/hooks/useTheme.js`:

```js
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'theme';
const DARK = 'dark';
const LIGHT = 'light';

function applyTheme(theme) {
  if (theme === DARK) {
    document.documentElement.setAttribute('data-theme', DARK);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORAGE_KEY) || LIGHT);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  function toggle() {
    const next = theme === DARK ? LIGHT : DARK;
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
  }

  return { theme, toggle };
}
```

- [ ] **Step 2: Verify hook logic manually**

Import and call in a component temporarily (or just inspect logic):
- First render: reads `localStorage.getItem('theme')`, defaults to `'light'`
- `toggle()` flips `'light'` → `'dark'`, saves to localStorage, triggers `useEffect` → sets `data-theme="dark"` on `<html>`
- Toggle again: `'dark'` → `'light'`, removes attribute

- [ ] **Step 3: Commit**

```bash
git add ui/src/hooks/useTheme.js
git commit -m "feat: add useTheme hook with localStorage persistence"
```

---

### Task 3: No-flash inline script

**Files:**
- Modify: `ui/index.html`

- [ ] **Step 1: Add inline theme script to `index.html`**

In `ui/index.html`, add inside `<head>` before `</head>`:

```html
    <script>
      (function() {
        var t = localStorage.getItem('theme');
        if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      })();
    </script>
```

Full resulting `<head>` section:
```html
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MusicOne — Find on any platform</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <script>
      (function() {
        var t = localStorage.getItem('theme');
        if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      })();
    </script>
  </head>
```

- [ ] **Step 2: Verify no-flash works**

1. Set dark theme in localStorage: `localStorage.setItem('theme', 'dark')`
2. Hard-reload page (Cmd+Shift+R)
3. Page should render dark immediately — no white flash

- [ ] **Step 3: Commit**

```bash
git add ui/index.html
git commit -m "feat: add no-flash theme init script to index.html"
```

---

### Task 4: Toggle button in AuthBar

**Files:**
- Modify: `ui/src/components/AuthBar.jsx`

- [ ] **Step 1: Add `useTheme` import and sun/moon icons**

At top of `AuthBar.jsx`, add:

```js
import { useTheme } from '../hooks/useTheme';
```

Add icon components before `export default function AuthBar()`:

```js
function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}
```

- [ ] **Step 2: Wire up toggle button in `AuthBar`**

Inside `export default function AuthBar()`, add after existing hooks:

```js
const { theme, toggle } = useTheme();
```

Add toggle button in the pill div. The pill renders differently for logged-in vs logged-out users — add the button in both branches, just before the sign-in/sign-out button.

The toggle button style (reuse existing pattern from AuthBar):
```js
const toggleBtnStyle = {
  border: 'none',
  background: 'transparent',
  color: 'var(--muted)',
  fontSize: '0.83rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
  display: 'flex',
  alignItems: 'center',
};
```

**Logged-out branch** — replace the entire `if (!user)` return block:
```jsx
if (!user) {
  return (
    <div style={pillStyle}>
      <button style={toggleBtnStyle} onClick={toggle} aria-label="Toggle theme">
        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
      </button>
      <button
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: '0.83rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: 0,
        }}
        onClick={() => navigate('/login')}
      >
        Sign in
      </button>
    </div>
  );
}
```

**Logged-in branch** (the full return), add toggle button before the sign-out button:
```jsx
<button style={toggleBtnStyle} onClick={toggle} aria-label="Toggle theme">
  {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
</button>
```

- [ ] **Step 3: Start dev server and verify**

```bash
cd ui && npm run dev
```

Open `http://localhost:5173`. Verify:
- Moon icon visible in AuthBar pill (light mode)
- Click → page flips to dark indigo neumorphism
- Icon changes to sun
- Reload → stays dark (localStorage persists)
- Click sun → back to light
- Modal overlay on JamRoom page uses correct dark color

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/AuthBar.jsx
git commit -m "feat: add dark/light theme toggle to AuthBar"
```

---

### Task 5: Cleanup preview file

**Files:**
- Delete: `dark-theme-preview.html` (project root)

- [ ] **Step 1: Remove preview file**

```bash
rm /Users/subratpattanaik/Desktop/workspace/projects/music-search-links/dark-theme-preview.html
git add -A
git commit -m "chore: remove dark theme preview file"
```
