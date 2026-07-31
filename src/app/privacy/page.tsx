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
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p>Tratamos los datos necesarios para crear tu cuenta, gestionar servidores, verificar endpoints y moderar reportes.</p>
        <p>Puedes exportar o borrar tu cuenta desde el perfil. Conservamos los eventos de moderación necesarios para proteger la integridad del servicio y cumplir obligaciones legales.</p>
        <p>Solo usamos cookies técnicas necesarias para la sesión. No usamos cookies publicitarias.</p>
        <p>Para ejercer tus derechos o preguntar por el tratamiento de datos, escribe a <a href="mailto:carlos@carlosferreras.com" className="underline">carlos@carlosferreras.com</a> o visita la página de <Link href="/contact" className="underline">contacto</Link>.</p>
      </div>
    </main>
  );
}
