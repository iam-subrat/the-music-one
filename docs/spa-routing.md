# SPA Routing on GitHub Pages

MusicOne is a single-page application (SPA) deployed to GitHub Pages. Direct navigation to `/jam/:code` routes require special handling.

## Problem

GitHub Pages doesn't understand `/jam/:code` as a route — it looks for a file at `jam/:code/index.html`, which doesn't exist. The request returns 404.

## Solution

`public/404.html` is a custom 404 page that captures the original URL and redirects to:

```
/?redirect=/jam/:code
```

React Router then reads the `redirect` query parameter and navigates to the intended route.

## How it works

1. User clicks link to `/jam/abc123`
2. GitHub Pages returns `404.html` (automatic fallback for 404s)
3. `404.html` extracts the path and redirects to `/?redirect=/jam/abc123`
4. React Router mounts and parses the redirect parameter
5. App navigates to `/jam/abc123`

## Implementation

`public/404.html` contains JavaScript that:
- Reads `window.location.pathname`
- Redirects to `/?redirect=<pathname>`

No build step required; GitHub Pages automatically serves this for any 404.

## Testing locally

```bash
npm run preview
# Open http://localhost:4173/?redirect=/jam/test
# Should see jam session for 'test' code
```

Direct navigation to `/jam/test` won't work locally (dev server isn't GitHub Pages), so use the redirect parameter during testing.

## Production domains

Works on both:
- GitHub Pages default: `iam-subrat.github.io`
- Custom domain: configured via `CNAME_DOMAIN` GitHub Actions variable
