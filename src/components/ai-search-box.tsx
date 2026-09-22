"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Script from "next/script";
import { Check, Search, Sparkles, X } from "lucide-react";
import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";

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
  /**
   * Whether Cloudflare has decided this visitor must answer something.
   *
   * The invisible widget lives in an `sr-only` box, which is 1x1px and `clip`ped. That is right up
   * until the challenge turns interactive: Cloudflare then draws the checkbox *in that box*, where
   * nobody can see or reach it, and waits for an answer that can never come. No error fires, because
   * from Turnstile's side nothing is wrong — it is waiting. The box hung on "verificando" forever.
   *
   * So `before-interactive-callback` lifts the widget into the page, and
   * `after-interactive-callback` puts it back.
   */
  const [challengeVisible, setChallengeVisible] = useState(false);

  const invisibleRef = useRef<HTMLDivElement>(null);
  const interactiveRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  /**
   * A focus that happened before the widget existed.
   *
   * The script is loaded with `lazyOnload`, so focusing the box early found no `window.turnstile` and
   * gave up silently — the visitor typed, nothing verified, and the AI layer never woke up until they
   * clicked away and back. The intent is remembered here and acted on the moment the widget is ready.
   */
  const challengeWantedRef = useRef(false);
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
    const widgetId = window.turnstile.render(invisibleRef.current, {
      sitekey: turnstileSiteKey,
      execution: "execute",
      appearance: "interaction-only",
      callback: (token: string) => {
        setChallengeVisible(false);
        void startSession(token);
      },
      "error-callback": () => { setChallengeVisible(false); setAiState("unavailable"); return true; },
      // The challenge needs the visitor. It cannot be answered inside a clipped 1x1 box, so the box
      // stops being one.
      "before-interactive-callback": () => setChallengeVisible(true),
      "after-interactive-callback": () => setChallengeVisible(false),
      // An interactive challenge nobody solved in time. Without this the widget simply stops and the
      // box waits on a token that is never coming; with it the visitor is told and offered the way back.
      "timeout-callback": () => { setChallengeVisible(false); setAiState("unavailable"); },
      // Turnstile cannot run here at all. Saying so beats spinning.
      "unsupported-callback": () => { setChallengeVisible(false); setAiState("unavailable"); return true; },
      "expired-callback": () => {
        setChallengeVisible(false);
        setAiState("idle");
        try {
          window.sessionStorage.removeItem(SESSION_MARKER);
        } catch {
          // Ignored for the same reason as above.
        }
      },
    });
    widgetRef.current = widgetId;

    // Someone focused the box while the script was still loading. Honour it now.
    if (challengeWantedRef.current && widgetId) {
      challengeWantedRef.current = false;
      setAiState("verifying");
      window.turnstile.execute(widgetId);
    }
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
    if (!widgetRef.current || !window.turnstile) {
      // Not ready yet. Remembered rather than dropped, so the wait is the script's and not the
      // visitor's second click.
      challengeWantedRef.current = true;
      return;
    }
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

  /**
   * What the box has to say right now, or nothing. Derived in one place so the announced text and the
   * shown text are the same text by construction.
   */
  const hint: { text: string; icon?: ReactNode; action?: ReactNode } | null =
    judging
      // Judging is one request per server, so it is seconds rather than milliseconds. Saying so while
      // the wait happens is the difference between "slow" and "working".
      ? { text: "Valorando cada servidor con lo que has escrito…", icon: <Sparkles aria-hidden="true" className="size-3.5 animate-pulse text-primary" /> }
      : interpreting
      ? { text: "Interpretando tu búsqueda…", icon: <Sparkles aria-hidden="true" className="size-3.5 animate-pulse" /> }
      : aiState === "verifying" && challengeVisible
        ? { text: "Cloudflare necesita que confirmes que eres una persona." }
        : aiState === "unavailable"
          ? {
            text: "Búsqueda con IA no disponible ahora mismo. La búsqueda normal sigue funcionando.",
            action: (
              <button type="button" onClick={verifyInteractively} className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
                ¿Eres humano? Verifícate
              </button>
            ),
          }
          // States the capability rather than confirming an activation: nobody asked for it to be
          // switched on, and "activada" reads like a system log.
          : aiState === "ready"
            ? { text: "Entiende frases enteras, no solo palabras.", icon: <Check aria-hidden="true" className="size-3.5" /> }
            : null;

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

      {/* Hidden while the challenge is silent, and a real part of the page the moment it is not:
          a widget the visitor must answer has to be somewhere they can see and reach. */}
      <div
        ref={invisibleRef}
        aria-hidden={challengeVisible ? undefined : true}
        className={challengeVisible ? "flex min-h-[65px] items-center" : "sr-only"}
      />

      {/*
        Two elements rather than one, and the reason is the gap this used to leave.
        A single `<p>` with `min-h-5` reserved its line whether or not it had anything to say, and as
        a flex child it also cost the card's `gap-3` — so an idle box carried a visible hole. It cannot
        simply be dropped when empty either: an `aria-live` region has to be in the document *before*
        its content changes, or the change is never announced.
        So the live region is permanent and weightless, and the visible line exists only when there is
        a line. It is `aria-hidden` because the region above already says the same thing.
      */}
      <p id="server-search-hint" aria-live="polite" className="sr-only">{hint?.text ?? ""}</p>

      {hint ? (
        <p aria-hidden="true" className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {hint.icon}
          {hint.text}
          {hint.action}
        </p>
      ) : null}

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
