import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ServerNotFound() {
  return <main className="grid min-h-[70vh] place-items-center px-4 py-12"><Card className="w-full max-w-md text-center"><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">OpinaCraft</p><CardTitle className="mt-2 text-3xl">Servidor no encontrado</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">Esta página no existe o todavía no es pública.</p><Button asChild className="mt-6"><Link href="/">Volver al inicio</Link></Button></CardContent></Card></main>;
}
