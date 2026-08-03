import type { Metadata } from "next";
import Link from "next/link";
import {
  IconArrowLeft,
  IconCircleCheck,
  IconInfoCircle,
  IconShieldCheck,
} from "@tabler/icons-react";

import { ServerForm } from "@/components/server-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireServerSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Añadir servidor | OpinaCraft",
  description: "Publica tu comunidad Minecraft en OpinaCraft.",
  alternates: { canonical: "/servers/new" },
};

const publishingSteps = [
  "Completa la información, el logo y las direcciones de conexión.",
  "Revisa que el servidor responda desde sus endpoints públicos.",
  "Publica la ficha desde tu panel cuando esté lista.",
];

export default async function NewServerPage() {
  await requireServerSession("/servers/new");

  return (
    <div className="app-shell">
      <SiteHeader />

      <main className="app-main page-shell px-4 pb-12 sm:px-6 sm:pt-1 lg:px-7 2xl:px-8">
        <div className="pt-6 sm:pt-7">
          <Link
            href="/dashboard/servers"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-md text-[0.6875rem] font-medium text-[#68758a] transition hover:text-[#2d34cf] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4655e8]/25"
          >
            <IconArrowLeft aria-hidden="true" size="0.9375rem" stroke={1.8} />
            Tus servidores
          </Link>

          <div className="mt-6 max-w-[47.5rem]">
            <p className="ui-eyebrow">Publica tu comunidad</p>
            <h1 className="ui-page-title mt-2.5">
              Añade tu servidor de Minecraft
            </h1>
            <p className="mt-2 max-w-[40rem] text-[0.8125rem] leading-[1.6] text-[#55627b]">
              Crea una ficha clara para que otros jugadores descubran tu comunidad, consulten sus modalidades y sepan cómo conectarse.
            </p>
          </div>

          <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.25rem] lg:items-start lg:gap-6">
            <section className="ui-card min-w-0 p-5 sm:p-6" aria-labelledby="server-form-heading">
              <div className="flex items-start gap-3 border-b border-[#e7ebef] pb-5">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#eef0ff] text-[#2d34cf]">
                  <IconShieldCheck aria-hidden="true" size="1.25rem" stroke={1.7} />
                </span>
                <div>
                  <h2 id="server-form-heading" className="text-[1.125rem] font-semibold tracking-[-0.025em] text-[#101722]">Información del servidor</h2>
                  <p className="mt-1 text-[0.75rem] leading-5 text-[#667287]">Los datos esenciales para que tu comunidad aparezca en el directorio.</p>
                </div>
              </div>
              <div className="pt-6">
                <ServerForm />
              </div>
            </section>

            <aside className="grid gap-4 lg:sticky lg:top-6" aria-label="Información sobre la publicación">
              <section className="ui-card p-5" aria-labelledby="publishing-heading">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#eef0ff] text-[#2d34cf]">
                    <IconCircleCheck aria-hidden="true" size="1.125rem" stroke={1.8} />
                  </span>
                  <h2 id="publishing-heading" className="text-[0.9375rem] font-semibold text-[#17202a]">Qué ocurre después</h2>
                </div>
                <ol className="mt-5 grid gap-4">
                  {publishingSteps.map((step, index) => (
                    <li key={step} className="flex items-start gap-3">
                      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#f0f1ff] text-[0.625rem] font-semibold text-[#2d34cf]">{index + 1}</span>
                      <p className="text-[0.6875rem] leading-5 text-[#5d6a7e]">{step}</p>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="rounded-2xl border border-[#dfe3ff] bg-[#f8f8ff] p-5" aria-labelledby="tips-heading">
                <div className="flex items-start gap-2.5">
                  <IconInfoCircle aria-hidden="true" className="mt-0.5 shrink-0 text-[#4655e8]" size="1.125rem" stroke={1.7} />
                  <div>
                    <h2 id="tips-heading" className="text-[0.875rem] font-semibold text-[#202b59]">Una ficha que funciona</h2>
                    <p className="mt-2 text-[0.6875rem] leading-5 text-[#667096]">Usa el nombre reconocible de tu comunidad, una descripción concreta, un logo reconocible y al menos una dirección pública. El banner no forma parte de esta publicación.</p>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
