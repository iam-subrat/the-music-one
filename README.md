# MusicOne

Static site — paste any music streaming URL, get search links for every platform.

## Supported platforms

Spotify · Apple Music · YouTube Music · Amazon Music · Tidal · Deezer · SoundCloud · JioSaavn · Gaana

## Usage

```
https://your-site/?url=<streaming-url>
```

Paste a link from any platform → site fetches song title + artist via [odesli API](https://odesli.co) → renders search links for all platforms.

## Local dev

Just open `index.html` in a browser. No build step, no server needed.

## Deploy to GitHub Pages

1. Create a public GitHub repo
2. Push this folder
3. Settings → Pages → Source: `main` / root
4. Done — live at `https://<username>.github.io/<repo-name>/`
