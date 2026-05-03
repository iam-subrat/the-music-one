const CORS = { 'Access-Control-Allow-Origin': '*' };

// Piped API instances (alternative YouTube frontend, more stable than Invidious)
const INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.yt',
  'https://piped-api.garudalinux.org',
  'https://pipedapi.tokhmi.xyz',
];

async function searchYouTube(query) {
  const errors = [];
  for (const base of INSTANCES) {
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}&filter=videos`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) { errors.push(`${base}: ${res.status}`); continue; }
      const data = await res.json();
      const first = data?.items?.find(r => r.url?.includes('/watch?v='));
      if (first?.url) {
        const videoId = new URL('https://youtube.com' + first.url).searchParams.get('v');
        if (videoId) {
          return {
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: first.title ?? null,
          };
        }
      }
      errors.push(`${base}: no results`);
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
