const SEARXNG_BASE = 'https://searx.be';

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
    if (!q) return Response.json({ error: 'missing q' }, { status: 400 });

    const url = `${SEARXNG_BASE}/search?q=${encodeURIComponent(q)}&engines=youtube&format=json`;

    let data;
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': 'themusic.one/1.0' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`SearXNG ${res.status}`);
      data = await res.json();
    } catch (e) {
      return Response.json({ error: e.message }, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    }

    const first = data.results?.find(r => r.url?.includes('youtube.com/watch'));

    return Response.json(
      { url: first?.url ?? null, title: first?.title ?? null },
      { headers: { 'Access-Control-Allow-Origin': '*' } },
    );
  },
};
