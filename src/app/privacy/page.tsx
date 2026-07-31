import Link from "next/link";

export const metadata = {
  title: "Privacidad · OpinaCraft",
  description: "Política de privacidad de OpinaCraft.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm underline">OpinaCraft</Link>
      <h1 className="mt-8 text-3xl font-semibold">Política de privacidad</h1>
      <p className="mt-4 text-sm text-zinc-600">Última actualización: 31 de julio de 2026.</p>
      <div className="mt-6 space-y-5 text-sm leading-6">
        <section><h2 className="font-semibold">Responsable</h2><p>Carlos Ferreras, operador de OpinaCraft. Contacto para privacidad y derechos: <a href="mailto:carlos@carlosferreras.com" className="underline">carlos@carlosferreras.com</a>.</p></section>
        <section><h2 className="font-semibold">Datos y finalidades</h2><p>Tratamos datos de cuenta e identificación (por ejemplo, email y nombre), datos de sesión, contenido de servidores y endpoints, imágenes multimedia, reportes, comunicaciones y eventos de moderación. Se usan para prestar el servicio, autenticar cuentas, verificar endpoints, prevenir abusos, moderar contenido, mantener la seguridad y cumplir obligaciones legales.</p></section>
        <section><h2 className="font-semibold">Base jurídica y destinatarios</h2><p>La base jurídica es la ejecución del servicio solicitado, el consentimiento cuando sea necesario, el interés legítimo en seguridad y moderación, y el cumplimiento de obligaciones legales. Los datos pueden tratarse por proveedores de autenticación, alojamiento, base de datos, correo y almacenamiento Blob que actúen según la configuración del servicio, y por autoridades cuando exista obligación legal.</p></section>
        <section><h2 className="font-semibold">Transferencias y conservación</h2><p>Si un proveedor procesa datos fuera del Espacio Económico Europeo, se aplicarán las garantías exigibles para esa transferencia. Conservamos los datos mientras la cuenta o el servidor estén activos y después solo durante el tiempo necesario para seguridad, moderación, resolución de reclamaciones y obligaciones legales; los datos de sesión y los archivos temporales se conservan durante su ciclo operativo.</p></section>
        <section><h2 className="font-semibold">Derechos</h2><p>Puedes solicitar acceso, rectificación, supresión, portabilidad, limitación u oposición escribiendo al contacto anterior. También puedes exportar o borrar tu cuenta desde el perfil y reclamar ante la Agencia Española de Protección de Datos.</p></section>
        <section><h2 className="font-semibold">Cookies y eliminación</h2><p>Usamos únicamente cookies técnicas necesarias para mantener la sesión; no usamos cookies publicitarias. La eliminación de la cuenta inicia la eliminación de los datos asociados, salvo lo que deba conservarse por seguridad u obligación legal.</p></section>
      </div>
      <p className="mt-8 text-sm"><Link href="/terms" className="underline">Términos de uso</Link> · <Link href="/contact" className="underline">Contacto</Link></p>
    </main>
  );
}
