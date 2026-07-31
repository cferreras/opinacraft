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
      <div className="mt-6 space-y-4 text-sm leading-6">
        <p>Publica únicamente servidores, marcas e imágenes sobre los que tengas autorización. Mantén los endpoints actualizados y no intentes eludir la moderación o los controles de seguridad.</p>
        <p>No utilices OpinaCraft para distribuir contenido ilegal, malware, spam, fraude o material que infrinja derechos de terceros.</p>
        <p>OpinaCraft puede ocultar contenido, limitar cuentas o retirar publicaciones que infrinjan estos términos o la legislación aplicable. Las decisiones de moderación pueden recurrirse mediante la página de <Link href="/contact" className="underline">contacto</Link>.</p>
      </div>
    </main>
  );
}
