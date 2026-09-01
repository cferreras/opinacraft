import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SiteHeader } from "@/components/site-header";
import { buildOpenGraph } from "@/lib/seo/open-graph";

const title = "Política de privacidad | OpinaCraft";
const description = "Qué datos trata OpinaCraft, con qué finalidad, durante cuánto tiempo y cómo ejercer tus derechos.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/privacy" },
  openGraph: buildOpenGraph({ title, description, path: "/privacy" }),
};

const sections: readonly [string, ReactNode][] = [
  ["Responsable", <>Carlos Ferreras, operador de OpinaCraft. Contacto para privacidad y derechos: <a href="mailto:carlos@carlosferreras.com" className="font-semibold text-foreground underline underline-offset-4">carlos@carlosferreras.com</a>.</>],
  ["Datos y finalidades", "Tratamos datos de cuenta e identificación (por ejemplo, email y nombre), datos de sesión, contenido de servidores y endpoints, imágenes multimedia, reportes, comunicaciones y eventos de moderación. Se usan para prestar el servicio, autenticar cuentas, verificar endpoints, prevenir abusos, moderar contenido, mantener la seguridad y cumplir obligaciones legales."],
  ["Base jurídica y destinatarios", "La base jurídica es la ejecución del servicio solicitado, el consentimiento cuando sea necesario, el interés legítimo en seguridad y moderación, y el cumplimiento de obligaciones legales. Los datos pueden tratarse por proveedores de autenticación, alojamiento, base de datos, correo y almacenamiento Blob que actúen según la configuración del servicio, y por autoridades cuando exista obligación legal."],
  ["Transferencias y conservación", "Si un proveedor procesa datos fuera del Espacio Económico Europeo, se aplicarán las garantías exigibles para esa transferencia. Conservamos los datos mientras la cuenta o el servidor estén activos y después solo durante el tiempo necesario para seguridad, moderación, resolución de reclamaciones y obligaciones legales; los datos de sesión y los archivos temporales se conservan durante su ciclo operativo."],
  ["Derechos", "Puedes solicitar acceso, rectificación, supresión, portabilidad, limitación u oposición escribiendo al contacto anterior. También puedes exportar o borrar tu cuenta desde el perfil y reclamar ante la Agencia Española de Protección de Datos."],
  ["Cookies y eliminación", "Usamos únicamente cookies técnicas necesarias para mantener la sesión; no usamos cookies publicitarias. La eliminación de la cuenta inicia la eliminación de los datos asociados, salvo lo que deba conservarse por seguridad u obligación legal."],
];

export default function PrivacyPage() {
  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-9 sm:px-6 lg:px-8 lg:pb-12">
        <Card>
          <CardHeader className="gap-4 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><Button asChild variant="link" className="h-auto p-0 text-base font-bold"><Link href="/">OpinaCraft</Link></Button><Badge variant="outline">Documento legal</Badge></div><div className="pt-8"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Tus datos, bajo control</p><CardTitle as="h1" className="mt-3 text-4xl tracking-tight sm:text-5xl">Política de privacidad</CardTitle><CardDescription className="mt-4 text-sm">Última actualización: 31 de julio de 2026.</CardDescription></div></CardHeader>
          <CardContent className="sm:p-8 sm:pt-0"><Separator /><div className="mt-8 grid gap-7 text-sm leading-7 text-muted-foreground">{sections.map(([title, content]) => <section key={title}><h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2><p className="mt-2">{content}</p></section>)}</div><Separator className="my-8" /><nav className="flex flex-wrap gap-2" aria-label="Enlaces legales"><Button asChild variant="link" className="h-auto p-0"><Link href="/terms">Términos de uso</Link></Button><Button asChild variant="link" className="h-auto p-0"><Link href="/contact">Contacto</Link></Button></nav></CardContent>
        </Card>
      </main>
    </div>
  );
}
