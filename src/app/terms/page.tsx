import Link from "next/link";

export const metadata = {
  title: "Términos · OpinaCraft",
  description: "Términos de uso de OpinaCraft.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm underline">OpinaCraft</Link>
      <h1 className="mt-8 text-3xl font-semibold">Términos de uso</h1>
      <p className="mt-4 text-sm text-zinc-600">Última actualización: 31 de julio de 2026.</p>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <section><h2 className="font-semibold">Cuenta</h2><p>Debes proporcionar información veraz, proteger tus credenciales y mantener actualizado el email de la cuenta. Puedes exportar o eliminar tu cuenta desde el perfil. No compartas códigos de verificación ni uses la cuenta de otra persona.</p></section>
        <section><h2 className="font-semibold">Contenido</h2><p>Solo puedes publicar servidores, marcas, textos e imágenes sobre los que tengas autorización. Eres responsable de que el contenido y los endpoints sean lícitos, exactos y no infrinjan derechos de terceros.</p></section>
        <section><h2 className="font-semibold">Uso prohibido</h2><p>No uses OpinaCraft para malware, fraude, spam, phishing, contenido ilegal, acoso, suplantación, evasión de controles, ataques a endpoints o cualquier actividad que perjudique a otros usuarios o al servicio.</p></section>
        <section><h2 className="font-semibold">Moderación y apelaciones</h2><p>Podemos ocultar servidores, retirar contenido, limitar funciones o suspender cuentas cuando exista una infracción, un riesgo de seguridad o una obligación legal. Puedes solicitar una revisión de una decisión escribiendo a <a href="mailto:carlos@carlosferreras.com" className="underline">carlos@carlosferreras.com</a>.</p></section>
        <section><h2 className="font-semibold">Disponibilidad y responsabilidad</h2><p>El servicio se ofrece como está disponible. No garantizamos disponibilidad continua ni que los datos de un servidor sean siempre correctos. En la medida permitida por la ley, no respondemos por daños indirectos derivados del uso de listados, endpoints o contenido de terceros.</p></section>
        <section><h2 className="font-semibold">Cambios y terminación</h2><p>Podemos actualizar estos términos publicando una nueva versión con su fecha. Si un cambio es relevante, lo comunicaremos cuando sea razonablemente posible. Puedes dejar de usar el servicio y eliminar tu cuenta en cualquier momento.</p></section>
      </div>
      <p className="mt-8 text-sm"><Link href="/privacy" className="underline">Privacidad</Link> · <Link href="/contact" className="underline">Contacto</Link></p>
    </main>
  );
}
