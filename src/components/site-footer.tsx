import Link from "next/link";
import { Heart } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="border-t bg-background">
      <div className="mx-auto flex min-h-14 w-full max-w-6xl flex-col justify-center gap-2 px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>© {new Date().getFullYear()} OpinaCraft</span>
          <Link href="/contact" className="transition-colors hover:text-foreground">Contacto</Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">Términos</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacidad</Link>
        </div>
        <span className="inline-flex items-center gap-1.5">Hecho con <Heart aria-hidden="true" className="size-3 fill-current text-primary" /> por jugadores</span>
      </div>
    </footer>
  );
}
