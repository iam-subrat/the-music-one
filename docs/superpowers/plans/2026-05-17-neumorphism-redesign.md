# Neumorphism Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark flat UI with a light neumorphism design system across all pages and components.

**Architecture:** Design tokens live in `base.css`. Five base components (`NeuSurface`, `NeuButton`, `NeuInput`, `NeuIconWrapper`, `PlatformIcon`) in `ui/src/components/base/` encapsulate all shadow logic. All page and feature components consume base components — zero duplicated shadow CSS. Business logic (hooks, lib/) is untouched.

**Tech Stack:** React 18, Vite, CSS custom properties, inline SVG icons.

---

> **No test runner configured.** Visual verification via `npm run dev` replaces automated tests throughout this plan. Each task ends with a visual check step before committing.

---

## File Map

**Create:**
- `ui/src/components/base/NeuSurface.jsx`
- `ui/src/components/base/NeuButton.jsx`
- `ui/src/components/base/NeuInput.jsx`
- `ui/src/components/base/NeuIconWrapper.jsx`
- `ui/src/components/base/PlatformIcon.jsx`
- `ui/src/components/base/index.js`

**Modify:**
- `ui/src/styles/base.css` — full token overhaul + global utility class updates
- `ui/src/styles/jam.module.css` — update all colors/shadows/borders to light theme
- `ui/src/components/AuthBar.jsx` — neumorphic pill layout
- `ui/src/components/Toast.jsx` — light theme colors
- `ui/src/components/NowPlaying.jsx` — DJ video (recessed) + non-DJ audio (waveform)
- `ui/src/components/QueueCard.jsx` — neumorphic card with position pill
- `ui/src/components/AddSongForm.jsx` — NeuInput + NeuButton
- `ui/src/components/ParticipantList.jsx` — neumorphic participant rows
- `ui/src/components/InviteBadge.jsx` — neumorphic pill
- `ui/src/pages/Home.jsx` — full refactor with base components
- `ui/src/pages/Login.jsx` — neumorphic welcome card
- `ui/src/pages/NotFound.jsx` — neumorphic 404

---

## Task 1: CSS Design Tokens

**Files:**
- Modify: `ui/src/styles/base.css`

- [ ] **Step 1: Replace entire base.css**

```css
/* ui/src/styles/base.css */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  /* BG and surface identical — depth from shadows only */
  --bg:      #ecebf3;
  --surface: #ecebf3;

  /* Shadow colors derived from bg */
  --sd: #c5c4d0;   /* shadow dark */
  --sl: #ffffff;   /* shadow light */

  /* Typography */
  --text:   #2d2b3d;
  --muted:  #7a7891;
  --icons:  #4a4860;

  /* Accent */
  --accent:      #8874d1;
  --accent2:     #b09de8;
  --accent-glow: rgba(118, 96, 199, 0.45);
  --accent-soft: rgba(136, 116, 209, 0.10);

  /* Radius */
  --radius: 22px;
  --radius-sm: 15px;

  /* Shadow scale — consistent top-left light source */
  --raised-sm: 4px 4px 10px var(--sd), -3px -3px 10px var(--sl);
  --raised:    8px 8px 18px var(--sd), -6px -6px 18px var(--sl);
  --raised-lg: 12px 12px 28px var(--sd), -10px -10px 28px var(--sl);
  --recessed:  inset 5px 5px 12px var(--sd), inset -4px -4px 12px var(--sl);
  --pressed:   inset 6px 6px 14px var(--sd), inset -5px -5px 14px var(--sl);
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  min-height: 100vh;
}

a { color: inherit; }

/* Global utility button — used by components not yet on NeuButton */
.btn {
  padding: 14px 24px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--surface);
  color: var(--accent);
  font-size: 0.95rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--raised);
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-family: inherit;
}
.btn:hover { box-shadow: var(--raised-lg); transform: translateY(-1px); }
.btn:active { box-shadow: var(--pressed); transform: translateY(1px); }

.btn-primary {
  background: linear-gradient(145deg, #9b88e0, #7660c7);
  color: #fff;
  box-shadow: 5px 5px 14px var(--accent-glow), -4px -4px 14px var(--sl);
}
.btn-primary:hover {
  box-shadow: 7px 7px 20px var(--accent-glow), -5px -5px 16px var(--sl);
}
.btn-primary:active {
  box-shadow: inset 4px 4px 10px rgba(0,0,0,0.2), inset -3px -3px 8px rgba(255,255,255,0.1);
}

.btn-ghost {
  background: var(--surface);
  color: var(--icons);
  box-shadow: var(--raised-sm);
}
.btn-ghost:hover { box-shadow: var(--raised); color: var(--text); }
.btn-ghost:active { box-shadow: var(--pressed); }

.btn-danger {
  background: var(--surface);
  color: #c0392b;
  box-shadow: var(--raised-sm);
}
.btn-danger:hover { box-shadow: var(--raised); }

/* Neumorphic spinner */
.spinner {
  width: 44px; height: 44px;
  border-radius: 50%;
  background: var(--surface);
  box-shadow: var(--raised);
  position: relative;
  animation: spin 1.2s linear infinite;
}
.spinner::after {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  box-shadow: var(--recessed);
}
@keyframes spin { to { transform: rotate(360deg); } }

.page {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 72px 16px 80px;
  min-height: 100vh;
}

/* Legacy .card — used by components pending refactor */
.card {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--raised);
}

.authBarName {
  font-size: 0.85rem;
  color: var(--muted);
}

@media (max-width: 768px) {
  input, textarea, select { font-size: 16px !important; }
}

@media (max-width: 480px) {
  .page { padding: 72px 12px 60px; }
  .authBarName { display: none; }
  .btn { min-height: 44px; }
}
```

- [ ] **Step 2: Start dev server and verify**

```bash
cd ui && npm run dev
```

Open `http://localhost:5173`. Background should now be soft lavender-gray `#ecebf3`. Text dark `#2d2b3d`. No broken layout — global `.btn` styles apply.

- [ ] **Step 3: Commit**

```bash
git add ui/src/styles/base.css
git commit -m "feat: replace dark tokens with light neumorphism design system"
```

---

## Task 2: NeuSurface Component

**Files:**
- Create: `ui/src/components/base/NeuSurface.jsx`

- [ ] **Step 1: Create component**

```jsx
// ui/src/components/base/NeuSurface.jsx
const SHADOW = {
  sm: 'var(--raised-sm)',
  md: 'var(--raised)',
  lg: 'var(--raised-lg)',
};

export default function NeuSurface({ children, size = 'md', style, className, ...props }) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        boxShadow: SHADOW[size],
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/base/NeuSurface.jsx
git commit -m "feat: add NeuSurface base component"
```

---

## Task 3: NeuButton Component

**Files:**
- Create: `ui/src/components/base/NeuButton.jsx`

- [ ] **Step 1: Create component**

```jsx
// ui/src/components/base/NeuButton.jsx
export default function NeuButton({
  children,
  variant = 'ghost',
  icon,
  onClick,
  type = 'button',
  disabled = false,
  style,
  ...props
}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '14px 24px',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    fontFamily: 'inherit',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
    position: 'relative',
    overflow: 'hidden',
  };

  const variants = {
    primary: {
      background: 'linear-gradient(145deg, #9b88e0, #7660c7)',
      color: '#fff',
      boxShadow: '5px 5px 14px var(--accent-glow), -4px -4px 14px var(--sl)',
    },
    ghost: {
      background: 'var(--surface)',
      color: 'var(--icons)',
      boxShadow: 'var(--raised-sm)',
    },
  };

  function handleMouseEnter(e) {
    if (disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.boxShadow = '7px 7px 20px var(--accent-glow), -5px -5px 16px var(--sl)';
      e.currentTarget.style.transform = 'translateY(-2px)';
    } else {
      e.currentTarget.style.boxShadow = 'var(--raised)';
      e.currentTarget.style.color = 'var(--text)';
    }
  }

  function handleMouseLeave(e) {
    e.currentTarget.style.boxShadow = variants[variant].boxShadow;
    e.currentTarget.style.transform = '';
    e.currentTarget.style.color = variants[variant].color;
  }

  function handleMouseDown(e) {
    if (disabled) return;
    if (variant === 'primary') {
      e.currentTarget.style.boxShadow = 'inset 4px 4px 10px rgba(0,0,0,0.2), inset -3px -3px 8px rgba(255,255,255,0.1)';
    } else {
      e.currentTarget.style.boxShadow = 'var(--pressed)';
    }
    e.currentTarget.style.transform = 'translateY(1px)';
  }

  function handleMouseUp(e) {
    e.currentTarget.style.boxShadow = variants[variant].boxShadow;
    e.currentTarget.style.transform = '';
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      {...props}
    >
      {children}
      {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/base/NeuButton.jsx
git commit -m "feat: add NeuButton base component (primary + ghost variants)"
```

---

## Task 4: NeuInput Component

**Files:**
- Create: `ui/src/components/base/NeuInput.jsx`

- [ ] **Step 1: Create component**

```jsx
// ui/src/components/base/NeuInput.jsx
import { useState } from 'react';

export default function NeuInput({ icon, value, onChange, placeholder, type = 'text', disabled = false, style }) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      style={{
        borderRadius: 'var(--radius-sm)',
        padding: 5,
        background: 'var(--surface)',
        boxShadow: focused
          ? 'var(--raised), 0 0 0 3px var(--accent-soft)'
          : 'var(--raised)',
        transition: 'box-shadow 0.25s ease',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 11,
          padding: '13px 16px',
          background: 'var(--surface)',
          boxShadow: 'var(--recessed)',
        }}
      >
        {icon && (
          <span style={{ display: 'flex', alignItems: 'center', opacity: 0.45, flexShrink: 0, color: 'var(--icons)' }}>
            {icon}
          </span>
        )}
        <input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            color: 'var(--text)',
            fontSize: '0.93rem',
            fontFamily: 'inherit',
            outline: 'none',
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/base/NeuInput.jsx
git commit -m "feat: add NeuInput base component (raised outer + recessed inner)"
```

---

## Task 5: NeuIconWrapper Component

**Files:**
- Create: `ui/src/components/base/NeuIconWrapper.jsx`

- [ ] **Step 1: Create component**

```jsx
// ui/src/components/base/NeuIconWrapper.jsx
export default function NeuIconWrapper({ children, size = 48, radius = 14, style }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: 'var(--surface)',
        boxShadow: 'var(--raised-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: 'var(--icons)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/base/NeuIconWrapper.jsx
git commit -m "feat: add NeuIconWrapper base component"
```

---

## Task 6: PlatformIcon Component

**Files:**
- Create: `ui/src/components/base/PlatformIcon.jsx`

- [ ] **Step 1: Create component**

> **Apple Music note:** The SVG below uses the correct Apple Music mark (music note). Verify against https://www.apple.com/newsroom/images/logos/ if in doubt.

```jsx
// ui/src/components/base/PlatformIcon.jsx
const ICONS = {
  spotify: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.623.623 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.623.623 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.623.623 0 01.207.857zm1.223-2.722a.78.78 0 01-1.072.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.234 1.328a.78.78 0 01.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.937.937 0 11-.543-1.793c3.525-1.07 9.385-.862 13.092 1.35a.937.937 0 01-1.032 1.6z"/>
    </svg>
  ),
  youtube: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
    </svg>
  ),
  youtubemusic: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 14.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0-7a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
    </svg>
  ),
  applemusic: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a6.317 6.317 0 00-1.903-.694 10.54 10.54 0 00-1.862-.166c-.142-.004-.286-.01-.428-.01H6.62c-.14 0-.28.006-.42.01a10.57 10.57 0 00-1.862.167 6.294 6.294 0 00-1.903.694C1.31 1.624.565 2.624.248 3.934A9.23 9.23 0 00.007 6.124C0 6.27 0 6.417 0 6.564v10.872c0 .147 0 .294.007.441a9.23 9.23 0 00.24 2.19c.317 1.31 1.062 2.31 2.18 3.043.588.385 1.23.626 1.903.694.62.067 1.24.1 1.862.166.142.004.286.01.428.01h10.76c.142 0 .286-.006.428-.01a10.572 10.572 0 001.862-.167 6.294 6.294 0 001.903-.694c1.118-.733 1.863-1.733 2.18-3.043a9.23 9.23 0 00.24-2.19c.007-.147.007-.294.007-.441V6.564c0-.147 0-.294-.007-.44zM15.5 6.5v7a3.5 3.5 0 11-2-3.163V6.5h2zM10 17a1.5 1.5 0 110-3 1.5 1.5 0 010 3z"/>
    </svg>
  ),
  soundcloud: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M1.175 12.225c-.015.132 0 .254.073.348.073.093.19.148.32.148.248 0 .38-.166.38-.38V9.75c0-.214-.132-.38-.38-.38-.131 0-.247.055-.32.148-.073.093-.088.216-.073.348v2.36zm1.558.38c0 .214.132.38.38.38.248 0 .38-.166.38-.38V9.04c0-.214-.132-.38-.38-.38-.248 0-.38.166-.38.38v3.565zm1.558.245c0 .214.132.38.38.38.248 0 .38-.166.38-.38V8.41c0-.214-.132-.38-.38-.38-.248 0-.38.166-.38.38v4.44zm1.557-.08c0 .215.133.381.381.381.247 0 .38-.166.38-.38V8.195c0-.214-.133-.38-.38-.38-.248 0-.38.166-.38.38v4.575zm1.558.245c0 .214.131.38.38.38.247 0 .379-.166.379-.38V8.24c0-.214-.132-.38-.38-.38-.247 0-.379.166-.379.38v4.775zm1.557-.037c0 .214.131.38.38.38.247 0 .379-.166.379-.38V8.15c0-.214-.132-.38-.38-.38-.247 0-.379.166-.379.38v4.833zm7.245-4.94A3.82 3.82 0 0011.84 6.2c-.43 0-.844.073-1.228.205-.108.039-.146.108-.146.184v6.583c0 .08.054.146.138.165l.024.004h5.02a2.15 2.15 0 002.15-2.15c0-.9-.554-1.673-1.35-1.993a3.82 3.82 0 00.038-.515z"/>
    </svg>
  ),
  deezer: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.944 17.445h3.388v1.2h-3.388zm0-2.523h3.388v1.2h-3.388zm0-2.524h3.388v1.2h-3.388zm0-2.524h3.388v1.2h-3.388zM14.276 17.445h3.388v1.2h-3.388zm0-2.523h3.388v1.2h-3.388zm0-2.524h3.388v1.2h-3.388zM9.609 17.445h3.388v1.2H9.609zm0-2.523h3.388v1.2H9.609zM4.941 17.445H8.33v1.2H4.941zm0-2.523H8.33v1.2H4.941zM.273 17.445H3.66v1.2H.273z"/>
    </svg>
  ),
  tidal: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.012 3.992L8.008 7.996 4.004 3.992 0 7.996l4.004 4.004 4.004-4.004 4.004 4.004 4.004-4.004zM8.008 16.004l4.004-4.004 4.004 4.004L20.02 12l-4.004-4.004-4.004 4.004L8.008 7.996 4.004 12z"/>
    </svg>
  ),
  amazonmusic: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M13.958 11.26c-.329.163-.57.39-.726.686-.156.295-.234.613-.234.955 0 .468.126.845.378 1.131.252.287.588.43 1.008.43.31 0 .579-.072.808-.215.229-.144.399-.347.51-.61.072-.174.116-.37.133-.588.016-.219.025-.524.025-.916V11.9l-.507.013c-.418.01-.734.108-.946.297l-.45-.95zm-3.09 5.437c-.168.217-.367.384-.597.502a1.6 1.6 0 01-.744.177c-.516 0-.929-.157-1.24-.47-.31-.314-.465-.73-.465-1.25 0-.384.09-.718.27-.999.18-.283.43-.498.755-.647.325-.15.698-.258 1.12-.327.421-.069.868-.11 1.34-.124v-.217c0-.384-.094-.659-.28-.823-.187-.164-.47-.247-.85-.247-.276 0-.527.06-.752.177-.225.117-.406.28-.542.49l-.81-.578c.24-.348.555-.614.944-.797.388-.183.82-.274 1.296-.274.564 0 1.014.116 1.348.347.334.232.565.525.695.88.084.23.126.556.126.977v2.763h-.914v-.56zm8.64.56h-.956l-.012-5.327h.956l.012 5.327zm-3.99 0h-.944V12.93c0-.51-.099-.878-.298-1.104-.198-.226-.512-.34-.942-.34-.3 0-.571.07-.812.208-.241.139-.437.336-.59.59v4.973h-.944v-5.327h.873v.73c.204-.275.46-.487.767-.635.308-.148.65-.222 1.024-.222.65 0 1.134.19 1.453.57.319.38.479.947.479 1.7l-.066 3.184zm-7.74 0H6.83V12.93c0-.51-.099-.878-.298-1.104-.198-.226-.512-.34-.942-.34-.3 0-.571.07-.812.208-.241.139-.437.336-.59.59v4.973h-.944v-5.327h.873v.73c.204-.275.46-.487.767-.635.308-.148.65-.222 1.024-.222.65 0 1.134.19 1.453.57.319.38.479.947.479 1.7l-.066 3.184zm9.897 1.945c-1.148.796-2.816 1.219-4.25 1.219-2.012 0-3.824-.736-5.194-1.96-.108-.096-.012-.228.118-.153 1.48.852 3.31 1.365 5.199 1.365 1.274 0 2.675-.262 3.965-.805.194-.082.358.126.162.334zm.465-.524c-.147-.187-.97-.089-1.341-.044-.112.013-.13-.084-.028-.155.657-.458 1.735-.326 1.861-.172.126.155-.034 1.228-.65 1.741-.094.08-.185.037-.143-.066.14-.347.45-1.124.301-1.304z"/>
    </svg>
  ),
  pandora: (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M2 2v20h5.135V13.8H9.6c3.938 0 7.072-2.914 7.072-6.9C16.672 2.914 13.538 0 9.6 0H2v2zm5.135 7.266V4.533H9.6c1.347 0 2.42 1.044 2.42 2.367 0 1.322-1.073 2.366-2.42 2.366H7.135z"/>
    </svg>
  ),
};

export default function PlatformIcon({ platform, size = 22 }) {
  const icon = ICONS[platform?.toLowerCase()] || null;
  if (!icon) return null;
  return (
    <span style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--icons)' }}>
      {icon}
    </span>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/base/PlatformIcon.jsx
git commit -m "feat: add PlatformIcon with uniform SVG brand marks"
```

---

## Task 7: Base Barrel Export

**Files:**
- Create: `ui/src/components/base/index.js`

- [ ] **Step 1: Create barrel export**

```js
// ui/src/components/base/index.js
export { default as NeuSurface } from './NeuSurface';
export { default as NeuButton } from './NeuButton';
export { default as NeuInput } from './NeuInput';
export { default as NeuIconWrapper } from './NeuIconWrapper';
export { default as PlatformIcon } from './PlatformIcon';
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/base/index.js
git commit -m "feat: add base component barrel export"
```

---

## Task 8: AuthBar Refactor

**Files:**
- Modify: `ui/src/components/AuthBar.jsx`

- [ ] **Step 1: Rewrite AuthBar**

```jsx
// ui/src/components/AuthBar.jsx
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function AuthBar() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();

  const pillStyle = {
    position: 'fixed',
    top: 18,
    right: 20,
    background: 'var(--surface)',
    borderRadius: 40,
    padding: '9px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    boxShadow: 'var(--raised-sm)',
    zIndex: 100,
  };

  if (!user) {
    return (
      <div style={pillStyle}>
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

  return (
    <div style={pillStyle}>
      {profile?.avatar_url ? (
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--raised-sm)' }}
        />
      ) : (
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
          boxShadow: 'var(--raised-sm)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.72rem', fontWeight: 700, color: '#fff',
        }}>
          {(profile?.display_name || 'U')[0].toUpperCase()}
        </div>
      )}
      <span className="authBarName">{profile?.display_name}</span>
      <button
        style={{
          border: 'none',
          background: 'transparent',
          color: 'var(--muted)',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          padding: 0,
        }}
        onClick={signOut}
      >
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:5173`. Auth pill should appear top-right as a neumorphic raised pill with `--raised-sm` shadow.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/AuthBar.jsx
git commit -m "feat: refactor AuthBar to neumorphic pill"
```

---

## Task 9: Toast Light Theme

**Files:**
- Modify: `ui/src/components/Toast.jsx`

- [ ] **Step 1: Update toast background and border**

Find this block in `Toast.jsx` (lines 29–50) and replace the inline style object:

```jsx
// Replace the toast <div> style from:
style={{
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: `translateX(-50%) translateY(${visible ? 0 : 80}px)`,
  opacity: visible ? 1 : 0,
  background: "#2a2a3a",
  border: "1px solid var(--border)",
  color: "var(--text)",
  padding: "10px 20px",
  borderRadius: 99,
  fontSize: "0.85rem",
  transition: "transform 0.3s ease, opacity 0.3s ease",
  pointerEvents: "none",
  zIndex: 999,
}}

// To:
style={{
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: `translateX(-50%) translateY(${visible ? 0 : 80}px)`,
  opacity: visible ? 1 : 0,
  background: "var(--surface)",
  boxShadow: "var(--raised)",
  color: "var(--text)",
  padding: "10px 20px",
  borderRadius: 99,
  fontSize: "0.85rem",
  fontWeight: 600,
  transition: "transform 0.3s ease, opacity 0.3s ease",
  pointerEvents: "none",
  zIndex: 999,
}}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/Toast.jsx
git commit -m "feat: update Toast to light neumorphic style"
```

---

## Task 10: Home Page Refactor

**Files:**
- Modify: `ui/src/pages/Home.jsx`

- [ ] **Step 1: Rewrite Home.jsx**

```jsx
// ui/src/pages/Home.jsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthBar from '../components/AuthBar';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { FLAGS } from '../lib/flags';
import { useToast } from '../components/Toast';
import { PLATFORM_META } from '../lib/platform';
import { NeuSurface, NeuButton, NeuInput, NeuIconWrapper, PlatformIcon } from '../components/base';

// SVG icons
function LinkIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

export default function Home() {
  const [inputUrl, setInputUrl] = useState('');
  const [song, setSong] = useState(null);
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const u = p.get('url');
    if (u) { setInputUrl(u); runSearch(u); }
  }, []);

  async function runSearch(url) {
    setStatus('loading');
    setSong(null);
    try {
      const res = await api(`/song/?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Song lookup failed (${res.status})`);
      const meta = await res.json();
      setSong(meta);
      setStatus('done');
      history.replaceState({}, '', `?url=${encodeURIComponent(url)}`);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to fetch song info.');
      setStatus('error');
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    runSearch(inputUrl.trim());
  }

  function handleReset() {
    setSong(null);
    setStatus('idle');
    setInputUrl('');
    history.replaceState({}, '', '/');
  }

  function copyPageLink() {
    navigator.clipboard.writeText(location.href).then(() => toast('Link copied!'));
  }

  const q = song ? `${song.title} ${song.artist}` : '';

  return (
    <div className="page">
      <AuthBar />

      <header style={{ textAlign: 'center', marginBottom: 8 }}>
        <h1 style={{
          fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-1px',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 8,
        }}>MusicOne</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Paste any streaming link — find it on every platform
        </p>
      </header>

      {status !== 'done' && (
        <NeuSurface size="lg" style={{ width: '100%', maxWidth: 560, padding: '28px 28px 24px', marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)' }}>
            Streaming URL
          </div>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <NeuInput
              icon={<LinkIcon />}
              type="url"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              placeholder="https://open.spotify.com/track/…"
            />
            <NeuButton
              variant="primary"
              type="submit"
              icon={<ArrowRight />}
              style={{ width: '100%' }}
            >
              Search all platforms
            </NeuButton>
          </form>
        </NeuSurface>
      )}

      {status === 'loading' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: 'var(--muted)', marginTop: 32 }}>
          <div className="spinner" />
          <span style={{ fontSize: '0.9rem' }}>Fetching song info…</span>
        </div>
      )}

      {status === 'error' && (
        <NeuSurface style={{ textAlign: 'center', maxWidth: 420, marginTop: 32, padding: 28 }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>{errorMsg}</p>
          <NeuButton variant="ghost" onClick={handleReset} icon={<BackIcon />}>Try another link</NeuButton>
        </NeuSurface>
      )}

      {status === 'done' && song && (
        <>
          <NeuSurface style={{ width: '100%', maxWidth: 560, padding: '22px 26px', marginTop: 24, display: 'flex', alignItems: 'center', gap: 18 }}>
            <NeuIconWrapper size={58} radius={16}>
              <MusicIcon />
            </NeuIconWrapper>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'var(--surface)', borderRadius: 20, padding: '4px 10px',
                boxShadow: 'var(--recessed)', fontSize: '0.68rem', fontWeight: 700,
                letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
              }}>
                ✦ Found
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 2 }}>{song.title}</div>
              <div style={{ fontSize: '0.87rem', color: 'var(--muted)' }}>{song.artist}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <NeuButton variant="ghost" onClick={copyPageLink} icon={<CopyIcon />} style={{ padding: '10px 14px' }} />
              <NeuButton variant="ghost" onClick={handleReset} icon={<BackIcon />} style={{ padding: '10px 14px' }} />
            </div>
          </NeuSurface>

          <div style={{ width: '100%', maxWidth: 560, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginTop: 24 }}>
            Open on your platform
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))', gap: 14, width: '100%', maxWidth: 560 }}>
            {Object.entries(PLATFORM_META).map(([key, p]) => {
              const directUrl = song?.platformLinks?.[key];
              const href = directUrl || p.searchUrl(q);
              const isDirect = !!directUrl;
              return (
                <a
                  key={key}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: 'var(--surface)',
                    borderRadius: 'var(--radius)',
                    padding: '18px 14px',
                    textAlign: 'center',
                    boxShadow: 'var(--raised)',
                    textDecoration: 'none',
                    color: 'var(--text)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 9,
                    transition: 'all 0.22s cubic-bezier(0.4,0,0.2,1)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--raised-lg)'; e.currentTarget.style.transform = 'translateY(-3px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'var(--raised)'; e.currentTarget.style.transform = ''; }}
                  onMouseDown={e => { e.currentTarget.style.boxShadow = 'var(--pressed)'; e.currentTarget.style.transform = 'none'; }}
                  onMouseUp={e => { e.currentTarget.style.boxShadow = 'var(--raised)'; }}
                >
                  <NeuIconWrapper size={48} radius={14}>
                    <PlatformIcon platform={key} size={22} />
                  </NeuIconWrapper>
                  <div style={{ fontSize: '0.81rem', fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: '0.7rem', color: isDirect ? 'var(--accent)' : 'var(--muted)', fontWeight: isDirect ? 700 : 500 }}>
                    {isDirect ? 'Open ↗' : 'Search ↗'}
                  </div>
                </a>
              );
            })}
          </div>
        </>
      )}

      {FLAGS.JAM_SESSION && user && (
        <div style={{ marginTop: 40, width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Want to listen together?</p>
          <NeuButton variant="primary" style={{ width: '100%' }} onClick={() => navigate('/jam/new')}>
            Start a Jam Session
          </NeuButton>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Check `http://localhost:5173`:
- Header with gradient text
- Neumorphic search card (raised outer + recessed input)
- After pasting a URL + searching: song card + platform grid
- Platform cards lift on hover, press on click
- Spinner shows on loading state

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/Home.jsx
git commit -m "feat: refactor Home page with neumorphic base components"
```

---

## Task 11: Login + NotFound Pages

**Files:**
- Modify: `ui/src/pages/Login.jsx`
- Modify: `ui/src/pages/NotFound.jsx`

- [ ] **Step 1: Rewrite Login.jsx**

```jsx
// ui/src/pages/Login.jsx
import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { NeuSurface, NeuButton } from '../components/base';

export default function Login() {
  const { user, loading, signInWithGoogle } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/';

  useEffect(() => {
    if (!loading && user) navigate(next, { replace: true });
  }, [user, loading]);

  return (
    <div className="page" style={{ justifyContent: 'center', gap: 32 }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{
          fontSize: '2.2rem', fontWeight: 800, letterSpacing: '-1px',
          background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 8,
        }}>MusicOne</h1>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>Sign in to create or join a jam session</p>
      </div>

      <NeuSurface size="lg" style={{ padding: 'clamp(24px,6vw,40px) clamp(20px,5vw,32px)', maxWidth: 380, width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>Welcome</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          Sign in with Google to start jamming. Your preferred platform is saved automatically on first song add.
        </p>
        <NeuButton
          variant="ghost"
          style={{ width: '100%', color: 'var(--text)' }}
          onClick={() => signInWithGoogle(window.location.origin + next)}
          icon={<GoogleIcon />}
        >
          Continue with Google
        </NeuButton>
        <a href="/" style={{ color: 'var(--muted)', fontSize: '0.85rem', textDecoration: 'none' }}>← Back to home</a>
      </NeuSurface>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
```

- [ ] **Step 2: Rewrite NotFound.jsx**

```jsx
// ui/src/pages/NotFound.jsx
import { NeuSurface, NeuButton } from '../components/base';

function HomeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  );
}

export default function NotFound() {
  return (
    <div className="page" style={{ justifyContent: 'center', textAlign: 'center', gap: 24 }}>
      <NeuSurface size="lg" style={{ padding: 40, maxWidth: 360, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ fontSize: '3rem', fontWeight: 800, color: 'var(--accent)', letterSpacing: '-2px' }}>404</div>
        <p style={{ color: 'var(--muted)', fontSize: '0.95rem' }}>Page not found.</p>
        <NeuButton variant="ghost" icon={<HomeIcon />} onClick={() => window.location.href = '/'}>Go home</NeuButton>
      </NeuSurface>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/Login.jsx ui/src/pages/NotFound.jsx
git commit -m "feat: refactor Login and NotFound pages to neumorphic design"
```

---

## Task 12: NowPlaying Refactor

**Files:**
- Modify: `ui/src/components/NowPlaying.jsx`

- [ ] **Step 1: Rewrite NowPlaying.jsx**

```jsx
// ui/src/components/NowPlaying.jsx
import { useState, useEffect, useRef } from 'react';
import s from '../styles/jam.module.css';
import { preferredLink, extractYouTubeId, isYouTubeSearchUrl, extractSearchQuery, PLATFORM_META } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { api } from '../lib/api';
import { useSkipVotes } from '../hooks/useSkipVotes';
import { castSkipVote, removeSkipVote, playNext, patchYouTubeLink } from '../lib/queue';
import { setRepeatMode } from '../lib/session';
import { useToast } from './Toast';
import YouTubeAutoPlayer from './YouTubeAutoPlayer';
import { NeuSurface, NeuButton, NeuIconWrapper } from './base';

function SkipIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19"/>
    </svg>
  );
}

function MusicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

function PlayingPill() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: 'var(--surface)', borderRadius: 20, padding: '4px 10px',
      boxShadow: 'var(--recessed)', fontSize: '0.68rem', fontWeight: 700,
      letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6,
    }}>
      <span className={s.pulse} />
      Now Playing
    </div>
  );
}

function Waveform() {
  return (
    <div className={s.waveform}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className={s.waveformBar} style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

export default function NowPlaying({ nowPlaying, sessionId, isDJ, preferredPlatform, participantCount, userId, onQueueChange, repeatMode, onRepeatModeChange }) {
  const toast = useToast();
  const { count: skipVotes, hasVoted } = useSkipVotes(nowPlaying?.id, userId, sessionId);
  const skipThreshold = Math.floor(participantCount / 2) + 1;

  const [ytId, setYtId] = useState(null);
  const [ytResolvedTitle, setYtResolvedTitle] = useState(null);
  const resolveKey = useRef(null);

  useEffect(() => {
    if (!FLAGS.AUTO_PLAY_QUEUE || !nowPlaying || !isDJ) { setYtId(null); setYtResolvedTitle(null); return; }
    const key = nowPlaying.id;
    resolveKey.current = key;
    setYtResolvedTitle(null);
    const ytUrl = nowPlaying.platform_links?.youtube || nowPlaying.platform_links?.youtubemusic;
    const directId = extractYouTubeId(ytUrl);
    if (directId) { setYtId(directId); return; }
    if (ytUrl && isYouTubeSearchUrl(ytUrl)) {
      const q = extractSearchQuery(ytUrl);
      if (q) {
        api(`/youtube/?q=${encodeURIComponent(q)}`)
          .then(res => res.ok ? res.json() : { id: null, title: null })
          .then(({ id, title }) => {
            if (resolveKey.current !== key) return;
            if (id) { setYtId(id); setYtResolvedTitle(title); }
          });
        return;
      }
    }
    api(`/youtube/?q=${encodeURIComponent(`${nowPlaying.title} ${nowPlaying.artist}`)}`)
      .then(res => res.ok ? res.json() : { id: null, title: null })
      .then(({ id, title }) => {
        if (resolveKey.current !== key) return;
        if (id) {
          setYtId(id);
          setYtResolvedTitle(title);
          patchYouTubeLink(nowPlaying.id, `https://www.youtube.com/watch?v=${id}`);
        }
      });
  }, [nowPlaying?.id, isDJ]);

  async function handleEnded() {
    if (!isDJ) return;
    try {
      const next = await playNext(sessionId);
      onQueueChange?.();
      if (!next) toast('Queue is empty!');
    } catch (e) { toast(e.message); }
  }

  async function handleSkipVote() {
    try {
      if (hasVoted) {
        await removeSkipVote(nowPlaying.id, userId);
      } else {
        const skipped = await castSkipVote(nowPlaying.id, skipThreshold);
        if (skipped) onQueueChange?.();
      }
    } catch (e) { toast(e.message); }
  }

  if (!nowPlaying) {
    return (
      <NeuSurface size="lg" style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' }}>
          Now Playing
        </div>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          {isDJ ? 'Click "Play Next" to start the queue.' : 'Waiting for the DJ to start…'}
        </p>
        {isDJ && (
          <NeuButton
            variant="primary"
            onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}
          >
            Play Next
          </NeuButton>
        )}
      </NeuSurface>
    );
  }

  const pref = preferredLink(nowPlaying.platform_links, preferredPlatform);
  const prefMeta = pref ? PLATFORM_META[pref.platform] : null;

  return (
    <NeuSurface size="lg" style={{ overflow: 'hidden', padding: 0 }}>

      {/* Video embed — recessed directly into card, DJ only */}
      {FLAGS.AUTO_PLAY_QUEUE && ytId && isDJ && (
        <div style={{
          margin: 20,
          borderRadius: 14,
          overflow: 'hidden',
          boxShadow: 'var(--recessed)',
          aspectRatio: '16/9',
          background: '#1a1a24',
        }}>
          {ytResolvedTitle && (
            <div style={{ position: 'absolute', bottom: 8, left: 12, fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)' }}>
              ▶ {ytResolvedTitle}
            </div>
          )}
          <YouTubeAutoPlayer videoId={ytId} onEnded={handleEnded} repeat={repeatMode === 'song'} />
        </div>
      )}

      {/* Static YouTube embed (no autoplay flag) */}
      {FLAGS.YOUTUBE_EMBED && !FLAGS.AUTO_PLAY_QUEUE && ytId && (
        <div style={{ margin: 20, borderRadius: 14, overflow: 'hidden', boxShadow: 'var(--recessed)', aspectRatio: '16/9' }}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${ytId}`}
            style={{ width: '100%', height: '100%', border: 'none' }}
            allowFullScreen
            title="YouTube preview"
          />
        </div>
      )}

      {/* Song info row */}
      <div style={{ padding: '18px 24px 10px', display: 'flex', alignItems: 'center', gap: 16 }}>
        {isDJ ? (
          /* DJ: icon wrapper */
          <NeuIconWrapper size={52} radius={14}>
            <MusicIcon />
          </NeuIconWrapper>
        ) : (
          /* Non-DJ: animated waveform */
          <Waveform />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <PlayingPill />
          <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nowPlaying.title}
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{nowPlaying.artist}</div>
          {nowPlaying.profiles?.display_name && (
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
              Added by {nowPlaying.profiles.display_name}
            </div>
          )}
        </div>
        {isDJ && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'var(--surface)', borderRadius: 20, padding: '6px 12px',
            boxShadow: 'var(--recessed)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
            DJ
          </div>
        )}
      </div>

      {/* Open on preferred platform */}
      {pref && (
        <div style={{ padding: '0 24px 12px' }}>
          <a
            href={pref.url}
            target="_blank"
            rel="noopener noreferrer"
            className={s.preferredBtn}
            style={{ '--platform-color': prefMeta?.color }}
          >
            Open on {prefMeta?.name || pref.platform} ↗
          </a>
        </div>
      )}

      {/* Controls row */}
      <div style={{ padding: '0 20px 20px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {FLAGS.VOTE_TO_SKIP && (
          <>
            <NeuButton
              variant="ghost"
              icon={<SkipIcon />}
              onClick={handleSkipVote}
              style={{ color: hasVoted ? 'var(--accent)' : 'var(--icons)', padding: '10px 14px' }}
            >
              Skip
            </NeuButton>
            <span style={{
              background: 'var(--surface)', borderRadius: 20, padding: '4px 10px',
              boxShadow: 'var(--recessed)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)',
            }}>
              {skipVotes} / {skipThreshold}
            </span>
          </>
        )}
        <div style={{ flex: 1 }} />
        {isDJ && (
          <>
            <NeuButton
              variant="ghost"
              onClick={() => playNext(sessionId).then(n => { onQueueChange?.(); if (!n) toast('Queue is empty!'); })}
              style={{ padding: '10px 14px', fontSize: '0.85rem' }}
            >
              Next ▶
            </NeuButton>
            <NeuButton
              variant="ghost"
              onClick={() => {
                const next = { none: 'song', song: 'queue', queue: 'none' }[repeatMode];
                onRepeatModeChange?.(next);
                setRepeatMode(sessionId, next).catch(e => { onRepeatModeChange?.(repeatMode); toast(e.message); });
              }}
              style={{ padding: '10px 14px', fontSize: '0.85rem', color: repeatMode !== 'none' ? 'var(--accent)' : 'var(--icons)' }}
            >
              {repeatMode === 'queue' ? '⟳ Queue' : repeatMode === 'song' ? '⟳ Song' : '⟳'}
            </NeuButton>
          </>
        )}
      </div>
    </NeuSurface>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/NowPlaying.jsx
git commit -m "feat: refactor NowPlaying with neumorphic video embed and DJ/non-DJ states"
```

---

## Task 13: QueueCard Refactor

**Files:**
- Modify: `ui/src/components/QueueCard.jsx`

- [ ] **Step 1: Rewrite QueueCard.jsx**

```jsx
// ui/src/components/QueueCard.jsx
import { NeuIconWrapper, PlatformIcon } from './base';

export default function QueueCard({ item, index }) {
  const isPlayed = item.status === 'played' || item.status === 'skipped';
  const isResolving = item.resolve_status === 'resolving';
  const isFailed = item.resolve_status === 'failed';

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 'var(--radius-sm)',
      padding: '14px 18px',
      boxShadow: 'var(--raised-sm)',
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      opacity: isPlayed ? 0.5 : 1,
      transition: 'opacity 0.2s',
    }}>
      {index != null && (
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'var(--surface)', boxShadow: 'var(--recessed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
        }}>
          {index}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.title}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.artist}
        </div>
        {item.profiles?.display_name && (
          <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>
            by {item.profiles.display_name}
          </div>
        )}
      </div>
      {isResolving && (
        <span style={{
          fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4,
          background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0,
        }}>
          Resolving…
        </span>
      )}
      {isFailed && (
        <span style={{
          fontSize: '0.65rem', padding: '2px 8px', borderRadius: 4,
          background: 'rgba(192,57,43,0.1)', color: '#c0392b', flexShrink: 0,
        }}>
          Failed
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/QueueCard.jsx
git commit -m "feat: refactor QueueCard to neumorphic design"
```

---

## Task 14: AddSongForm Refactor

**Files:**
- Modify: `ui/src/components/AddSongForm.jsx`

- [ ] **Step 1: Rewrite AddSongForm.jsx**

```jsx
// ui/src/components/AddSongForm.jsx
import { useState } from 'react';
import { addToQueue } from '../lib/queue';
import { detectPlaylist } from '../lib/playlist';
import { detectPlatform } from '../lib/platform';
import { FLAGS } from '../lib/flags';
import { useToast } from './Toast';
import PlaylistModal from './PlaylistModal';
import { NeuSurface, NeuButton, NeuInput } from './base';

function MusicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
    </svg>
  );
}

export default function AddSongForm({ sessionId, userId, profile, onPlatformDetected, onAdded }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(null);
  const toast = useToast();

  async function handleAdd(e) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || busy) return;
    if (FLAGS.PLAYLIST_IMPORT && detectPlaylist(trimmed)) {
      setPlaylistUrl(trimmed);
      setUrl('');
      return;
    }
    setBusy(true);
    try {
      if (FLAGS.PLATFORM_AUTODETECT && !profile?.preferred_platform) {
        const platform = detectPlatform(trimmed);
        if (platform) onPlatformDetected(platform);
      }
      const item = await addToQueue(sessionId, trimmed);
      toast(`"${item.title}" added to queue`);
      setUrl('');
      onAdded?.(item);
    } catch (e) {
      toast(e.message || 'Could not add song.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <NeuSurface style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)' }}>
          Add to queue
        </div>
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <NeuInput
            icon={<MusicIcon />}
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={FLAGS.PLAYLIST_IMPORT ? 'Paste a song or playlist URL…' : 'Paste a song URL…'}
            disabled={busy}
          />
          <NeuButton variant="primary" type="submit" disabled={busy} style={{ width: '100%' }}>
            {busy ? '…' : 'Add to queue'}
          </NeuButton>
        </form>
      </NeuSurface>

      {playlistUrl && (
        <PlaylistModal
          url={playlistUrl}
          sessionId={sessionId}
          onAdded={onAdded}
          onClose={() => setPlaylistUrl(null)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/AddSongForm.jsx
git commit -m "feat: refactor AddSongForm with NeuInput + NeuButton"
```

---

## Task 15: ParticipantList + InviteBadge Refactor

**Files:**
- Modify: `ui/src/components/ParticipantList.jsx`
- Modify: `ui/src/components/InviteBadge.jsx`

- [ ] **Step 1: Rewrite ParticipantList.jsx**

```jsx
// ui/src/components/ParticipantList.jsx
import { FLAGS } from '../lib/flags';
import { passDjToken } from '../lib/session';
import { useToast } from './Toast';
import { NeuButton } from './base';

export default function ParticipantList({ participants, session, currentUserId }) {
  const toast = useToast();
  const isHost = session.host_user_id === currentUserId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)' }}>
        In this jam ({participants.length})
      </div>
      {participants.map(p => (
        <div key={p.id} style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius-sm)',
          padding: '10px 14px',
          boxShadow: 'var(--raised-sm)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {p.avatar_url ? (
            <img src={p.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--raised-sm)', flexShrink: 0 }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), var(--accent2))',
              boxShadow: 'var(--raised-sm)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.72rem', fontWeight: 700, color: '#fff', flexShrink: 0,
            }}>
              {(p.display_name || 'G')[0].toUpperCase()}
            </div>
          )}
          <span style={{ flex: 1, fontSize: '0.85rem', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.display_name || 'Guest'}
          </span>
          {p.id === session.dj_user_id && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              background: 'var(--surface)', borderRadius: 20, padding: '3px 8px',
              boxShadow: 'var(--recessed)', fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
              DJ
            </span>
          )}
          {FLAGS.DJ_TOKEN && isHost && p.id !== currentUserId && p.id !== session.dj_user_id && (
            <NeuButton
              variant="ghost"
              style={{ fontSize: '0.72rem', padding: '4px 10px' }}
              onClick={() => passDjToken(session.id, p.id).then(() => toast('DJ token passed!'))}
            >
              Make DJ
            </NeuButton>
          )}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite InviteBadge.jsx**

```jsx
// ui/src/components/InviteBadge.jsx
import { useToast } from './Toast';
import { NeuButton } from './base';

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
    </svg>
  );
}

export default function InviteBadge({ code }) {
  const toast = useToast();
  const url = `${window.location.origin}/jam/${code}`;

  return (
    <div style={{
      background: 'var(--surface)',
      borderRadius: 40,
      padding: '8px 16px',
      boxShadow: 'var(--raised-sm)',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 10,
      fontSize: '0.83rem',
      color: 'var(--muted)',
    }}>
      <span>Invite:</span>
      <span style={{
        background: 'var(--surface)', borderRadius: 8, padding: '2px 8px',
        boxShadow: 'var(--recessed)', fontWeight: 700, color: 'var(--text)',
        letterSpacing: '0.5px', fontFamily: 'monospace', fontSize: '0.9rem',
      }}>
        {code}
      </span>
      <NeuButton
        variant="ghost"
        icon={<CopyIcon />}
        style={{ padding: '6px 10px', fontSize: '0.78rem' }}
        onClick={() => navigator.clipboard.writeText(url).then(() => toast('Invite link copied!'))}
      >
        Copy
      </NeuButton>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/ParticipantList.jsx ui/src/components/InviteBadge.jsx
git commit -m "feat: refactor ParticipantList and InviteBadge to neumorphic design"
```

---

## Task 16: jam.module.css Light Theme

**Files:**
- Modify: `ui/src/styles/jam.module.css`

- [ ] **Step 1: Replace color/border/shadow values throughout jam.module.css**

Replace the entire file:

```css
/* ui/src/styles/jam.module.css */

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  width: 100%;
  max-width: 1000px;
  padding: 72px 16px 80px;
}

@media (max-width: 700px) {
  .layout { grid-template-columns: minmax(0, 1fr); padding: 72px 12px 60px; }
  .sidebar { order: -1; }
  .queueSection { position: static; max-height: none; overflow: visible; }
  .queueList { overflow-y: visible; }
}

.jamHeader {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* Pulse animation — used in NowPlaying playing pill */
.pulse {
  width: 7px; height: 7px;
  background: var(--accent);
  border-radius: 50%;
  display: block;
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.75); }
}

/* Waveform animation — non-DJ audio state */
.waveform {
  display: flex;
  align-items: center;
  gap: 3px;
  height: 32px;
  flex-shrink: 0;
}
.waveformBar {
  width: 4px;
  border-radius: 2px;
  background: var(--accent);
  animation: wave 1.2s ease-in-out infinite;
  height: 60%;
}
@keyframes wave {
  0%, 100% { transform: scaleY(0.4); }
  50% { transform: scaleY(1); }
}

/* Preferred platform button */
.preferredBtn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  color: #fff;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  box-shadow: 5px 5px 14px var(--accent-glow), -4px -4px 14px var(--sl);
  transition: all 0.2s;
  width: fit-content;
  max-width: 100%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preferredBtn:hover {
  box-shadow: 7px 7px 20px var(--accent-glow), -5px -5px 16px var(--sl);
  transform: translateY(-1px);
}

/* Queue section (sidebar) */
.queueSection {
  position: sticky;
  top: 80px;
  max-height: calc(100vh - 120px);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.queueList {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 8px;
}

/* Playlist modal */
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(236, 235, 243, 0.7);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.modal {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--raised-lg);
  width: min(520px, 95vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.modalHeader {
  padding: 16px 20px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 2px solid transparent;
  box-shadow: 0 2px 0 0 var(--sd);
}

.modalTitle {
  font-size: 1rem;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.modalSubtitle {
  font-size: 0.78rem;
  color: var(--muted);
}

.modalSelectAll {
  font-size: 0.78rem;
  color: var(--accent);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-align: left;
  width: fit-content;
}

.modalTrackList {
  overflow-y: auto;
  flex: 1;
}

.modalTrackRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  cursor: pointer;
  border-bottom: 1px solid var(--sd);
  transition: background 0.15s;
}

.modalTrackRow:hover { background: var(--accent-soft); }
.modalTrackRowSelected { background: var(--accent-soft); }

.modalTrackThumb {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--sd);
  flex-shrink: 0;
  box-shadow: var(--raised-sm);
}

.modalTrackMeta { flex: 1; min-width: 0; }
.modalTrackTitle { font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.modalTrackArtist { font-size: 0.75rem; color: var(--muted); }

.modalCheckbox { flex-shrink: 0; width: 16px; height: 16px; accent-color: var(--accent); }

.modalFooter {
  padding: 12px 20px;
  box-shadow: 0 -2px 0 0 var(--sd);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.modalError {
  padding: 20px;
  color: #c0392b;
  font-size: 0.85rem;
  text-align: center;
}

.modalLoading {
  padding: 40px;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}

.resolvingBadge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  flex-shrink: 0;
}

.failedBadge {
  font-size: 0.65rem;
  padding: 2px 8px;
  border-radius: 4px;
  background: rgba(192, 57, 43, 0.1);
  color: #c0392b;
  flex-shrink: 0;
}

.queueCardResolving { opacity: 0.6; }
.queueCardFailed { opacity: 0.4; }
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/styles/jam.module.css
git commit -m "feat: update jam.module.css to light neumorphism tokens"
```

---

## Task 17: Final Visual Sweep

**Files:** None (verification only)

- [ ] **Step 1: Run dev server**

```bash
cd ui && npm run dev
```

- [ ] **Step 2: Check Home page**

Visit `http://localhost:5173/`:
- Soft lavender-gray background `#ecebf3`
- AuthBar pill top-right with neumorphic shadow
- Gradient "MusicOne" logo
- Raised search card with recessed NeuInput + gradient button
- Neumorphic spinner on search
- Song result card with Found pill + platform grid
- Platform cards lift and press correctly
- Toast appears on clipboard copy

- [ ] **Step 3: Check Login page**

Visit `http://localhost:5173/login`:
- Centered NeuSurface card with gradient logo
- Ghost NeuButton for Google sign-in
- Neumorphic shadow on card

- [ ] **Step 4: Check NotFound page**

Visit `http://localhost:5173/some-bad-route`:
- 404 in accent color inside NeuSurface
- Home button with ghost style

- [ ] **Step 5: Check JamRoom (if JAM_SESSION flag enabled)**

Visit `http://localhost:5173/jam/any-code` (requires auth):
- InviteBadge pill at top
- NowPlaying card: DJ view shows recessed video, non-DJ shows waveform
- AddSongForm with NeuInput
- QueueCards with position pills
- ParticipantList with avatar pills + DJ badge

- [ ] **Step 6: Check mobile (480px)**

Open DevTools → toggle mobile viewport:
- No overflow
- Inputs have `font-size: 16px` (no iOS zoom)
- Platform grid reflows correctly

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete neumorphism redesign — all pages and components"
```

---

## Self-Review Notes

- `PlaylistModal` uses `.btn` global class (still updated in Task 1) and `jam.module.css` modal classes (updated in Task 16) — no further changes needed
- `QueueList.jsx` is a thin wrapper over `QueueCard` — no changes needed, inherits styles
- `YouTubeAutoPlayer` is purely functional — no visual changes needed
- Dark theme toggle is out of scope — no `[data-theme]` switching in this plan
- Apple Music SVG in `PlatformIcon` uses a music-note-based mark — verify against official Apple brand guidelines before shipping to production
