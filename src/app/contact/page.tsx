import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Contacto · OpinaCraft",
  description: "Canales de contacto de OpinaCraft.",
};

export default function ContactPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="legal-shell">
        <article className="legal-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-sm font-bold tracking-[-0.04em] text-zinc-950">OpinaCraft</Link>
            <span className="ui-badge ui-badge-accent">Soporte</span>
          </div>
          <p className="ui-eyebrow mt-12">Estamos al otro lado</p>
          <h1 className="mt-3 text-[clamp(2.4rem,6vw,4.25rem)] font-bold leading-[0.98] tracking-[-0.07em] text-zinc-950">Contacto</h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600">
            Para incidencias, privacidad, derechos sobre contenidos o moderación, escribe a nuestro canal de soporte.
          </p>

          <div className="ui-signal mt-10 rounded-xl border border-zinc-200 bg-zinc-50 p-5 pl-7">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Canal principal</p>
            <a href="mailto:carlos@carlosferreras.com" className="mt-2 block text-lg font-bold tracking-[-0.035em] text-zinc-950 hover:text-indigo-600">
              carlos@carlosferreras.com
            </a>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Incluye el enlace del servidor, una descripción breve del problema y cualquier evidencia necesaria. No envíes contraseñas ni códigos de verificación.
            </p>
          </div>

          <nav className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-zinc-600" aria-label="Enlaces legales">
            <Link href="/privacy" className="hover:text-zinc-950">Privacidad</Link>
            <Link href="/terms" className="hover:text-zinc-950">Términos de uso</Link>
          </nav>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
