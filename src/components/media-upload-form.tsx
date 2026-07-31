"use client";

import { useEffect, useState } from "react";

type Media = { kind: "logo" | "banner"; url: string; bytes: number; width: number; height: number };

export function MediaUploadForm({ serverId }: { serverId: string }) {
  const [kind, setKind] = useState<"logo" | "banner">("logo");
  const [file, setFile] = useState<File | null>(null);
  const [active, setActive] = useState<Media[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);

  async function refresh() {
    const response = await fetch(`/api/servers/${serverId}/media`, { cache: "no-store" });
    if (response.ok) setActive((await response.json()).active ?? []);
  }
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/servers/${serverId}/media`, { cache: "no-store" }).then(async (response) => {
      if (!cancelled && response.ok) setActive((await response.json()).active ?? []);
    });
    return () => { cancelled = true; };
  }, [serverId]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    setPending(true); setProgress(0); setMessage(null);
    const request = new XMLHttpRequest();
    request.open("POST", `/api/servers/${serverId}/media`);
    request.upload.onprogress = (progressEvent) => {
      if (progressEvent.lengthComputable) setProgress(Math.round(progressEvent.loaded / progressEvent.total * 100));
    };
    request.onload = () => {
      let result: { error?: string } = {};
      try { result = JSON.parse(request.responseText); } catch { /* ignored */ }
      setMessage(request.status >= 200 && request.status < 300 ? "Imagen subida." : result.error ?? "No se pudo subir la imagen.");
      setPending(false);
      if (request.status >= 200 && request.status < 300) { setFile(null); void refresh(); }
    };
    request.onerror = () => { setPending(false); setMessage("No se pudo subir la imagen."); };
    request.send(body);
  }

  async function remove(kindToRemove: "logo" | "banner") {
    setMessage(null);
    const response = await fetch(`/api/servers/${serverId}/media?kind=${kindToRemove}`, { method: "DELETE" });
    setMessage(response.ok ? "Imagen eliminada." : "No se pudo eliminar la imagen.");
    if (response.ok) void refresh();
  }

  const selectedPreview = file ? URL.createObjectURL(file) : null;
  return <section className="rounded-xl border border-zinc-200 p-5 dark:border-zinc-800">
    <h2 className="text-base font-semibold">Imágenes de marca</h2>
    <p className="mt-1 text-sm text-zinc-500">Se convierten a WebP. Logo máximo 500 KB; banner máximo 1,5 MB.</p>
    {active.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2">{active.map((media) => <div key={media.kind} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"><img src={media.url} alt={media.kind} className="max-h-32 w-full object-contain" /><div className="mt-2 flex items-center justify-between text-xs text-zinc-500"><span>{media.kind} · {Math.round(media.bytes / 1024)} KB</span><button type="button" onClick={() => void remove(media.kind)} className="underline">Eliminar</button></div></div>)}</div> : null}
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
      <label className="text-sm font-medium">Tipo<select name="kind" value={kind} onChange={(event) => setKind(event.target.value as "logo" | "banner")} className="mt-2 block h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-950"><option value="logo">Logo</option><option value="banner">Banner</option></select></label>
      <label className="text-sm font-medium">Imagen<input name="file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required className="mt-2 block h-10 text-sm" /></label>
      <button disabled={pending || !file} className="h-10 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50 dark:bg-white dark:text-zinc-950">{pending ? `Subiendo… ${progress}%` : "Subir"}</button>
    </form>
    {selectedPreview ? <img src={selectedPreview} alt="Vista previa" className="mt-4 max-h-40 rounded-lg object-contain" /> : null}
    {message ? <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400" role="status">{message}</p> : null}
  </section>;
}
