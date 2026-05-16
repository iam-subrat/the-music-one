// ui/vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        headers: { Connection: 'keep-alive' },
      },
    },
  },
  define: {
    __FLAG_JAM_SESSION__:         JSON.stringify(process.env.FLAG_JAM_SESSION         ?? 'true'),
    __FLAG_VOTE_TO_SKIP__:        JSON.stringify(process.env.FLAG_VOTE_TO_SKIP        ?? 'true'),
    __FLAG_DJ_TOKEN__:            JSON.stringify(process.env.FLAG_DJ_TOKEN            ?? 'true'),
    __FLAG_YOUTUBE_EMBED__:       JSON.stringify(process.env.FLAG_YOUTUBE_EMBED       ?? 'true'),
    __FLAG_AUTO_PLAY_QUEUE__:     JSON.stringify(process.env.FLAG_AUTO_PLAY_QUEUE     ?? 'true'),
    __FLAG_PLATFORM_AUTODETECT__: JSON.stringify(process.env.FLAG_PLATFORM_AUTODETECT ?? 'true'),
    __FLAG_REACTIONS__:           JSON.stringify(process.env.FLAG_REACTIONS           ?? 'false'),
    __FLAG_CHAT__:                JSON.stringify(process.env.FLAG_CHAT                ?? 'false'),
    __FLAG_SESSION_HISTORY__:     JSON.stringify(process.env.FLAG_SESSION_HISTORY     ?? 'false'),
    __FLAG_USER_PROFILES__:       JSON.stringify(process.env.FLAG_USER_PROFILES       ?? 'false'),
    __FLAG_SHARED_PLAYLISTS__:    JSON.stringify(process.env.FLAG_SHARED_PLAYLISTS    ?? 'false'),
    __FLAG_DISCOVERY_FEED__:      JSON.stringify(process.env.FLAG_DISCOVERY_FEED      ?? 'false'),
    __FLAG_TASTE_MATCHING__:      JSON.stringify(process.env.FLAG_TASTE_MATCHING      ?? 'false'),
    __FLAG_SCHEDULED_JAMS__:      JSON.stringify(process.env.FLAG_SCHEDULED_JAMS      ?? 'false'),
    __FLAG_QUEUE_RULES__:         JSON.stringify(process.env.FLAG_QUEUE_RULES         ?? 'false'),
    __FLAG_EMBED_WIDGET__:        JSON.stringify(process.env.FLAG_EMBED_WIDGET        ?? 'false'),
    __FLAG_PLAYLIST_IMPORT__:     JSON.stringify(process.env.FLAG_PLAYLIST_IMPORT     ?? 'false'),
  },
});
