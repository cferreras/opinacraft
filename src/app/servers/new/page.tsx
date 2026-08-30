import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ServerForm } from "@/components/server-form";
import { SiteHeader } from "@/components/site-header";
import { requireServerSession } from "@/lib/session";

export const metadata: Metadata = { title: "Añadir servidor | OpinaCraft", description: "Publica tu comunidad Minecraft en OpinaCraft.", alternates: { canonical: "/servers/new" } };

export default async function NewServerPage() {
  await connection();
  await requireServerSession("/servers/new");
  return <div className="flex-1 bg-background"><SiteHeader /><main className="mx-auto w-full max-w-6xl px-4 pb-12 pt-6 sm:px-6 lg:px-8"><Button variant="ghost" asChild className="-ml-3"><Link href="/dashboard/servers"><ArrowLeft className="size-4" /> Tus servidores</Link></Button><div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8"><div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Publica tu comunidad</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">Añade tu servidor de Minecraft</h1><p className="mt-2 text-base leading-7 text-muted-foreground">Crea una ficha clara para que otros jugadores descubran tu comunidad, consulten sus modalidades y sepan cómo conectarse.</p></div><Badge variant="outline" className="h-6.5 shrink-0 gap-1.5 px-3 text-[0.6875rem] font-semibold text-muted-foreground sm:mt-9"><span aria-hidden="true" className="size-1.5 rounded-full bg-warning" />Borrador · sin publicar</Badge></div><Separator className="mt-7" /><div className="mt-7"><ServerForm /></div></main></div>;
}
