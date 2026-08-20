import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Info, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServerForm } from "@/components/server-form";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { requireServerSession } from "@/lib/session";

export const metadata: Metadata = { title: "Añadir servidor | OpinaCraft", description: "Publica tu comunidad Minecraft en OpinaCraft.", alternates: { canonical: "/servers/new" } };
const publishingSteps = ["Completa la identidad, el acceso, el logo y las direcciones de conexión.", "Revisa que el servidor responda desde sus endpoints públicos.", "Publica la ficha desde tu panel cuando esté lista."];

export default async function NewServerPage() {
  await requireServerSession("/servers/new");
  return <div className="min-h-screen bg-background"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8"><Button variant="ghost" asChild className="-ml-3"><Link href="/dashboard/servers"><ArrowLeft className="size-4" /> Tus servidores</Link></Button><div className="mt-6 max-w-3xl"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Publica tu comunidad</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Añade tu servidor de Minecraft</h1><p className="mt-2 text-base leading-7 text-muted-foreground">Crea una ficha clara para que otros jugadores descubran tu comunidad, consulten sus modalidades y sepan cómo conectarse.</p></div><div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18.25rem] lg:items-start lg:gap-6"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="size-5 text-primary" /> Información del servidor</CardTitle><p className="text-sm text-muted-foreground">Los datos esenciales para que tu comunidad aparezca en el directorio.</p></CardHeader><CardContent><ServerForm /></CardContent></Card><aside className="grid gap-4 lg:sticky lg:top-20" aria-label="Información sobre la publicación"><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><CheckCircle2 className="size-4 text-primary" /> Qué ocurre después</CardTitle></CardHeader><CardContent><ol className="grid gap-4">{publishingSteps.map((step, index) => <li key={step} className="flex items-start gap-3"><span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span><p className="text-sm leading-5 text-muted-foreground">{step}</p></li>)}</ol></CardContent></Card><Alert><Info className="size-4" /><AlertTitle>Una ficha que funciona</AlertTitle><AlertDescription>Usa el nombre reconocible de tu comunidad, una descripción concreta, un logo, sus condiciones de acceso y al menos una dirección pública.</AlertDescription></Alert></aside></div></main><SiteFooter variant="compact" /></div>;
}
