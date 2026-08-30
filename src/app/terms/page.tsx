import Link from "next/link";
import { type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Términos · OpinaCraft",
  description: "Términos de uso de OpinaCraft.",
};

const sections: readonly [string, ReactNode][] = [
  ["Cuenta", "Debes proporcionar información veraz, proteger tus credenciales y mantener actualizado el email de la cuenta. Puedes exportar o eliminar tu cuenta desde el perfil. No compartas códigos de verificación ni uses la cuenta de otra persona."],
  ["Contenido", "Solo puedes publicar servidores, marcas, textos e imágenes sobre los que tengas autorización. Eres responsable de que el contenido y los endpoints sean lícitos, exactos y no infrinjan derechos de terceros."],
  ["Uso prohibido", "No uses OpinaCraft para malware, fraude, spam, phishing, contenido ilegal, acoso, suplantación, evasión de controles, ataques a endpoints o cualquier actividad que perjudique a otros usuarios o al servicio."],
  ["Moderación y apelaciones", <>Podemos ocultar servidores, retirar contenido, limitar funciones o suspender cuentas cuando exista una infracción, un riesgo de seguridad o una obligación legal. Puedes solicitar una revisión de una decisión escribiendo a <a href="mailto:carlos@carlosferreras.com" className="font-semibold text-foreground underline underline-offset-4">carlos@carlosferreras.com</a>.</>],
  ["Disponibilidad y responsabilidad", "El servicio se ofrece como está disponible. No garantizamos disponibilidad continua ni que los datos de un servidor sean siempre correctos. En la medida permitida por la ley, no respondemos por daños indirectos derivados del uso de listados, endpoints o contenido de terceros."],
  ["Cambios y terminación", "Podemos actualizar estos términos publicando una nueva versión con su fecha. Si un cambio es relevante, lo comunicaremos cuando sea razonablemente posible. Puedes dejar de usar el servicio y eliminar tu cuenta en cualquier momento."],
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
        <Card>
          <CardHeader className="gap-4 sm:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><Button asChild variant="link" className="h-auto p-0 text-base font-bold"><Link href="/">OpinaCraft</Link></Button><Badge variant="outline">Documento legal</Badge></div><div className="pt-8"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">La letra pequeña, clara</p><CardTitle className="mt-3 text-4xl tracking-tight sm:text-5xl">Términos de uso</CardTitle><CardDescription className="mt-4 text-sm">Última actualización: 31 de julio de 2026.</CardDescription></div></CardHeader>
          <CardContent className="sm:p-8 sm:pt-0"><Separator /><div className="mt-8 grid gap-7 text-sm leading-7 text-muted-foreground">{sections.map(([title, content]) => <section key={title}><h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2><p className="mt-2">{content}</p></section>)}</div><Separator className="my-8" /><nav className="flex flex-wrap gap-2" aria-label="Enlaces legales"><Button asChild variant="link" className="h-auto p-0"><Link href="/privacy">Privacidad</Link></Button><Button asChild variant="link" className="h-auto p-0"><Link href="/contact">Contacto</Link></Button></nav></CardContent>
        </Card>
      </main>
    </div>
  );
}
