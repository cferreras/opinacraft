export type YouTubeTrailer = { id: string; isShort: boolean };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

// Reads the video id out of every link shape owners paste: watch?v=, youtu.be/, /shorts/, /embed/, /live/.
// Anything that is not a YouTube video returns null, so only the 11-character id is ever trusted.
export function parseYouTubeTrailer(value: string): YouTubeTrailer | null {
  const candidate = value.trim();
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(
      candidate.startsWith("//") ? `https:${candidate}` : /^[a-z][a-z0-9+.-]*:\/\//i.test(candidate) ? candidate : `https://${candidate}`,
    );
  } catch {
    return null;
  }

  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  let isShort = false;

  if (host === "youtu.be") {
    id = segments[0];
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (segments[0] === "watch") {
      id = url.searchParams.get("v") ?? undefined;
    } else if (segments[0] === "shorts") {
      id = segments[1];
      isShort = true;
    } else if (segments[0] === "embed" || segments[0] === "live" || segments[0] === "v") {
      id = segments[1];
    }
  }

  return id && VIDEO_ID.test(id) ? { id, isShort } : null;
}

// What gets stored: one canonical link per video, so the edit form shows a clean URL and the
// Short/normal distinction survives without a second column.
export function canonicalTrailerUrl({ id, isShort }: YouTubeTrailer) {
  return isShort ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
}

export function trailerEmbedUrl(id: string) {
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0`;
}
