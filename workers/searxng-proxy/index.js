const CORS = { 'Access-Control-Allow-Origin': '*' };

// Public Invidious instances — tried in order, first success wins.
const INSTANCES = [
  'https://inv.nadeko.net',
  'https://inv.tux.pizza',
  'https://invidious.perennialte.ch',
  'https://iv.datura.network',
  'https://yt.artemislena.eu',
  'https://invidious.nikkosphere.com',
];

async function searchYouTube(query) {
  const errors = [];
  for (const base of INSTANCES) {
    try {
      // No `fields` param — some instances don't support it and return errors
      const url = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) { errors.push(`${base}: ${res.status}`); continue; }
      const data = await res.json();
      const first = Array.isArray(data) && data.find(r => r.videoId);
      if (first?.videoId) {
        return {
          url: `https://www.youtube.com/watch?v=${first.videoId}`,
          title: first.title ?? null,
          via: base,
        };
      }
      errors.push(`${base}: no videoId in results`);
    } catch (e) {
      errors.push(`${base}: ${e.message}`);
    }
  }
  return { url: null, title: null, errors };
}

export default {
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q');
    if (!q) return Response.json({ error: 'missing q' }, { status: 400, headers: CORS });

    const result = await searchYouTube(q);

    if (!result.url) {
      return Response.json(
        { error: 'no results', debug: result.errors },
        { status: 502, headers: CORS },
      );
    }

    return Response.json(
      { url: result.url, title: result.title },
      { headers: CORS },
    );
  },
};
