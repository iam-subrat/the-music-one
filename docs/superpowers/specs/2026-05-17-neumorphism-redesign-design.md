# MusicOne — Neumorphism Redesign

**Date:** 2026-05-17  
**Status:** Approved  
**Scope:** Full UI redesign — Home, JamRoom, all components

---

## Overview

Redesign MusicOne's UI from dark flat design to light neumorphism. All surfaces use a unified shadow system derived from the background color. Depth comes from shadows only — never from color differences between surface and background.

---

## Design Tokens

```css
:root {
  /* Background and surface are identical — depth from shadows only */
  --bg:      #ecebf3;
  --surface: #ecebf3;

  /* Shadow colors derived from bg (not pure black/white) */
  --sd: #c5c4d0;   /* shadow dark — bg darkened ~15% */
  --sl: #ffffff;   /* shadow light — pure white highlight */

  /* Typography */
  --text:   #2d2b3d;   /* near-black, soft */
  --muted:  #7a7891;   /* muted purple-gray */
  --icons:  #4a4860;   /* uniform icon color */

  /* Accent — lavender violet gradient */
  --accent:       #8874d1;
  --accent2:      #b09de8;
  --accent-glow:  rgba(118, 96, 199, 0.45);
  --accent-soft:  rgba(136, 116, 209, 0.10);

  /* Radius */
  --r:    22px;   /* cards, large containers */
  --r-sm: 15px;   /* buttons, inputs, small cards */

  /* Shadow scale — consistent top-left light source */
  --raised-sm: 4px 4px 10px var(--sd), -3px -3px 10px var(--sl);
  --raised:    8px 8px 18px var(--sd), -6px -6px 18px var(--sl);
  --raised-lg: 12px 12px 28px var(--sd), -10px -10px 28px var(--sl);
  --recessed:  inset 5px 5px 12px var(--sd), inset -4px -4px 12px var(--sl);
  --pressed:   inset 6px 6px 14px var(--sd), inset -5px -5px 14px var(--sl);
}
```

---

## Component Architecture

Base components live in `ui/src/components/base/`. All page-level components consume base components — no duplicated shadow CSS anywhere.

```
ui/src/components/base/
  NeuSurface.jsx      ← raised card surface (accepts size: sm | md | lg)
  NeuInput.jsx        ← two-layer input: raised outer + recessed inner + icon slot
  NeuButton.jsx       ← primary (gradient) and ghost variants
  NeuIconWrapper.jsx  ← neumorphic raised icon container (48px default)
  PlatformIcon.jsx    ← all platform SVG brand marks, uniform currentColor

ui/src/styles/
  base.css            ← tokens + resets (replaces current dark theme)
  jam.module.css      ← JamRoom-specific overrides (updated to light theme)
```

---

## Base Components

### NeuSurface

Raised neumorphic card. All cards, panels, form containers use this.

```jsx
<NeuSurface size="lg">…</NeuSurface>
```

- `size="sm"` → `--raised-sm`
- `size="md"` → `--raised` (default)
- `size="lg"` → `--raised-lg`
- `border-radius: var(--r)`

### NeuInput

Two-layer input: raised outer wrapper + recessed inner channel.

```jsx
<NeuInput
  icon={<LinkIcon />}
  placeholder="https://open.spotify.com/track/…"
  value={inputUrl}
  onChange={…}
  type="url"
/>
```

- Outer: `box-shadow: var(--raised)` + `border-radius: var(--r-sm)` + `padding: 5px`
- Inner: `box-shadow: var(--recessed)` + `border-radius: 11px`
- Focus: outer gains `0 0 0 3px var(--accent-soft)` ring
- Icon slot: left of input, `color: var(--icons)`, `opacity: 0.45`

### NeuButton

```jsx
<NeuButton variant="primary" icon={<ArrowRight />}>Search all platforms</NeuButton>
<NeuButton variant="ghost" icon={<CopyIcon />} />
```

**Primary variant:**
- `background: linear-gradient(145deg, #9b88e0, #7660c7)`
- `box-shadow: 5px 5px 14px var(--accent-glow), -4px -4px 14px var(--sl), inset 0 1px 0 rgba(255,255,255,0.15)`
- Shimmer `::before` pseudo line across top
- Hover: shadow intensifies, `translateY(-2px)`, arrow icon slides right
- Active: shadow inverts to pressed, `translateY(1px)`

**Ghost variant:**
- `background: var(--surface)`
- `box-shadow: var(--raised-sm)`
- `color: var(--icons)`
- Hover: `var(--raised)`, color → `var(--text)`
- Active: `var(--pressed)`

### NeuIconWrapper

48×48 raised icon container for platform cards.

```jsx
<NeuIconWrapper size={48} radius={14}>
  <SpotifyIcon />
</NeuIconWrapper>
```

- `box-shadow: var(--raised-sm)`
- Icon color: `var(--icons)` via `currentColor`

### PlatformIcon

Single source of truth for all platform SVG marks. All icons rendered as SVG with `fill="currentColor"` or `stroke="currentColor"` — never emoji.

```jsx
<PlatformIcon platform="spotify" size={22} />
```

Platforms: `spotify | youtube | applemusic | soundcloud | deezer | tidal | amazonmusic | pandora`

**Apple Music note:** Use the correct Apple Music SVG logo (music note on white, not the incorrect icon used in prototype). Source from official brand assets.

---

## Page Designs

### Home (`/`)

```
AuthBar (fixed top-right, pill shape, --raised-sm)
│
Page (max-width: 640px, centered)
├── Header
│     Logo — gradient text (accent → accent2)
│     Tagline — muted
│
├── NeuSurface[lg] — Search card
│     label "Streaming URL"
│     NeuInput[link icon]
│     NeuButton[primary] "Search all platforms →"
│
├── NeuSurface[md] — Song result (status=done only)
│     NeuIconWrapper[music note icon]
│     Found pill (recessed) + song title + artist
│     NeuButton[ghost] copy + NeuButton[ghost] back
│
├── Section label "Open on your platform"
│
└── Platform grid (auto-fill, minmax 136px)
      PlatformCard × N
        NeuIconWrapper + PlatformIcon
        Platform name
        Badge: "Open ↗" (accent, direct link) | "Search ↗" (muted)
```

**States:**
- `idle` → show search card only
- `loading` → neumorphic spinner (raised outer circle + recessed inner)
- `error` → NeuSurface with muted error text + back link
- `done` → song result + platform grid

### JamRoom (`/jam/:code`)

Same token system. Layout:

```
AuthBar (fixed top-right)
InviteBadge (top bar, NeuSurface[sm] pill)
│
Page (max-width: 800px, centered)
├── NowPlaying — NeuSurface[lg]
│     Song art (NeuIconWrapper large) + title + artist
│     Skip vote button (NeuButton[ghost]) + vote count pill (recessed)
│     YouTubeAutoPlayer embed (hidden, DJ only)
│
├── AddSongForm — NeuSurface[md]
│     NeuInput[music icon] + NeuButton[primary] "Add to queue"
│
├── Section label "Up next"
│
├── QueueList — vertical stack, gap 12px
│     QueueCard × N — NeuSurface[sm]
│       Position pill (recessed) + song info + platform icon
│       Status badge: playing (accent) | queued (muted) | played (muted, reduced opacity)
│
└── ParticipantList — NeuSurface[md] collapsible
      Avatar pills (NeuIconWrapper[sm] + name) — DJ marked with accent badge
```

All existing hooks (`useSession`, `useQueue`, `useParticipants`, `useSkipVotes`) unchanged — only visual layer changes.

### Login (`/login`)

Single centered NeuSurface with logo + Google OAuth button (ghost variant with Google icon).

### NotFound (`/404`)

Minimal: centered 404 text + back home ghost button.

---

## Icons

All icons: inline SVG, `currentColor`, uniform `--icons` color (`#4a4860`), same visual weight.

| Context | Size | Stroke |
|---|---|---|
| Platform cards | 22×22 | fill |
| Input prefix | 22×22 | 1.8px stroke |
| Button (action) | 18×18 | 2.2px stroke |
| Ghost buttons | 18×18 | 1.8px stroke |
| Auth bar | 18×18 | 1.8px stroke |

---

## Interaction States

| State | Shadow |
|---|---|
| Default raised | `--raised` |
| Hover raised | `--raised-lg` + `translateY(-3px)` |
| Active/press | `--pressed` + `translateY(0)` |
| Input default | outer `--raised`, inner `--recessed` |
| Input focus | + `0 0 0 3px var(--accent-soft)` on outer |
| Button active | `--pressed` + `translateY(1px)` |

Transition: `all 0.22s cubic-bezier(0.4, 0, 0.2, 1)` on all interactive elements.

---

## Dark Theme (Future)

Light theme is the base. Dark theme toggle is a future feature — not in scope for this implementation. When added, it will invert tokens via `[data-theme="dark"]` CSS vars:

```css
[data-theme="dark"] {
  --bg: #0f0f13;
  --surface: #0f0f13;
  --sd: rgba(0,0,0,0.5);
  --sl: rgba(255,255,255,0.04);
  --text: #e8e8f0;
  --muted: #8888a0;
}
```

---

## Migration Notes

- `base.css` token overhaul replaces all dark color vars
- `jam.module.css` gets updated shadow + color vars
- All inline `style={}` props in current components get replaced with base component usage
- No test runner — visual validation via `npm run dev`
- `.superpowers/` added to `.gitignore`
