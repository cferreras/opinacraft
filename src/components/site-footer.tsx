import Link from "next/link";
import { ArrowRight, Heart } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { ThemeSwitch } from "@/components/theme-toggle";
import { aboutPath } from "@/lib/site/about";
import { cn } from "@/lib/utils";

const footerColumns = [
  {
    title: "Explorar",
    links: [
      { label: "Directorio de servidores", href: "/" },
      { label: "Servidores Java", href: "/?edition=java" },
      { label: "Servidores Bedrock", href: "/?edition=bedrock" },
      { label: "En línea ahora", href: "/?status=online", live: true },
    ],
  },
  {
    title: "Comunidad",
    // `/dashboard/servers` and `/profile` used to sit here. Both are disallowed in robots.txt, so
    // every crawl of every page followed links it was then told to ignore -- and neither is any use
    // to a signed-out visitor. The header offers them to whoever is actually signed in.
    links: [
      { label: "Publicar servidor", href: "/servers/new" },
      { label: "Crear cuenta", href: "/sign-up" },
      { label: "Iniciar sesión", href: "/sign-in" },
    ],
  },
  {
    title: "Recursos",
    links: [
      { label: "Blog", href: "/blog" },
      { label: "Quiénes somos", href: aboutPath },
      { label: "Contacto", href: "/contact" },
    ],
  },
] as const;

const legalLinks = [
  { label: "Términos", href: "/terms" },
  { label: "Privacidad", href: "/privacy" },
] as const;

function BrandLink({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <Link href="/" aria-label="OpinaCraft, inicio" className={cn("inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-bold tracking-tight text-foreground transition-opacity hover:opacity-80", className)}>
      <BrandMark size={size} className="text-primary" />
      <span>OpinaCraft</span>
    </Link>
  );
}

function MadeByPlayers() {
  return (
    <span className="inline-flex items-center gap-1.5">
      Hecho con <Heart aria-hidden="true" className="size-3 fill-current text-primary" /> por jugadores
    </span>
  );
}

function CompactFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto grid min-h-14 w-full max-w-6xl gap-2 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-[auto_auto_1fr] sm:items-center sm:gap-x-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-x-5">
          <BrandLink size={22} />
          <span>© OpinaCraft</span>
        </div>
        <nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href={aboutPath} className="transition-colors hover:text-foreground">Quiénes somos</Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">Contacto</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">Términos</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacidad</Link>
        </nav>
        <MadeByPlayers />
      </div>
    </footer>
  );
}

// The footer's own ground and greys: a touch of the brand hue on the background, and greys dark
// enough to keep 4.5:1 on it, which the sitewide muted grey does not quite manage.
const footerTokens =
  "[--footer-bg:oklch(0.978_0.005_160)] [--footer-muted:oklch(0.47_0.01_160)] [--footer-subtle:oklch(0.53_0.01_160)] [--footer-pressed:oklch(0.93_0.012_160)] dark:[--footer-bg:oklch(0.165_0.004_160)] dark:[--footer-muted:oklch(0.74_0_0)] dark:[--footer-subtle:oklch(0.62_0_0)] dark:[--footer-pressed:oklch(0.3_0.004_160)]";

const linkClass =
  "rounded-sm text-(--footer-muted) outline-none transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-(--footer-bg)";

const headingClass = "text-[0.6875rem] font-bold uppercase leading-4 tracking-[0.09em] text-foreground";

const chipClass =
  "inline-flex h-7 items-center gap-1.5 rounded-full border bg-card px-[0.6875rem] text-xs font-semibold text-(--footer-muted) transition-colors hover:border-(--footer-muted) hover:text-foreground";

/** On phones Legal is a column of its own; on wider screens it sits in the bottom bar next to the ©. */
function LegalNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className}>
      <p className={cn(headingClass, "sm:sr-only")}>Legal</p>
      <ul className="mt-2 grid text-sm sm:mt-0 sm:flex sm:items-center sm:gap-[0.8125rem] sm:text-[0.8125rem]">
        {legalLinks.map((link) => (
          <li key={link.href} className="flex">
            <Link href={link.href} className={cn(linkClass, "flex min-h-[2.125rem] items-center sm:min-h-0")}>
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/*
 * Every measure follows the golden ratio: spacing steps through 8 · 13 · 21 · 34 · 55 px, type
 * through 11 · 14 · 18 px (×√φ), and the brand column is φ times as wide as each link column.
 */
export function SiteFooter({ variant = "full" }: { variant?: "full" | "compact" } = {}) {
  if (variant === "compact") return <CompactFooter />;

  return (
    <footer className={cn(footerTokens, "border-t bg-(--footer-bg) text-foreground")}>
      <div className="mx-auto w-full max-w-6xl px-[1.3125rem] sm:px-6 lg:px-8">
        <div className="flex flex-col gap-[1.3125rem] border-b py-[2.125rem] sm:flex-row sm:items-center sm:justify-between sm:gap-[2.125rem]">
          <div className="grid gap-1">
            <p className="text-lg font-bold leading-[1.4375rem] tracking-[-0.01em]">¿Tienes un servidor de Minecraft?</p>
            <p className="text-sm leading-[1.375rem] text-(--footer-muted)">Publícalo gratis y deja que quienes juegan cuenten cómo es.</p>
          </div>
          <div className="flex shrink-0 items-center gap-[0.8125rem]">
            <Link
              href="/"
              className="hidden h-11 items-center rounded-[0.625rem] border bg-card px-[1.3125rem] text-sm font-semibold outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
            >
              Explorar directorio
            </Link>
            <Link
              href="/servers/new"
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-[0.625rem] bg-primary-ink px-[1.3125rem] text-[0.9375rem] font-bold text-primary-foreground outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-(--footer-bg) sm:h-11 sm:flex-none sm:text-sm dark:bg-primary"
            >
              Publicar servidor
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.25} />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-[1.3125rem] gap-y-[2.125rem] py-[2.125rem] sm:grid-cols-3 sm:gap-x-[3.4375rem] sm:py-[3.4375rem] lg:grid-cols-[1.618fr_1fr_1fr_1fr]">
          <div className="col-span-2 min-w-0 sm:col-span-3 lg:col-span-1">
            <BrandLink size={28} className="text-lg font-extrabold tracking-[-0.02em]" />
            <p className="mt-[0.8125rem] max-w-[21.25rem] text-sm leading-[1.618] text-pretty text-(--footer-muted)">
              El directorio donde las comunidades de Minecraft se muestran tal y como son: con su estado, sus modalidades y las opiniones de quienes ya juegan en ellas.
            </p>
            <div className="mt-[1.3125rem] hidden gap-2 sm:flex">
              <Link href="/?edition=java" className={chipClass}>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Java
              </Link>
              <Link href="/?edition=bedrock" className={chipClass}>
                <span aria-hidden="true" className="size-1.5 rounded-full bg-info" />Bedrock
              </Link>
            </div>
          </div>

          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="min-w-0">
              <p className={headingClass}>{column.title}</p>
              <ul className="mt-2 grid text-sm sm:mt-[1.3125rem] sm:gap-[0.8125rem]">
                {column.links.map((link) => (
                  <li key={link.href} className="flex">
                    <Link href={link.href} className={cn(linkClass, "inline-flex min-h-[2.125rem] items-center gap-2 sm:min-h-5 sm:leading-5")}>
                      {link.label}
                      {"live" in link ? (
                        <span aria-hidden="true" className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_oklch,var(--success)_20%,transparent)]" />
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <LegalNav className="sm:hidden" />
        </div>

        <div className="grid gap-[0.8125rem] pb-[2.125rem] sm:hidden">
          <p className={headingClass}>Tema</p>
          <ThemeSwitch />
        </div>

        <div className="flex flex-col gap-2 border-t py-[1.3125rem] sm:flex-row sm:items-center sm:justify-between sm:gap-[2.125rem]">
          <div className="grid gap-0.75">
            <div className="flex items-center justify-between gap-[0.8125rem] text-[0.8125rem] leading-5 text-(--footer-muted) sm:justify-start">
              <span>© OpinaCraft</span>
              <span aria-hidden="true" className="hidden size-0.75 rounded-full bg-(--footer-subtle) opacity-50 sm:block" />
              <LegalNav className="hidden sm:block" />
              <span className="sm:hidden">
                <MadeByPlayers />
              </span>
            </div>
            <p className="text-xs leading-[1.125rem] text-(--footer-subtle)">
              Proyecto independiente. No es un producto oficial de Minecraft ni está afiliado a Mojang ni Microsoft.
            </p>
          </div>
          <div className="hidden shrink-0 items-center gap-[1.3125rem] text-[0.8125rem] text-(--footer-muted) sm:flex">
            <MadeByPlayers />
            <span aria-hidden="true" className="h-[1.3125rem] w-px bg-border" />
            <ThemeSwitch />
          </div>
        </div>
      </div>
    </footer>
  );
}
