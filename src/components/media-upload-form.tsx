"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

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
    if (!selectedPreview) return;
    return () => URL.revokeObjectURL(selectedPreview);
  }, [selectedPreview]);

  function handleFileChange(nextFile: File | null) {
    if (selectedPreview) URL.revokeObjectURL(selectedPreview);
    setFile(nextFile);
    setSelectedPreview(nextFile ? URL.createObjectURL(nextFile) : null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    const body = new FormData();
    body.set("kind", "logo");
    body.set("file", file);
    setPending(true); setProgress(0); setMessage(null);
    const request = new XMLHttpRequest();
    request.open("POST", `/api/servers/${serverId}/media`);
    request.upload.onprogress = (event) => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
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

  async function remove(kind: "logo" | "banner") {
    setMessage(null);
    const response = await fetch(`/api/servers/${serverId}/media?kind=${kind}`, { method: "DELETE" });
    setMessage(response.ok ? "Imagen eliminada." : "No se pudo quitar la imagen.");
    if (response.ok) void refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="size-4 text-primary" /> Imágenes de marca</CardTitle><p className="text-sm text-muted-foreground">El logo se convierte a WebP automáticamente. Tamaño máximo: 500 KB.</p></CardHeader>
      <CardContent className="grid gap-5">
        {active.length ? <div className="grid gap-3 sm:grid-cols-2">{active.map((media) => <div key={media.kind} className="overflow-hidden rounded-lg border"><div className="flex aspect-[1.6/1] items-center justify-center bg-muted p-3"><img src={media.url} alt={`${media.kind} preview`} className="max-h-full w-full object-contain" /></div><div className="flex items-center justify-between gap-3 border-t px-3 py-2.5"><Badge variant="secondary" className="capitalize">{media.kind} · {Math.round(media.bytes / 1024)} KB</Badge><Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => void remove(media.kind)}><Trash2 className="size-3.5" /> Quitar</Button></div></div>)}</div> : null}
        <form onSubmit={submit} className="grid gap-4 rounded-lg border border-dashed p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <Field><FieldLabel htmlFor="server-logo-file">Archivo del logo</FieldLabel><Input id="server-logo-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)} required /><FieldDescription>Se mostrará en el directorio y en la ficha pública.</FieldDescription></Field>
          <Button type="submit" disabled={pending || !file}><Upload className="size-4" />{pending ? `Subiendo… ${progress}%` : "Subir logo"}</Button>
        </form>
        {selectedPreview ? <img src={selectedPreview} alt="Vista previa" className="max-h-40 rounded-lg border object-contain" /> : null}
        {message ? <Alert><AlertDescription>{message}</AlertDescription></Alert> : null}
      </CardContent>
    </Card>
  );
}
