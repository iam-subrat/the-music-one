import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: { dedupe: ['react', 'react-dom'] },
  define: { __FLAG_INDEPENDENT_PLAYBACK__: JSON.stringify(process.env.FLAG_INDEPENDENT_PLAYBACK ?? 'false') },
})
