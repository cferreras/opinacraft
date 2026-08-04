"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

type Suggestion = { label: string; slug: string; usageCount: number };
function isSuggestion(value: unknown): value is Suggestion { if (typeof value !== "object" || value === null) return false; const suggestion = value as { label?: unknown; slug?: unknown; usageCount?: unknown }; return typeof suggestion.label === "string" && typeof suggestion.slug === "string" && typeof suggestion.usageCount === "number" && Number.isFinite(suggestion.usageCount); }
function parseSuggestions(value: unknown): Suggestion[] { if (typeof value !== "object" || value === null) return []; const tags = (value as { tags?: unknown }).tags; return Array.isArray(tags) && tags.every(isSuggestion) ? tags : []; }

type TagComboboxProps = { name: string; initialTags?: string[]; allowCreate?: boolean; compact?: boolean; label?: string; ariaLabel?: string; submitOnChange?: boolean; resetPagination?: boolean };

export function TagCombobox({ name, initialTags = [], allowCreate = true, compact = false, label, submitOnChange = false, resetPagination = false, ariaLabel = "Añadir etiqueta" }: TagComboboxProps) {
  const [selected, setSelected] = useState<string[]>(initialTags);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldSubmitRef = useRef(false);

  useEffect(() => {
    if (!submitOnChange || !shouldSubmitRef.current) return;
    shouldSubmitRef.current = false;
    queueMicrotask(() => {
      const form = inputRef.current?.form;
      if (!form) return;
      if (!resetPagination) {
        const page = new URL(window.location.href).searchParams.get("page");
        if (page) {
          const pageField = form.querySelector<HTMLInputElement>('input[name="page"]');
          if (pageField) pageField.value = page;
          else { const hiddenPage = document.createElement("input"); hiddenPage.type = "hidden"; hiddenPage.name = "page"; hiddenPage.value = page; form.appendChild(hiddenPage); }
        }
      }
      form.requestSubmit();
    });
  }, [selected, submitOnChange, resetPagination]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    if (!query.trim()) return () => controller.abort();
    timer.current = setTimeout(() => { timer.current = null; void fetch(`/api/tags/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => response.ok ? response.json() : { tags: [] }).then((result: unknown) => { if (!controller.signal.aborted) { setSuggestions(parseSuggestions(result)); setActive(0); } }).catch((error: unknown) => { if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) setSuggestions([]); }); }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); controller.abort(); };
  }, [query]);

  function add(labelToAdd: string) {
    const clean = labelToAdd.trim().replace(/\s+/g, " ");
    if (!clean || selected.length >= 8 || selected.some((item) => item.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
    shouldSubmitRef.current = true; setSelected((current) => [...current, clean]); setQuery(""); setSuggestions([]);
  }
  function remove(labelToRemove: string) { shouldSubmitRef.current = true; setSelected((current) => current.filter((item) => item !== labelToRemove)); }

  const placeholder = selected.length ? (compact ? "Añadir otra…" : "Añadir…") : compact ? "Escribe una etiqueta…" : "Buscar etiquetas…";
  return (
    <Field className={compact ? "relative z-40 gap-1" : "gap-1"}>
      {label ? <FieldLabel htmlFor={inputId}>{label}</FieldLabel> : null}
      <Popover open={Boolean(query && suggestions.length)}>
        <PopoverAnchor asChild>
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1 transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            {selected.map((tag) => <Badge key={tag} variant="outline" className="gap-1 pr-1">{tag}<Button type="button" variant="ghost" size="icon-xs" onClick={() => remove(tag)} aria-label={`Eliminar ${tag}`}><X className="size-3" /></Button></Badge>)}
            <Input ref={inputRef} id={inputId} value={query} onChange={(event) => { const next = event.target.value; setQuery(next); if (!next.trim()) { setSuggestions([]); setActive(0); } }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, suggestions.length - 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); } else if (event.key === "Enter") { event.preventDefault(); const suggestion = suggestions[active]; if (suggestion) add(suggestion.label); else if (allowCreate) add(query); } else if (event.key === "Escape") setSuggestions([]); else if (event.key === "Backspace" && !query && selected.length) remove(selected[selected.length - 1]!); }} role="combobox" aria-autocomplete="list" aria-expanded={suggestions.length > 0} aria-label={label ? undefined : ariaLabel} placeholder={placeholder} className={`h-7 min-w-24 flex-1 border-0 px-1 shadow-none focus-visible:ring-0 ${compact ? "text-xs" : "text-sm"}`} />
          </div>
        </PopoverAnchor>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0" onOpenAutoFocus={(event) => event.preventDefault()}>
          <Command shouldFilter={false}><CommandList><CommandEmpty>No hay etiquetas coincidentes.</CommandEmpty><CommandGroup heading="Sugerencias">{suggestions.map((suggestion, index) => <CommandItem key={suggestion.slug} value={suggestion.label} data-selected={index === active} onSelect={() => add(suggestion.label)}><span>{suggestion.label}</span><span className="ml-auto text-xs text-muted-foreground">({suggestion.usageCount})</span></CommandItem>)}</CommandGroup></CommandList></Command>
        </PopoverContent>
      </Popover>
      <input type="hidden" name={name} value={selected.join(", ")} />
      {!compact ? <p className="text-xs text-muted-foreground">Hasta 8 etiquetas. Escribe y pulsa Enter para seleccionar.</p> : null}
    </Field>
  );
}
