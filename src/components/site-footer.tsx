import Link from "next/link";
import { IconHeartFilled } from "@tabler/icons-react";

export function SiteFooter() {
  return (
    <footer className="app-footer">
      <div className="page-shell flex min-h-[52px] flex-col justify-center gap-2 px-4 py-3 text-[10px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-7 2xl:px-8">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>© {new Date().getFullYear()} OpinaCraft</span>
          <Link href="/contact" className="transition-colors hover:text-zinc-950">Contacto</Link>
          <Link href="/terms" className="hover:text-[#17202a]">Términos</Link>
          <Link href="/privacy" className="transition-colors hover:text-zinc-950">Privacidad</Link>
        </div>
        <span className="inline-flex items-center gap-1.5">Hecho con <IconHeartFilled aria-hidden="true" className="text-[#e33b3f]" size={12} /> por jugadores</span>
      </div>
    </footer>
  );
}
