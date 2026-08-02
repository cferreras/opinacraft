import Link from "next/link";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata = {
  title: "Privacidad · OpinaCraft",
  description: "Política de privacidad de OpinaCraft.",
};

const sections = [
  ["Responsable", <>Carlos Ferreras, operador de OpinaCraft. Contacto para privacidad y derechos: <a href="mailto:carlos@carlosferreras.com" className="font-semibold text-zinc-950 underline underline-offset-4">carlos@carlosferreras.com</a>.</>],
  ["Datos y finalidades", "Tratamos datos de cuenta e identificación (por ejemplo, email y nombre), datos de sesión, contenido de servidores y endpoints, imágenes multimedia, reportes, comunicaciones y eventos de moderación. Se usan para prestar el servicio, autenticar cuentas, verificar endpoints, prevenir abusos, moderar contenido, mantener la seguridad y cumplir obligaciones legales."],
  ["Base jurídica y destinatarios", "La base jurídica es la ejecución del servicio solicitado, el consentimiento cuando sea necesario, el interés legítimo en seguridad y moderación, y el cumplimiento de obligaciones legales. Los datos pueden tratarse por proveedores de autenticación, alojamiento, base de datos, correo y almacenamiento Blob que actúen según la configuración del servicio, y por autoridades cuando exista obligación legal."],
  ["Transferencias y conservación", "Si un proveedor procesa datos fuera del Espacio Económico Europeo, se aplicarán las garantías exigibles para esa transferencia. Conservamos los datos mientras la cuenta o el servidor estén activos y después solo durante el tiempo necesario para seguridad, moderación, resolución de reclamaciones y obligaciones legales; los datos de sesión y los archivos temporales se conservan durante su ciclo operativo."],
  ["Derechos", "Puedes solicitar acceso, rectificación, supresión, portabilidad, limitación u oposición escribiendo al contacto anterior. También puedes exportar o borrar tu cuenta desde el perfil y reclamar ante la Agencia Española de Protección de Datos."],
  ["Cookies y eliminación", "Usamos únicamente cookies técnicas necesarias para mantener la sesión; no usamos cookies publicitarias. La eliminación de la cuenta inicia la eliminación de los datos asociados, salvo lo que deba conservarse por seguridad u obligación legal."],
] as const;

export default function PrivacyPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="legal-shell">
        <article className="legal-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/" className="text-sm font-bold tracking-[-0.04em] text-zinc-950">OpinaCraft</Link>
            <span className="ui-badge">Documento legal</span>
          </div>
          <p className="ui-eyebrow mt-12">Tus datos, bajo control</p>
          <h1 className="mt-3 text-[clamp(2.35rem,6vw,4rem)] font-bold leading-[0.98] tracking-[-0.07em] text-zinc-950">Política de privacidad</h1>
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
            <Link href="/terms" className="hover:text-zinc-950">Términos de uso</Link>
            <Link href="/contact" className="hover:text-zinc-950">Contacto</Link>
          </p>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}
