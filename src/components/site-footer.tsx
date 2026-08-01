import Link from "next/link";
import { IconHeartFilled } from "@tabler/icons-react";

export function SiteFooter() {
  return (
    <footer className="border-t border-[#e4e8eb] bg-white">
      <div className="mx-auto flex min-h-[47px] w-full max-w-[1180px] flex-col justify-center gap-2 px-4 py-3 text-[10px] text-[#687580] sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-7">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>© {new Date().getFullYear()} OpinaCraft</span>
          <Link href="/" className="hover:text-[#17202a]">Acerca de</Link>
          <Link href="/contact" className="hover:text-[#17202a]">Contacto</Link>
          <Link href="/terms" className="hover:text-[#17202a]">Términos</Link>
          <Link href="/privacy" className="hover:text-[#17202a]">Privacidad</Link>
        </div>
        <span className="inline-flex items-center gap-1.5">Hecho con <IconHeartFilled aria-hidden="true" className="text-[#e33b3f]" size={12} /> por jugadores</span>
      </div>
    </footer>
  );
}
