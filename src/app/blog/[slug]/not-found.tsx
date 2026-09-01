import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { blogPath } from "@/lib/blog/posts";

export default function BlogPostNotFound() {
  return <main className="grid min-h-[70vh] place-items-center px-4 py-12"><Card className="w-full max-w-md text-center"><CardHeader><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Del blog</p><CardTitle className="mt-2 text-3xl">Artículo no encontrado</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-muted-foreground">Este artículo no existe o ya no está publicado.</p><Button asChild className="mt-6"><Link href={blogPath}>Ver todos los artículos</Link></Button></CardContent></Card></main>;
}
