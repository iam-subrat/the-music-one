const CORS = { 'Access-Control-Allow-Origin': '*' };

// Public Invidious instances — tried in order, first success wins.
const INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nikkosphere.com',
  'https://yt.artemislena.eu',
];

async function searchYouTube(query) {
  for (const base of INSTANCES) {
    try {
      const url = `${base}/api/v1/search?q=${encodeURIComponent(query)}&type=video&fields=videoId,title`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const first = data?.[0];
      if (first?.videoId) {
        return {
          url: `https://www.youtube.com/watch?v=${first.videoId}`,
          title: first.title ?? null,
        };
      }
    } catch { continue; }
  }
  return { url: null, title: null };
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
      return Response.json({ error: 'no results' }, { status: 502, headers: CORS });
    }

    return Response.json(result, { headers: CORS });
  },
};
