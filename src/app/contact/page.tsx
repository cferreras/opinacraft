import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Contacto · OpinaCraft",
  description: "Canales de contacto de OpinaCraft.",
};

export default function ContactPage() {
  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-9 sm:px-6 lg:px-8 lg:pb-12">
        <Card>
          <CardHeader className="gap-4 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3"><Button asChild variant="link" className="h-auto p-0 text-base font-bold"><Link href="/">OpinaCraft</Link></Button><Badge>Soporte</Badge></div>
            <div className="pt-8"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Estamos al otro lado</p><CardTitle className="mt-3 text-4xl tracking-tight sm:text-5xl">Contacto</CardTitle><CardDescription className="mt-4 max-w-xl text-base leading-7">Para incidencias, privacidad, derechos sobre contenidos o moderación, escribe a nuestro canal de soporte.</CardDescription></div>
          </CardHeader>
          <CardContent className="grid gap-8 sm:p-8 sm:pt-0">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-5"><p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Canal principal</p><a href="mailto:carlos@carlosferreras.com" className="mt-2 block text-lg font-bold tracking-tight text-foreground hover:text-primary">carlos@carlosferreras.com</a><p className="mt-3 text-sm leading-6 text-muted-foreground">Incluye el enlace del servidor, una descripción breve del problema y cualquier evidencia necesaria. No envíes contraseñas ni códigos de verificación.</p></div>
            <Separator />
            <nav className="flex flex-wrap gap-2" aria-label="Enlaces legales"><Button asChild variant="link" className="h-auto p-0"><Link href="/privacy">Privacidad</Link></Button><Button asChild variant="link" className="h-auto p-0"><Link href="/terms">Términos de uso</Link></Button></nav>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
