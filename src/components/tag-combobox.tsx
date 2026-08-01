"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";

type Suggestion = { label: string; slug: string; usageCount: number };

function isSuggestion(value: unknown): value is Suggestion {
  if (typeof value !== "object" || value === null) return false;
  const suggestion = value as { label?: unknown; slug?: unknown; usageCount?: unknown };
  return (
    typeof suggestion.label === "string" &&
    typeof suggestion.slug === "string" &&
    typeof suggestion.usageCount === "number" &&
    Number.isFinite(suggestion.usageCount)
  );
}

function parseSuggestions(value: unknown): Suggestion[] {
  if (typeof value !== "object" || value === null) return [];
  const tags = (value as { tags?: unknown }).tags;
  return Array.isArray(tags) && tags.every(isSuggestion) ? tags : [];
}

type TagComboboxProps = {
  name: string;
  initialTags?: string[];
  allowCreate?: boolean;
  compact?: boolean;
  ariaLabel?: string;
  submitOnChange?: boolean;
};

export function TagCombobox({
  name,
  initialTags = [],
  allowCreate = true,
  compact = false,
  submitOnChange = false,
  ariaLabel = "Añadir etiqueta",
}: TagComboboxProps) {
  const [selected, setSelected] = useState<string[]>(initialTags);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const inputId = useId();
  const listId = `${inputId}-list`;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const shouldSubmitRef = useRef(false);

  useEffect(() => {
    if (!submitOnChange || !shouldSubmitRef.current) return;
    shouldSubmitRef.current = false;
    queueMicrotask(() => {
      const form = inputRef.current?.form;
      if (!form) return;

      const page = new URL(window.location.href).searchParams.get("page");
      if (page) {
        const pageField = form.querySelector<HTMLInputElement>('input[name="page"]');
        if (pageField) {
          pageField.value = page;
        } else {
          const hiddenPage = document.createElement("input");
          hiddenPage.type = "hidden";
          hiddenPage.name = "page";
          hiddenPage.value = page;
          form.appendChild(hiddenPage);
        }
      }

      form.requestSubmit();
    });
  }, [selected, submitOnChange]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const controller = new AbortController();
    if (!query.trim()) {
      queueMicrotask(() => {
        if (controller.signal.aborted) return;
        setSuggestions([]);
        setActive(0);
      });
      return () => controller.abort();
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      void fetch(`/api/tags/suggest?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { tags: [] }))
        .then((result: unknown) => {
          if (controller.signal.aborted) return;
          setSuggestions(parseSuggestions(result));
          setActive(0);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
          setSuggestions([]);
          setActive(0);
        });
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      controller.abort();
    };
  }, [query]);

  function add(label: string) {
    const clean = label.trim().replace(/\s+/g, " ");
    if (!clean || selected.length >= 8 || selected.some((item) => item.toLocaleLowerCase() === clean.toLocaleLowerCase())) return;
    shouldSubmitRef.current = true;
    setSelected((current) => [...current, clean]);
    setQuery("");
    setSuggestions([]);
  }

  function remove(label: string) {
    shouldSubmitRef.current = true;
    setSelected((current) => current.filter((item) => item !== label));
  }

  const controlClass = compact
    ? "min-h-9 rounded-lg px-2"
    : "mt-2 min-h-11 rounded-lg px-2 py-1";
  const inputClass = compact
    ? "h-7 min-w-24 text-[11px]"
    : "h-8 min-w-32 text-sm";
  const placeholder = selected.length
    ? compact
      ? "Añadir otra…"
      : "Añadir…"
    : compact
      ? "Escribe una modalidad…"
      : "Buscar etiquetas…";
  const optionId = (slug: string) => `${listId}-option-${encodeURIComponent(slug)}`;
  const activeSuggestion = suggestions[active];

  return (
    <div className={compact ? "relative z-40" : undefined}>
      <div
        className={`${controlClass} flex flex-wrap items-center gap-1.5 border border-[#e1e6e9] bg-white focus-within:border-[#4655e8] focus-within:ring-2 focus-within:ring-[#4655e8]/15`}
        role="group"
        aria-label="Etiquetas"
      >
        {selected.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-md border border-[#e0e5ea] bg-[#fafbfc] px-2 py-1 text-[10px] font-medium text-[#35415b]">
            {tag}
            <button type="button" onClick={() => remove(tag)} aria-label={`Eliminar ${tag}`} className="rounded-full text-[#7b86a0] hover:bg-[#f0f1ff] hover:text-[#2d34cf]">
              <IconX aria-hidden="true" size={11} stroke={2} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((value) => Math.min(value + 1, suggestions.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((value) => Math.max(value - 1, 0));
            } else if (event.key === "Enter") {
              event.preventDefault();
              const suggestion = suggestions[active];
              if (suggestion) add(suggestion.label);
              else if (allowCreate) add(query);
            } else if (event.key === "Escape") {
              setSuggestions([]);
            } else if (event.key === "Backspace" && !query && selected.length) {
              remove(selected[selected.length - 1]!);
            }
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={suggestions.length > 0}
          aria-activedescendant={activeSuggestion ? optionId(activeSuggestion.slug) : undefined}
          aria-label={ariaLabel}
          className={`${inputClass} flex-1 bg-transparent px-1 outline-none placeholder:text-[#8b96a1]`}
          placeholder={placeholder}
        />
      </div>
      <input type="hidden" name={name} value={selected.join(", ")} />
      {suggestions.length ? (
        <ul
          id={listId}
          role="listbox"
          className={`${compact ? "absolute inset-x-0 top-full" : "relative"} z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-zinc-200 bg-white p-1 shadow-lg`}
        >
          {suggestions.map((suggestion, index) => (
            <li id={optionId(suggestion.slug)} key={suggestion.slug} role="option" aria-selected={index === active}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => add(suggestion.label)}
                className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm ${index === active ? "bg-zinc-100" : ""}`}
              >
                <span>{suggestion.label}</span>
                <span className="text-xs text-zinc-500">({suggestion.usageCount})</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!compact ? <span className="mt-1 block text-xs font-normal text-zinc-500">Hasta 8 etiquetas. Escribe para buscar y pulsa Enter para seleccionar.</span> : null}
    </div>
  );
}
