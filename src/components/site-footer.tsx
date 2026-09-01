import Link from "next/link";
import { Heart } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";

const footerColumns = [
  {
    title: "Explorar",
    links: [
      { label: "Directorio de servidores", href: "/" },
      { label: "Servidores Java", href: "/?edition=java" },
      { label: "Servidores Bedrock", href: "/?edition=bedrock" },
      { label: "En línea ahora", href: "/?status=online" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "Comunidad",
    links: [
      { label: "Publicar servidor", href: "/servers/new" },
      { label: "Mis servidores", href: "/dashboard/servers" },
      { label: "Mi perfil", href: "/profile" },
      { label: "Crear cuenta", href: "/sign-up" },
    ],
  },
  {
    title: "Ayuda",
    links: [
      { label: "Contacto", href: "/contact" },
      { label: "Términos", href: "/terms" },
      { label: "Privacidad", href: "/privacy" },
    ],
  },
] as const;

function BrandLink({ size = 24 }: { size?: number }) {
  return (
    <Link href="/" aria-label="OpinaCraft, inicio" className="inline-flex shrink-0 items-center gap-2 text-[0.9375rem] font-bold tracking-tight text-foreground transition-opacity hover:opacity-80">
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
          <Link href="/contact" className="transition-colors hover:text-foreground">Contacto</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">Términos</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacidad</Link>
        </nav>
        <MadeByPlayers />
      </div>
    </footer>
  );
}

export function SiteFooter({ variant = "full" }: { variant?: "full" | "compact" } = {}) {
  if (variant === "compact") return <CompactFooter />;

  return (
    <footer className="border-t bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1fr] lg:gap-12">
          <div className="min-w-0">
            <BrandLink size={26} />
            <p className="mt-3.5 max-w-[18.75rem] text-sm leading-6 text-muted-foreground">
              El directorio donde las comunidades de Minecraft se muestran tal y como son: con su estado, sus modalidades y las opiniones de quienes ya juegan en ellas.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />Java
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-info" />Bedrock
              </span>
            </div>
          </div>

          {footerColumns.map((column) => (
            <nav key={column.title} aria-label={column.title} className="min-w-0">
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.09em]">{column.title}</p>
              <div className="mt-4 grid gap-2.5">
                {column.links.map((link) => (
                  <Link key={link.href} href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                    {link.label}
                  </Link>
                ))}
              </div>
            </nav>
          ))}
        </div>

        <div className="flex flex-col gap-2 border-t py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <span>© OpinaCraft. Proyecto independiente, sin relación con Mojang ni Microsoft.</span>
          <MadeByPlayers />
        </div>
      </div>
    </footer>
  );
}
