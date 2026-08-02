"use client";

import { useEffect, useState } from "react";
import { IconPhoto, IconUpload } from "@tabler/icons-react";

type Media = { kind: "logo" | "banner"; url: string; bytes: number; width: number; height: number };

export function MediaUploadForm({ serverId }: { serverId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [active, setActive] = useState<Media[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    if (!file) {
      queueMicrotask(() => {
        if (!cancelled) setSelectedPreview(null);
      });
      return () => {
        cancelled = true;
      };
    }

    const url = URL.createObjectURL(file);
    queueMicrotask(() => {
      if (!cancelled) setSelectedPreview(url);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.set("kind", "logo");
    body.set("file", file);
    setPending(true);
    setProgress(0);
    setMessage(null);

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
      if (request.status >= 200 && request.status < 300) {
        setFile(null);
        void refresh();
      }
    };
    request.onerror = () => {
      setPending(false);
      setMessage("No se pudo subir la imagen.");
    };
    request.send(body);
  }

  async function remove(kindToRemove: "logo" | "banner") {
    setMessage(null);
    const response = await fetch(`/api/servers/${serverId}/media?kind=${kindToRemove}`, { method: "DELETE" });
    setMessage(response.ok ? "Imagen eliminada." : "No se pudo quitar la imagen.");
    if (response.ok) void refresh();
  }

  return (
    <section className="rounded-2xl border border-[#e0e6eb] bg-white p-5 shadow-[0_1px_2px_rgba(16,30,45,0.02)] sm:p-6" aria-labelledby="branding-heading">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#2d34cf]"><IconPhoto aria-hidden="true" size={17} stroke={1.7} /></span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#7a86a0]">Presencia de marca</p>
          <h2 id="branding-heading" className="mt-1 text-[18px] font-semibold tracking-[-0.025em] text-[#101722]">Imágenes de marca</h2>
          <p className="mt-1.5 text-[11px] leading-5 text-[#667287]">Por ahora solo usamos el logo en la web; no es necesario subir un banner.</p>
        </div>
      </div>

      <p className="mt-5 rounded-lg bg-[#f7f8fa] px-3 py-2.5 text-[10px] leading-4 text-[#718097]">El logo se convierte a WebP automáticamente. Tamaño máximo: 500 KB.</p>

      {active.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {active.map((media) => (
            <div key={media.kind} className="overflow-hidden rounded-xl border border-[#e1e6eb] bg-[#fbfcff]">
              <div className={`flex items-center justify-center bg-[#f4f6fb] p-3 ${media.kind === "banner" ? "aspect-[2.5/1]" : "aspect-[1.6/1]"}`}>
                <img src={media.url} alt={`${media.kind} preview`} className="max-h-full w-full object-contain" />
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-[#e5e9ee] px-3 py-2.5 text-[10px]">
                <span className="font-medium capitalize text-[#35415b]">{media.kind} <span className="font-normal text-[#8a95a5]">· {Math.round(media.bytes / 1024)} KB</span></span>
                <button type="button" onClick={() => void remove(media.kind)} className="font-semibold text-[#c43b45] transition hover:text-[#9f2934]">Quitar</button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <form onSubmit={submit} className="mt-5 rounded-xl border border-dashed border-[#cfd6df] bg-[#fbfcff] p-4">
        <input type="hidden" name="kind" value="logo" />
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="rounded-lg border border-[#e0e5ff] bg-[#f7f7ff] px-3 py-2.5">
            <p className="text-[11px] font-semibold text-[#35415b]">Logo del servidor</p>
            <p className="mt-0.5 text-[10px] leading-4 text-[#718097]">Se mostrará en el directorio y en la ficha pública.</p>
          </div>
          <label className="block min-w-0 text-[11px] font-semibold text-[#35415b]">
            Archivo del logo
            <input name="file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required className="mt-2 block h-10 w-full min-w-0 rounded-lg border border-[#dce2e7] bg-white px-2 py-2 text-[11px] text-[#59677c] file:mr-2 file:rounded-md file:border-0 file:bg-[#f0f1ff] file:px-2 file:py-1 file:text-[10px] file:font-semibold file:text-[#2d34cf]" />
          </label>
          <button disabled={pending || !file} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#3029e7] px-4 text-[11px] font-semibold text-white shadow-[0_4px_10px_rgba(48,41,231,0.13)] transition hover:bg-[#2821c8] disabled:cursor-not-allowed disabled:opacity-50">
            <IconUpload aria-hidden="true" size={15} stroke={1.8} />
            {pending ? `Subiendo... ${progress}%` : "Subir"}
          </button>
        </div>
      </form>

      {selectedPreview ? <img src={selectedPreview} alt="Preview" className="mt-4 max-h-40 rounded-lg border border-[#e1e6eb] object-contain" /> : null}
      {message ? <p className="mt-3 text-[11px] text-[#59677c]" role="status">{message}</p> : null}
    </section>
  );
}
