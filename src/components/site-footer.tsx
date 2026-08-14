import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto grid min-h-14 w-full max-w-6xl gap-2 px-4 py-3 text-xs text-muted-foreground sm:grid-cols-[auto_auto_1fr] sm:items-center sm:gap-x-6 sm:px-6">
        <div className="flex min-w-0 items-center gap-x-5">
          <Link href="/" aria-label="OpinaCraft, inicio" className="inline-flex shrink-0 items-center gap-2 font-semibold text-foreground transition-opacity hover:opacity-80">
            <Image
              src="/brand/opinacraft-server-mark.webp"
              alt=""
              aria-hidden="true"
              width={24}
              height={24}
              className="object-contain"
            />
            <span>OpinaCraft</span>
          </Link>
          <span>© {new Date().getFullYear()}</span>
        </div>
        <nav aria-label="Enlaces legales" className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/contact" className="transition-colors hover:text-foreground">Contacto</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">Términos</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacidad</Link>
        </nav>
        <span className="inline-flex items-center gap-1.5 sm:justify-self-end">Hecho con <Heart aria-hidden="true" className="size-3 fill-current text-primary" /> por jugadores</span>
      </div>
    </footer>
  );
}
