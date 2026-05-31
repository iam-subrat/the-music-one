// Dynamic config — merges app.json with secrets from process.env.
// Secrets live in .env.local (gitignored). Loaded via dotenv.
require('dotenv').config({ path: '.env.local' });

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra ?? {}),
    apiUrl: process.env.API_URL ?? 'http://localhost:8000',
    webUrl: process.env.WEB_URL ?? 'https://staging.themusic.one',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
  },
});
