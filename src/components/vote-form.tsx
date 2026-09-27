"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import Script from "next/script";
import { ArrowBigUp, BadgeCheck, CalendarDays, Check, CircleAlert, Clock, Hourglass, MessageSquareText, Send, TriangleAlert } from "lucide-react";

import { castVoteAction, type VoteActionState } from "@/app/servers/[slug]/votar/actions";
import { VoteCountdown } from "@/components/vote-countdown";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { VOTE_COOLDOWN_HOURS } from "@/lib/votes/month";
import { deliveryLine, elapsedLabel, nextVoteLabel, successSentence } from "@/lib/votes/vote-copy";

const NICKNAME_STORAGE_KEY = "opinacraft:vote-nickname";
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

function turnstileApi() {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile;
}

type Cooldown = { nickname: string; votedAt: string; nextVoteAt: string; now: string };

export type VoteFormProps = {
  slug: string;
  serverName: string;
  monthName: string;
  resetLabel: string;
  daysLeft: string;
  signedIn: boolean;
  turnstileSiteKey?: string;
  initialCooldown: Omit<Cooldown, "now"> | null;
  /** The server's clock at render, so the countdown's first frame matches the HTML. */
  initialNow: string;
  /** The identity block, rendered on the server and shown above the form only. */
  header: ReactNode;
};

const linkClass = "inline-flex min-h-11 items-center font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export function VoteForm(props: VoteFormProps) {
  const [state, dispatch, pending] = useActionState<VoteActionState | null, FormData>(castVoteAction, null);
  // The countdown that already ran out, so the form comes back without waiting for a reload.
  const [elapsedAt, setElapsedAt] = useState<string | null>(null);
  const fromAction = state !== null;

  const cooldown: Cooldown | null = state?.status === "cooldown"
    ? state
    : state === null && props.initialCooldown
      ? { ...props.initialCooldown, now: props.initialNow }
      : null;

  const reviewHref = `/servers/${props.slug}#review-composer`;
  const writeReviewHref = props.signedIn ? reviewHref : `/sign-in?callbackURL=${encodeURIComponent(reviewHref)}`;

  if (state?.status === "ok") {
    const delivery = deliveryLine(state.delivery);
    return (
      <ResultPanel role="status">
        <IconCircle className="bg-success-soft text-success"><Check aria-hidden="true" className="size-8" strokeWidth={3} /></IconCircle>
        <ResultHeading autoFocus>¡Voto registrado!</ResultHeading>
        <p className="text-pretty text-[0.9375rem] text-muted-foreground">
          {successSentence({ nickname: state.nickname, serverName: props.serverName, votes: state.votes, position: state.position, monthName: props.monthName })}
        </p>
        <ul className="grid w-full gap-2.5 rounded-xl bg-card p-4 text-left text-sm ring-1 ring-foreground/10">
          {delivery ? (
            <li className="flex items-start gap-2.5">
              {state.delivery === "delivered"
                ? <Send aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                : <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />}
              <span>{delivery}</span>
            </li>
          ) : null}
          <li className="flex items-start gap-2.5">
            <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>Próximo voto: <strong className="font-bold tabular-nums">{nextVoteLabel(new Date(state.nextVoteAt), new Date(state.now))}</strong></span>
          </li>
        </ul>
        <ReviewPrompt
          title="¿Juegas aquí? Cuéntalo"
          body={state.linkedToAccount
            ? "Ya has votado, así que tu opinión aparecerá con la insignia Jugador verificado."
            : "Inicia sesión y vota con tu cuenta para que tu opinión salga verificada."}
          href={writeReviewHref}
        />
        <Link href={`/servers/${props.slug}`} className={linkClass}>Volver a la ficha de {props.serverName}</Link>
      </ResultPanel>
    );
  }

  if (cooldown && elapsedAt !== cooldown.nextVoteAt) {
    return (
      <ResultPanel>
        <IconCircle className="bg-warning-soft text-warning"><Hourglass aria-hidden="true" className="size-8" /></IconCircle>
        <ResultHeading autoFocus={fromAction}>Ya has votado hoy</ResultHeading>
        <p className="text-pretty text-[0.9375rem] text-muted-foreground">
          <span className="font-mono font-semibold text-foreground">{cooldown.nickname}</span> votó por {props.serverName} {elapsedLabel(new Date(cooldown.votedAt), new Date(cooldown.now))}. Podrás volver a votar en:
        </p>
        <div className="w-full">
          <VoteCountdown
            votedAt={cooldown.votedAt}
            nextVoteAt={cooldown.nextVoteAt}
            initialNow={cooldown.now}
            onElapsed={() => setElapsedAt(cooldown.nextVoteAt)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Próximo voto: <strong className="font-bold text-foreground tabular-nums">{nextVoteLabel(new Date(cooldown.nextVoteAt), new Date(cooldown.now))}</strong>
        </p>
        <ReviewPrompt
          title="Mientras tanto, cuenta tu experiencia"
          body={props.signedIn
            ? "Si votaste con la sesión iniciada, tu opinión aparecerá con la insignia Jugador verificado."
            : "Inicia sesión y vota con tu cuenta para que tu opinión salga verificada."}
          href={writeReviewHref}
        />
        <Link href={`/servers/${props.slug}`} className={linkClass}>Volver a la ficha de {props.serverName}</Link>
      </ResultPanel>
    );
  }

  return <VoteFormView {...props} state={state} dispatch={dispatch} pending={pending} />;
}

function VoteFormView({
  slug,
  resetLabel,
  daysLeft,
  signedIn,
  turnstileSiteKey,
  header,
  state,
  dispatch,
  pending,
}: VoteFormProps & { state: VoteActionState | null; dispatch: (formData: FormData) => void; pending: boolean }) {
  const nicknameRef = useRef<HTMLInputElement>(null);
  const captchaRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const [captchaMissing, setCaptchaMissing] = useState(false);

  const error = state?.status === "error" ? state : null;
  const fieldError = error?.fieldError ?? null;
  const formError = state?.status === "not-eligible"
    ? "Este servidor no puede recibir votos ahora mismo."
    : error && !fieldError
      ? error.message
      : captchaMissing
        ? "Completa la comprobación anti-bots antes de votar."
        : null;

  // The last nick used on this device. Written straight to the uncontrolled input: reading storage
  // during render would disagree with the server's HTML.
  useEffect(() => {
    const input = nicknameRef.current;
    if (!input || input.value) return;
    try {
      const stored = window.localStorage.getItem(NICKNAME_STORAGE_KEY);
      if (stored) input.value = stored;
    } catch {
      // Private windows and blocked storage just mean typing the nick again.
    }
  }, []);

  const renderWidget = useCallback(() => {
    const api = turnstileApi();
    if (!turnstileSiteKey || !api || !captchaRef.current || widgetRef.current) return;
    widgetRef.current = api.render(captchaRef.current, {
      sitekey: turnstileSiteKey,
      language: "es",
      size: "flexible",
      theme: "auto",
      callback: () => setCaptchaMissing(false),
    });
  }, [turnstileSiteKey]);

  // The script may already be on the page (the form coming back after a countdown, or a strict-mode
  // remount), in which case `onReady` has nothing left to wait for and the widget is drawn here.
  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetRef.current) turnstileApi()?.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [renderWidget]);

  // A token is single use: once the server has spent it, a retry needs a fresh one. A nickname
  // rejected before the check left the token untouched, so that case keeps it.
  useEffect(() => {
    if (state?.status === "error" && !state.fieldError && widgetRef.current) turnstileApi()?.reset(widgetRef.current);
  }, [state]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Dispatched by hand so React does not reset the form: the nick must survive an error.
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (turnstileSiteKey && !formData.get("cf-turnstile-response")) {
      setCaptchaMissing(true);
      return;
    }
    setCaptchaMissing(false);
    try {
      window.localStorage.setItem(NICKNAME_STORAGE_KEY, String(formData.get("nickname") ?? "").trim());
    } catch {
      // Remembering the nick is a convenience, never a requirement.
    }
    startTransition(() => dispatch(formData));
  }

  const signInHref = `/sign-in?callbackURL=${encodeURIComponent(`/servers/${slug}/votar`)}`;
  const retrying = Boolean(error) || state?.status === "not-eligible";

  return (
    <div className="grid gap-6">
      {turnstileSiteKey ? <Script src={TURNSTILE_SRC} strategy="afterInteractive" onReady={renderWidget} /> : null}
      {header}

      <form onSubmit={handleSubmit} noValidate className="grid gap-5 rounded-xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
        <input type="hidden" name="slug" value={slug} />

        {formError ? (
          <Alert variant="destructive" className="border-danger/30 bg-danger-soft">
            <CircleAlert aria-hidden="true" />
            <AlertTitle className="font-bold">No se pudo registrar el voto</AlertTitle>
            <AlertDescription className="text-foreground/80">{formError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-2">
          <label htmlFor="vote-nickname" className="text-sm font-bold">Tu nick de Minecraft</label>
          <Input
            ref={nicknameRef}
            id="vote-nickname"
            name="nickname"
            required
            minLength={3}
            maxLength={16}
            pattern="[A-Za-z0-9_]{3,16}"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            enterKeyHint="go"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "vote-nickname-error vote-nickname-help" : "vote-nickname-help"}
            className="h-12 font-mono text-base md:text-base"
          />
          {fieldError ? <p id="vote-nickname-error" className="text-sm font-medium text-destructive">{fieldError}</p> : null}
          <p id="vote-nickname-help" className="text-[0.8125rem] text-muted-foreground">Escríbelo tal cual aparece en el juego: es el nick que recibe la recompensa.</p>
        </div>

        {turnstileSiteKey ? (
          <div className="grid gap-2">
            <p className="text-sm font-bold">Comprobación anti-bots</p>
            {/* Turnstile injects its hidden `cf-turnstile-response` input here, inside the form. */}
            <div ref={captchaRef} className="min-h-[65px]" />
          </div>
        ) : null}

        <div className="grid gap-2.5">
          <Button type="submit" disabled={pending} className="h-13 w-full gap-2 rounded-xl text-base font-bold">
            {pending ? (
              <>
                <Spinner aria-hidden="true" className="size-5 motion-reduce:animate-none" />
                Votando…
              </>
            ) : (
              <>
                <ArrowBigUp aria-hidden="true" className="size-5" />
                {retrying ? "Reintentar" : "Votar"}
              </>
            )}
          </Button>
          <p className="text-center text-[0.8125rem] text-muted-foreground">Gratis y sin cuenta · un voto cada {VOTE_COOLDOWN_HOURS} horas</p>
        </div>
      </form>

      <div className="grid gap-3 text-[0.8125rem] text-muted-foreground">
        <p className="flex items-start gap-2.5">
          <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>El ranking se reinicia el {resetLabel} · {daysLeft}</span>
        </p>
        <p className="flex items-start gap-2.5">
          <BadgeCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary-ink" />
          {signedIn ? (
            <span>Tu voto quedará ligado a tu cuenta: tus opiniones saldrán como verificadas</span>
          ) : (
            <Link href={signInHref} className="font-medium text-foreground underline underline-offset-3 hover:text-primary-ink">
              Inicia sesión antes de votar y tus opiniones saldrán como verificadas
            </Link>
          )}
        </p>
      </div>
    </div>
  );
}

function ResultPanel({ children, role }: { children: ReactNode; role?: "status" }) {
  return (
    <section role={role} className="mx-auto flex w-full max-w-md flex-col items-center gap-5 text-center">
      {children}
    </section>
  );
}

function IconCircle({ children, className }: { children: ReactNode; className: string }) {
  return <div className={`flex size-16 items-center justify-center rounded-full ${className}`}>{children}</div>;
}

/** Takes focus when it replaces the form, so keyboard and screen reader users land on the outcome. */
function ResultHeading({ children, autoFocus }: { children: ReactNode; autoFocus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return <h1 ref={ref} tabIndex={-1} className="text-2xl font-extrabold tracking-tight outline-none sm:text-[1.75rem]">{children}</h1>;
}

function ReviewPrompt({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <div className="grid w-full gap-3 rounded-xl bg-card p-4 text-left ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-primary-ink">
          <MessageSquareText aria-hidden="true" className="size-4.5" />
        </span>
        <div className="grid gap-1">
          <h2 className="text-[0.9375rem] font-extrabold tracking-tight">{title}</h2>
          <p className="text-[0.8125rem] text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button asChild variant="outline" className="h-11 w-full font-bold">
        <Link href={href}>Escribir una opinión</Link>
      </Button>
    </div>
  );
}
