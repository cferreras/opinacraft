"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ChangeEvent, KeyboardEvent, MouseEvent } from "react";
import { LoaderCircle, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { useSyncedFieldValue } from "@/hooks/use-synced-field-value";
import { SEARCH_QUERY_MAX_LENGTH } from "@/lib/servers/catalog-search";

type NavigateOptions = Parameters<ReturnType<typeof useFilterFormNavigation>>[1];

/** Whether a keystroke belongs to something the visitor is already typing into. */
function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

/**
 * The catalog's search box: type, press Enter or "Buscar", and the results follow.
 *
 * It sits inside the catalog's GET form with `name="q"`, so without JavaScript it is still a working
 * search. With JavaScript it navigates on the client, shows that a search is in flight, can be
 * emptied with one click, and takes focus from anywhere on the page with "/".
 */
export function ServerSearchBox({ value: incomingValue, cleared }: { value: string; cleared: boolean }) {
  const navigate = useFilterFormNavigation();
  // A search that is still loading lands while the visitor may already be refining the next one,
  // so the field is held while it has focus: the URL must not overwrite what they typed since.
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useSyncedFieldValue(incomingValue, cleared, editing);
  const [searching, startSearch] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function focusOnSlash(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented || isTypingTarget(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }

    document.addEventListener("keydown", focusOnSlash);
    return () => document.removeEventListener("keydown", focusOnSlash);
  }, []);

  function search(form: HTMLFormElement | null, options?: NavigateOptions) {
    if (!form) return;
    startSearch(() => navigate(form, options));
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.currentTarget.value);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    search(event.currentTarget.form);
  }

  function handleSubmitClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    search(event.currentTarget.form);
  }

  function clear() {
    const input = inputRef.current;
    setValue("");
    input?.focus();
    // An unsent draft only needs emptying; a search the results already reflect needs undoing. The
    // field is read from the form before this render lands, so `q` is dropped explicitly.
    if (incomingValue) search(input?.form ?? null, { clearFields: ["q"] });
  }

  const StatusIcon = searching ? LoaderCircle : Search;

  return (
    <div role="search" aria-label="Buscar servidores" className="flex flex-col gap-3 sm:flex-row">
      <div className="relative min-w-0 flex-1">
        <StatusIcon aria-hidden="true" className={`pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground ${searching ? "animate-spin" : ""}`} />
        <label htmlFor="server-search" className="sr-only">Buscar servidores</label>
        <Input
          ref={inputRef}
          id="server-search"
          type="search"
          name="q"
          value={value}
          onChange={handleChange}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onKeyDown={handleKeyDown}
          placeholder="Busca por nombre, modalidad o dirección"
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          aria-keyshortcuts="/"
          // The clear button below replaces the browser's own, which not every browser draws.
          className="h-10 min-w-0 flex-1 bg-card pl-8 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
        />
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clear}
            aria-label="Borrar la búsqueda"
            className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </Button>
        ) : null}
      </div>
      <Button type="submit" size="lg" onClick={handleSubmitClick} className="h-10 shrink-0 px-5">
        Buscar
      </Button>
    </div>
  );
}
