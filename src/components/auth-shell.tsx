import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <main className="grid min-h-[calc(100vh-4rem)] place-items-center px-4 py-8 sm:py-12">
      <section className="grid w-full max-w-4xl overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[0.9fr_1.1fr]">
        <aside className="hidden flex-col justify-between bg-primary p-8 text-primary-foreground md:flex lg:p-10">
          <Link href="/" className="relative z-10 inline-flex items-center gap-2.5 text-sm font-bold tracking-tight">
            <Image
              src="/brand/opinacraft-server-mark.webp"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              priority
              className="rounded-md bg-white/10 p-1"
            />
            OpinaCraft
          </Link>

          <div className="relative z-10 max-w-[18rem]">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-foreground/70">Señal de comunidad</p>
            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight">Encuentra el mundo al que querrás volver.</h2>
            <p className="mt-5 text-sm leading-6 text-primary-foreground/75">Salud del servidor, reseñas honestas y los datos que necesitas para elegir tu próxima comunidad.</p>
          </div>

          <div className="relative z-10 grid gap-2 text-xs text-primary-foreground/75">
            <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary-foreground" /> Señales en tiempo real</span>
            <span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary-foreground/60" /> Comunidades Java y Bedrock</span>
          </div>
        </aside>

        <Card className="rounded-none border-0 shadow-none">
          <CardHeader className="space-y-3 p-6 sm:p-8">
            <Link href="/" className="inline-flex items-center gap-2 text-xs font-bold tracking-tight md:hidden">
              <Image
                src="/brand/opinacraft-server-mark.webp"
                alt=""
                aria-hidden="true"
                width={22}
                height={22}
                className="rounded bg-muted p-0.5"
              />
              OpinaCraft
            </Link>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Acceso a la cuenta</p>
              <CardTitle className="mt-3 text-2xl tracking-tight">{title}</CardTitle>
              <CardDescription className="mt-2 max-w-sm leading-6">{description}</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6 p-6 pt-0 sm:p-8 sm:pt-0">
            {children}
            <Separator />
            <div className="text-center text-xs text-muted-foreground">{footer}</div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
