const CORS = { 'Access-Control-Allow-Origin': '*' };

async function searchYouTube(query, apiKey) {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', query);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const item = data.items?.[0];
  if (!item?.id?.videoId) return { url: null, title: null };

  return {
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    title: item.snippet?.title ?? null,
  };
}

export default {
  async fetch(req, env) {
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

    if (!env.YOUTUBE_API_KEY) {
      return Response.json({ error: 'YOUTUBE_API_KEY secret not configured' }, { status: 500, headers: CORS });
    }

    try {
      const result = await searchYouTube(q, env.YOUTUBE_API_KEY);
      if (!result.url) {
        return Response.json({ error: 'no results' }, { status: 404, headers: CORS });
      }
      return Response.json(result, { headers: CORS });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 502, headers: CORS });
    }
  },
};
