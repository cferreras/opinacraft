import { parseYouTubeTrailer, trailerEmbedUrl } from "@/lib/servers/trailer";

// Normal videos play 16:9 at the width of the column; a Short is vertical, so it keeps a narrow 9:16 frame.
export function ServerTrailer({ url, serverName }: { url: string | null; serverName: string }) {
  const trailer = url ? parseYouTubeTrailer(url) : null;
  if (!trailer) return null;

  return (
    <section aria-labelledby="trailer-heading" className="order-4 grid gap-3 lg:order-none">
      <h2 id="trailer-heading" className="text-[0.9375rem] font-extrabold">Tráiler</h2>
      <div className={trailer.isShort ? "w-full max-w-[17.5rem]" : "w-full"}>
        <iframe
          className={`w-full rounded-xl border bg-muted ${trailer.isShort ? "aspect-[9/16]" : "aspect-video"}`}
          src={trailerEmbedUrl(trailer.id)}
          title={`Tráiler de ${serverName}`}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    </section>
  );
}
