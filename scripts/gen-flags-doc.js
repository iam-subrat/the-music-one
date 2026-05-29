#!/usr/bin/env node
/**
 * Generates docs/feature-flags.md from ui/vite.config.js defaults.
 * Run: node scripts/gen-flags-doc.js
 * Or:  cd ui && npm run docs:flags
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITE_CONFIG = resolve(ROOT, 'ui/vite.config.js');
const OUT = resolve(ROOT, 'docs/feature-flags.md');

const src = readFileSync(VITE_CONFIG, 'utf8');

const FLAG_RE = /__FLAG_(\w+)__:\s*JSON\.stringify\(process\.env\.FLAG_\w+\s*\?\?\s*'(true|false)'\)/g;

const flags = [];
let match;
while ((match = FLAG_RE.exec(src)) !== null) {
  flags.push({ name: match[1], default: match[2] === 'true' });
}

if (flags.length === 0) {
  console.error('No flags found — check regex against vite.config.js format');
  process.exit(1);
}

const enabled = flags.filter(f => f.default);
const disabled = flags.filter(f => !f.default);

const row = f => `| \`${f.name}\` | ${f.default ? '✅ on' : '❌ off'} |`;

const doc = `# Feature Flags

> Auto-generated from \`ui/vite.config.js\`. Do not edit manually.
> Regenerate: \`cd ui && npm run docs:flags\`

Flags are compile-time injected by Vite (\`FLAG_*\` env vars). Runtime state (without redeploy) is managed via the Supabase \`feature_flags\` table and served at \`GET /api/flags/\`.

## Defaults

| Flag | Default |
|------|---------|
${flags.map(row).join('\n')}

## Enabled by default (${enabled.length})

${enabled.map(f => `- \`${f.name}\``).join('\n')}

## Disabled by default (${disabled.length})

${disabled.map(f => `- \`${f.name}\``).join('\n')}

## Toggling without redeploy

1. Open Supabase dashboard → Table Editor → \`feature_flags\`
2. Set \`enabled\` on the relevant row
3. Changes take effect on next page load (flags fetched at \`/api/flags/\` on mount)

## Adding a new flag

1. Add \`__FLAG_MYFEATURE__\` to \`ui/vite.config.js\` \`define\` block
2. Add \`MYFEATURE: JSON.parse(__FLAG_MYFEATURE__)\` to \`ui/src/lib/flags.js\`
3. Run \`cd ui && npm run docs:flags\` to regenerate this file
4. Insert a row in the \`feature_flags\` table for runtime control
`;

writeFileSync(OUT, doc);
console.log(`Written ${flags.length} flags → docs/feature-flags.md`);
