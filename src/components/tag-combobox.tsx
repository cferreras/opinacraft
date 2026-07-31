"use client";

import { useEffect, useId, useRef, useState } from "react";

type Suggestion = { label: string; slug: string; usageCount: number };

export function TagCombobox({ name, initialTags = [], allowCreate = true }: { name: string; initialTags?: string[]; allowCreate?: boolean }) {
  const [selected, setSelected] = useState<string[]>(initialTags);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const listId = `${inputId}-list`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!query.trim()) { queueMicrotask(() => setSuggestions([])); return; }
    timer.current = setTimeout(() => {
      void fetch(`/api/tags/suggest?q=${encodeURIComponent(query)}`)
        .then((response) => response.ok ? response.json() : { tags: [] })
        .then((result) => { setSuggestions(result.tags ?? []); setActive(0); })
        .catch(() => setSuggestions([]));
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [query]);

  function add(label: string) {
    const clean = label.trim().replace(/\s+/g, " ");
    if (!clean || selected.length >= 8 || selected.some((item) => item.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
    setSelected((current) => [...current, clean]); setQuery(""); setSuggestions([]);
  }
  function remove(label: string) { setSelected((current) => current.filter((item) => item !== label)); }

  return <div>
    <div className="mt-2 flex min-h-11 flex-wrap items-center gap-2 rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-950" role="group" aria-label="Etiquetas">
      {selected.map((tag) => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800">{tag}<button type="button" onClick={() => remove(tag)} aria-label={`Eliminar ${tag}`}>×</button></span>)}
      <input id={inputId} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
        if (event.key === "ArrowDown") { event.preventDefault(); setActive((value) => Math.min(value + 1, suggestions.length - 1)); }
        else if (event.key === "ArrowUp") { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
        else if (event.key === "Enter") { event.preventDefault(); const suggestion = suggestions[active]; if (suggestion) add(suggestion.label); else if (allowCreate) add(query); }
        else if (event.key === "Escape") setSuggestions([]);
        else if (event.key === "Backspace" && !query && selected.length) remove(selected[selected.length - 1]!);
      }} role="combobox" aria-autocomplete="list" aria-controls={listId} aria-expanded={suggestions.length > 0} aria-label="Añadir etiqueta" className="h-8 min-w-32 flex-1 bg-transparent px-1 text-sm outline-none" placeholder={selected.length ? "Añadir…" : "Buscar etiquetas…"} />
    </div>
    <input type="hidden" name={name} value={selected.join(", ")} />
    {suggestions.length ? <ul id={listId} role="listbox" className="relative z-10 mt-1 max-h-52 overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">{suggestions.map((suggestion, index) => <li key={suggestion.slug} role="option" aria-selected={index === active}><button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => add(suggestion.label)} className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${index === active ? "bg-zinc-100 dark:bg-zinc-800" : ""}`}><span>{suggestion.label}</span><span className="text-xs text-zinc-500">({suggestion.usageCount})</span></button></li>)}</ul> : null}
    <span className="mt-1 block text-xs font-normal text-zinc-500">Hasta 8 etiquetas. Escribe para buscar y pulsa Enter para seleccionar.</span>
  </div>;
}
