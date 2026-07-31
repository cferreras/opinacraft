import Link from "next/link";

export const metadata = { title: "Contacto · OpinaCraft", description: "Contacto de OpinaCraft.", robots: { index: false } };
export default function ContactPage() { return <main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12"><Link href="/" className="text-sm underline">OpinaCraft</Link><h1 className="mt-8 text-3xl font-semibold">Contacto</h1><p className="mt-4 text-sm text-amber-700">Página provisional pendiente de revisión legal.</p><p className="mt-6 text-sm leading-6">Para incidencias, privacidad o moderación, escribe a la dirección de soporte configurada por el operador del servicio.</p></main>; }
