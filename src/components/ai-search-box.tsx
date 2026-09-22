"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Check, Search, Sparkles, X } from "lucide-react";
import type { ChangeEvent, KeyboardEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FilterFormSubmitButton } from "@/components/filter-form-submit-button";
import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { useSyncedFieldValue } from "@/hooks/use-synced-field-value";
import { buildCatalogHref, catalogInputFrom } from "@/lib/servers/catalog-route";
import { gameModeLabel } from "@/lib/servers/game-modes";
import { serverCountryLabel, findServerRegion } from "@/lib/servers/countries";
import { accessIntentLabel } from "@/lib/servers/catalog-filters";

/** Long enough that a pause in typing is a pause, short enough not to feel like waiting. */
const DEBOUNCE_MS = 300;
/** Below this there is nothing to understand, and every keystroke would be a request. */
const MIN_INTERPRETED_LENGTH = 3;
const SESSION_MARKER = "opinacraft:ai-search-session-until";

type Suggestion = { kind: "mode" | "country" | "region" | "access" | "edition"; value: string; confidence: number };

type TurnstileWidget = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

/** What the visitor is told, and nothing more: the reasons live in the server logs. */
type AiState = "off" | "idle" | "verifying" | "ready" | "unavailable";

function suggestionLabel(suggestion: Suggestion) {
  switch (suggestion.kind) {
    case "mode": return `Modo: ${gameModeLabel(suggestion.value)}`;
    case "country": return `País: ${serverCountryLabel(suggestion.value)}`;
    // A region is offered as itself: eighteen dismissable country chips would be a worse offer.
    case "region": return `Región: ${findServerRegion(suggestion.value)?.label ?? suggestion.value}`;
    case "access": return `Acceso: ${accessIntentLabel(suggestion.value)}`;
    case "edition": return `Edición: ${suggestion.value === "java" ? "Java" : "Bedrock"}`;
  }
}

function storedSessionIsCurrent() {
  try {
    const until = window.sessionStorage.getItem(SESSION_MARKER);
    return until !== null && Number(until) > Date.now();
  } catch {
    // Private windows and blocked storage are not an error; the widget simply runs again.
    return false;
  }
}

/**
 * The search box and everything the AI layer adds around it.
 *
 * The plain input keeps its `name="q"` and the form keeps its `action`, so with no JavaScript, no
 * Turnstile or no key this is exactly the keyword search the catalog has always had. Everything
 * else — the invisible challenge, the debounced interpretation, the suggestion chips — is added on
 * top of that and can fail without taking the search with it.
 */
export function AiSearchBox({ value: incomingValue, cleared, turnstileSiteKey }: { value: string; cleared: boolean; turnstileSiteKey?: string }) {
  const router = useRouter();
  const navigate = useFilterFormNavigation();
  // The box navigates on its own while the visitor types, so the URL that comes back is this
  // field's own output. `editing` is what stops that output from being written back over the text
  // typed since the search left.
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useSyncedFieldValue(incomingValue, cleared, editing);
  const [aiState, setAiState] = useState<AiState>(turnstileSiteKey ? "idle" : "off");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  /**
   * Whether the navigation now in flight is the expensive kind. Paired with the transition below
   * rather than cleared by hand: a flag set before a navigation and unset after one is a flag that
   * stays on when the navigation is the last thing that happens, which is most of the time.
   */
  const [judgingNavigation, setJudgingNavigation] = useState(false);
  const [isNavigating, startNavigation] = useTransition();
  const judging = judgingNavigation && isNavigating;
  const [interpreting, setInterpreting] = useState(false);
  const [showInteractive, setShowInteractive] = useState(false);

  const invisibleRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    requestRef.current?.abort();
  }, []);

  const startSession = useCallback(async (token: string) => {
    try {
      const response = await fetch("/api/search/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; expiresAt?: string } | null;
      if (!response.ok || !result?.ok) {
        setAiState("unavailable");
        return;
      }
      try {
        window.sessionStorage.setItem(SESSION_MARKER, String(result.expiresAt ? Date.parse(result.expiresAt) : Date.now() + 30 * 60 * 1000));
      } catch {
        // Nothing to remember is fine; the next focus verifies again.
      }
      setAiState("ready");
      setShowInteractive(false);
    } catch {
      setAiState("unavailable");
    }
  }, []);

  /** The invisible widget: created once, executed on demand, never shown unprompted. */
  const renderInvisibleWidget = useCallback(() => {
    if (!turnstileSiteKey || !window.turnstile || !invisibleRef.current || widgetRef.current) return;
    widgetRef.current = window.turnstile.render(invisibleRef.current, {
      sitekey: turnstileSiteKey,
      execution: "execute",
      appearance: "interaction-only",
      callback: (token: string) => { void startSession(token); },
      "error-callback": () => { setAiState("unavailable"); return true; },
      "expired-callback": () => {
        setAiState("idle");
        try {
          window.sessionStorage.removeItem(SESSION_MARKER);
        } catch {
          // Ignored for the same reason as above.
        }
      },
    });
  }, [startSession, turnstileSiteKey]);

  /**
   * The challenge runs on focus, not on load: a visitor who never searches is never challenged.
   * The session cookie is HttpOnly, so a live session is remembered beside it and read here rather
   * than on mount — checking it during an effect would both cascade renders and disagree with what
   * the server rendered.
   */
  const handleFocus = useCallback(() => {
    setEditing(true);
    if (aiState !== "idle") return;
    if (storedSessionIsCurrent()) {
      setAiState("ready");
      return;
    }
    if (!widgetRef.current || !window.turnstile) return;
    setAiState("verifying");
    window.turnstile.execute(widgetRef.current);
  }, [aiState]);

  /** The way back when the invisible challenge failed: a widget the visitor can actually answer. */
  const verifyInteractively = useCallback(() => {
    setShowInteractive(true);
    // The container mounts in this same render, so the widget is created on the next frame.
    requestAnimationFrame(() => {
      if (!turnstileSiteKey || !window.turnstile || !interactiveRef.current) return;
      interactiveRef.current.replaceChildren();
      window.turnstile.render(interactiveRef.current, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => { void startSession(token); },
        "error-callback": () => { setAiState("unavailable"); return true; },
      });
    });
  }, [startSession, turnstileSiteKey]);

  const interpret = useCallback(async (text: string) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setInterpreting(true);

    try {
      const response = await fetch("/api/search/interpret", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ q: text, search: window.location.search }),
        signal: controller.signal,
      });
      if (!response.ok) return;
      const result = await response.json() as { href?: string; suggested?: Suggestion[]; aiAvailable?: boolean; semantic?: boolean };
      if (result.aiAvailable === false) setAiState("off");
      setSuggestions(result.suggested ?? []);
      // Set before the navigation, not after: the page it lands on is the slow one, and the whole
      // point is to say so while the wait is happening rather than once it is over.
      setJudgingNavigation(result.semantic === true);
      if (result.href) startNavigation(() => router.push(result.href!));
    } catch {
      // An aborted or failed interpretation leaves the visitor where they were; the form still
      // submits the query as a keyword search.
    } finally {
      if (requestRef.current === controller) setInterpreting(false);
    }
  }, [router]);

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length < MIN_INTERPRETED_LENGTH) return;
    debounceRef.current = setTimeout(() => { void interpret(next); }, DEBOUNCE_MS);
  }, [interpret, setValue]);

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const form = event.currentTarget.form;
    if (!form) return;
    event.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Enter means now: interpret immediately when we can, and otherwise do what the form does.
    if (value.trim().length >= MIN_INTERPRETED_LENGTH) void interpret(value);
    else navigate(form);
  }

  function acceptSuggestion(suggestion: Suggestion) {
    const params = new URLSearchParams(window.location.search);
    // The repeatable facets are read as "any of these", so accepting widens the results rather than
    // replacing what is already there. A region code rides in `?country=` and an intent code in
    // `?access=`; both are expanded where the query string is parsed, not here.
    const param = suggestion.kind === "region" ? "country" : suggestion.kind;

    if (suggestion.kind === "edition") {
      params.set("edition", suggestion.value);
    } else if (!params.getAll(param).includes(suggestion.value)) {
      params.append(param, suggestion.value);
    }

    params.delete("page");
    dismissSuggestion(suggestion);
    router.push(buildCatalogHref(catalogInputFrom(params)));
  }

  function dismissSuggestion(suggestion: Suggestion) {
    setSuggestions((current) => current.filter((item) => !(item.kind === suggestion.kind && item.value === suggestion.value)));
  }

  return (
    <>
      {turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="lazyOnload" onLoad={renderInvisibleWidget} onError={() => setAiState("unavailable")} />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="server-search" className="sr-only">Buscar</label>
          <Input
            id="server-search"
            name="q"
            value={value}
            onChange={handleChange}
            onFocus={handleFocus}
            onBlur={() => setEditing(false)}
            onKeyDown={submitOnEnter}
            placeholder="Busca como hablas: «survival tranquilo en España»"
            aria-describedby="server-search-hint"
            className="h-10 min-w-0 flex-1 bg-card pl-8 text-sm"
          />
        </div>
        <FilterFormSubmitButton>Buscar</FilterFormSubmitButton>
      </div>

      {/* The invisible widget needs a node to live in even though it draws nothing. */}
      <div ref={invisibleRef} className="sr-only" aria-hidden="true" />

      <p id="server-search-hint" aria-live="polite" className="flex min-h-5 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {/* Judging runs one request per server, so it is seconds rather than milliseconds. Saying so
            before the navigation is the difference between "slow" and "working". */}
        {judging ? <><Sparkles aria-hidden="true" className="size-3.5 animate-pulse text-primary" /> Valorando cada servidor con lo que has escrito…</> : null}
        {interpreting && !judging ? <><Sparkles aria-hidden="true" className="size-3.5 animate-pulse" /> Interpretando tu búsqueda…</> : null}
        {/* States the capability rather than confirming an activation: nobody asked for it to be
            switched on, and "activada" reads like a system log. */}
        {!interpreting && !judging && aiState === "ready" ? <><Check aria-hidden="true" className="size-3.5" /> Entiende frases enteras, no solo palabras.</> : null}
        {!interpreting && aiState === "unavailable" ? (
          <>
            Búsqueda con IA no disponible ahora mismo. La búsqueda normal sigue funcionando.
            <button type="button" onClick={verifyInteractively} className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
              ¿Eres humano? Verifícate
            </button>
          </>
        ) : null}
      </p>

      {showInteractive ? <div ref={interactiveRef} className="min-h-[65px]" /> : null}

      {suggestions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">¿Querías decir?</span>
          {suggestions.map((suggestion) => (
            <span key={`${suggestion.kind}:${suggestion.value}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-dashed pl-3 pr-1 text-[0.8125rem] font-medium">
              <button type="button" onClick={() => acceptSuggestion(suggestion)} className="hover:text-primary">
                {suggestionLabel(suggestion)}
              </button>
              <Button type="button" variant="ghost" size="icon" aria-label={`Descartar ${suggestionLabel(suggestion)}`} onClick={() => dismissSuggestion(suggestion)} className="size-6 rounded-full text-muted-foreground hover:text-foreground">
                <X aria-hidden="true" className="size-3.5" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
