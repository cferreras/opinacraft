import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Términos · OpinaCraft",
  description: "Términos de uso de OpinaCraft.",
};

const sections = [
  ["Cuenta", "Debes proporcionar información veraz, proteger tus credenciales y mantener actualizado el email de la cuenta. Puedes exportar o eliminar tu cuenta desde el perfil. No compartas códigos de verificación ni uses la cuenta de otra persona."],
  ["Contenido", "Solo puedes publicar servidores, marcas, textos e imágenes sobre los que tengas autorización. Eres responsable de que el contenido y los endpoints sean lícitos, exactos y no infrinjan derechos de terceros."],
  ["Uso prohibido", "No uses OpinaCraft para malware, fraude, spam, phishing, contenido ilegal, acoso, suplantación, evasión de controles, ataques a endpoints o cualquier actividad que perjudique a otros usuarios o al servicio."],
  ["Moderación y apelaciones", <>Podemos ocultar servidores, retirar contenido, limitar funciones o suspender cuentas cuando exista una infracción, un riesgo de seguridad o una obligación legal. Puedes solicitar una revisión de una decisión escribiendo a <a href="mailto:carlos@carlosferreras.com" className="font-semibold text-zinc-950 underline underline-offset-4">carlos@carlosferreras.com</a>.</>],
  ["Disponibilidad y responsabilidad", "El servicio se ofrece como está disponible. No garantizamos disponibilidad continua ni que los datos de un servidor sean siempre correctos. En la medida permitida por la ley, no respondemos por daños indirectos derivados del uso de listados, endpoints o contenido de terceros."],
  ["Cambios y terminación", "Podemos actualizar estos términos publicando una nueva versión con su fecha. Si un cambio es relevante, lo comunicaremos cuando sea razonablemente posible. Puedes dejar de usar el servicio y eliminar tu cuenta en cualquier momento."],
] as const;

export default function TermsPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="legal-shell">
        <article className="legal-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-sm font-bold tracking-[-0.04em] text-zinc-950">OpinaCraft</Link>
            <span className="ui-badge">Documento legal</span>
          </div>
          <p className="ui-eyebrow mt-12">La letra pequeña, clara</p>
          <h1 className="mt-3 text-[clamp(2.35rem,6vw,4rem)] font-bold leading-[0.98] tracking-[-0.07em] text-zinc-950">Términos de uso</h1>
          <p className="mt-4 text-sm text-zinc-500">Última actualización: 31 de julio de 2026.</p>

          <div className="mt-10 space-y-6 text-sm leading-7 text-zinc-600">
            {sections.map(([title, content]) => (
              <section key={title}>
                <h2 className="text-base font-bold tracking-[-0.02em] text-zinc-950">{title}</h2>
                <p className="mt-2">{content}</p>
              </section>
            ))}
          </div>

          <p className="mt-10 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-zinc-600">
            <Link href="/privacy" className="hover:text-zinc-950">Privacidad</Link>
            <Link href="/contact" className="hover:text-zinc-950">Contacto</Link>
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
