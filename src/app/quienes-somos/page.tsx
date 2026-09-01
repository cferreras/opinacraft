import type { Metadata } from "next";
import Link from "next/link";
import { type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { JsonLd } from "@/components/json-ld";
import { SiteHeader } from "@/components/site-header";
import { buildOpenGraph } from "@/lib/seo/open-graph";
import { breadcrumbListSchema } from "@/lib/seo/structured-data";
import { aboutPath, siteAuthor } from "@/lib/site/about";

const title = "Quiénes somos y cómo verificamos los servidores | OpinaCraft";
const description = "Quién está detrás de OpinaCraft, cómo se verifica cada servidor del directorio y qué normas siguen las opiniones publicadas.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: aboutPath },
  openGraph: buildOpenGraph({ title, description, path: aboutPath }),
};

const mailto = `mailto:${siteAuthor.email}`;

function MailLink({ children }: { children: ReactNode }) {
  return <a href={mailto} className="font-semibold text-foreground underline underline-offset-4">{children}</a>;
}

const sections: readonly [string, ReactNode][] = [
  [
    "Qué es OpinaCraft",
    <>Un directorio de servidores de Minecraft en español. Cada ficha reúne tres cosas: los datos que declara quien publica el servidor, los datos que medimos nosotros conectándonos a él, y las opiniones de quienes juegan allí. Las tres se muestran por separado a propósito, porque no tienen el mismo valor.</>,
  ],
  [
    "Quién está detrás",
    <>OpinaCraft es un proyecto independiente, sin relación con Mojang ni con Microsoft, mantenido por {siteAuthor.name}. No hay una redacción detrás: los artículos del blog y los criterios del directorio son suyos, y firma con su nombre lo que escribe. Para cualquier cosa relacionada con el directorio, la dirección es <MailLink>{siteAuthor.email}</MailLink>.</>,
  ],
  [
    "Cómo se verifica un servidor",
    <>La insignia de servidor verificado no se pide: se demuestra. Generamos un código temporal y quien administra el servidor lo coloca en el MOTD de una dirección pública; nosotros nos conectamos a esa dirección y comprobamos que el código está ahí. Si aparece, queda probado que quien publica la ficha controla realmente el servidor. Si no aparece, no hay insignia. Los códigos caducan, tienen un número limitado de intentos y dejan de valer si la dirección cambia.</>,
  ],
  [
    "Cómo medimos el estado y los jugadores",
    <>El estado, la versión, el ping y el número de jugadores no los escribe nadie a mano: salen de conexiones periódicas al servidor, con una cadencia que la propia ficha muestra junto a la hora de la última comprobación. Cuando una medición se retrasa, lo decimos en la ficha en lugar de enseñar un dato viejo como si fuera de ahora. Un servidor caído no se oculta: se marca como caído.</>,
  ],
  [
    "Cómo funcionan las opiniones",
    <>Para opinar hay que tener una cuenta con el email verificado, y cada persona puede publicar una sola opinión por servidor, editable y borrable en cualquier momento. Quien forma parte del equipo de un servidor no puede puntuarlo: la ficha se lo impide. A cambio, el equipo sí puede responder públicamente a cualquier opinión, y esa respuesta aparece firmada como oficial debajo de ella. No pagamos por reseñas, no las escribimos nosotros y no se puede comprar la posición en el directorio.</>,
  ],
  [
    "Qué hacemos cuando algo está mal",
    <>Cualquier opinión y cualquier ficha se pueden denunciar desde la propia página. Revisamos las denuncias a mano y podemos ocultar contenido, retirar una ficha o suspender una cuenta cuando hay una infracción, un riesgo de seguridad o una obligación legal. Si crees que una decisión es errónea, escríbenos a <MailLink>{siteAuthor.email}</MailLink> y la revisamos. El procedimiento completo está en los <Link href="/terms" className="font-semibold text-foreground underline underline-offset-4">términos de uso</Link>.</>,
  ],
  [
    "Cómo se financia el proyecto",
    <>Hoy, con nada: no hay publicidad, ni patrocinios, ni acuerdos con ningún servidor listado. La intención es vender en el futuro espacios de promoción claramente identificados como tales, separados del listado normal y sin efecto alguno sobre las valoraciones ni sobre el orden del catálogo. Cuando eso ocurra, se dirá aquí y se marcará en la página.</>,
  ],
];

export default function AboutPage() {
  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      <JsonLd data={breadcrumbListSchema([{ name: "Inicio", path: "/" }, { name: "Quiénes somos", path: aboutPath }])} />
      <main className="mx-auto w-full max-w-4xl px-4 pb-8 pt-9 sm:px-6 lg:px-8 lg:pb-12">
        <Breadcrumbs trail={[{ label: "Inicio", href: "/" }]} current="Quiénes somos" />
        <Card>
          <CardHeader className="gap-4 sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3"><Button asChild variant="link" className="h-auto p-0 text-base font-bold"><Link href="/">OpinaCraft</Link></Button><Badge variant="outline">Sobre el proyecto</Badge></div>
            <div className="pt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Sin humo</p>
              <CardTitle as="h1" className="mt-3 text-4xl tracking-tight sm:text-5xl">Quiénes somos</CardTitle>
              <CardDescription className="mt-4 max-w-xl text-base leading-7">Un directorio solo vale lo que valen sus criterios. Estos son los nuestros, escritos para que puedas comprobarlos.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="sm:p-8 sm:pt-0">
            <Separator />
            <div className="mt-8 grid gap-7 text-sm leading-7 text-muted-foreground">
              {sections.map(([heading, content]) => (
                <section key={heading}>
                  <h2 className="text-base font-semibold tracking-tight text-foreground">{heading}</h2>
                  <p className="mt-2">{content}</p>
                </section>
              ))}
            </div>
            <Separator className="my-8" />
            <nav className="flex flex-wrap gap-2" aria-label="Enlaces relacionados">
              <Button asChild variant="link" className="h-auto p-0"><Link href="/contact">Contacto</Link></Button>
              <Button asChild variant="link" className="h-auto p-0"><Link href="/terms">Términos</Link></Button>
              <Button asChild variant="link" className="h-auto p-0"><Link href="/privacy">Privacidad</Link></Button>
            </nav>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
