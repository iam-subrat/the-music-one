import {
  extractYouTubeId,
  extractSearchQuery,
  isYouTubeSearchUrl,
} from "../lib/platform";

export async function resolveYouTubeVideo(item, request) {
  const url = item.platform_links?.youtube || item.platform_links?.youtubemusic;
  const directId = extractYouTubeId(url);
  if (directId) return { videoId: directId, title: null, persisted: false };

  const searchUrl = url && isYouTubeSearchUrl(url);
  const query = searchUrl
    ? extractSearchQuery(url)
    : `${item.title || ""} ${item.artist || ""}`.trim();
  if (!query) return { videoId: null, title: null, persisted: false };

  const result = await request(query);
  return {
    videoId: result?.id || null,
    title: result?.title || null,
    persisted: !searchUrl && !!result?.id,
  };
}
