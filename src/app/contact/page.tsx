import Link from "next/link";

export const metadata = {
  title: "Contacto · OpinaCraft",
  description: "Canales de contacto de OpinaCraft.",
};

export default function ContactPage() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm underline">OpinaCraft</Link>
      <h1 className="mt-8 text-3xl font-semibold">Contacto</h1>
      <p className="mt-4 text-sm leading-6">Para incidencias, privacidad, derechos sobre contenidos o moderación, escribe a <a href="mailto:carlos@carlosferreras.com" className="underline">carlos@carlosferreras.com</a>.</p>
      <p className="mt-4 text-sm leading-6">Incluye el enlace del servidor, una descripción breve del problema y cualquier evidencia necesaria. No envíes contraseñas ni códigos de verificación.</p>
      <nav className="mt-8 flex gap-4 text-sm underline"><Link href="/privacy">Privacidad</Link><Link href="/terms">Términos de uso</Link></nav>
    </main>
  );
}
