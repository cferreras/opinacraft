import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BlogCategoryBadge } from "@/components/blog-category-badge";
import { Card } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { SiteHeader } from "@/components/site-header";
import {
  blogCategories,
  blogCategoryBySlug,
  blogCategoryHref,
  blogCategoryMeta,
  blogCoverHeight,
  blogCoverWidth,
  blogPath,
  blogPostPath,
  formatBlogDate,
  postsInCategory,
  type BlogPost,
} from "@/lib/blog/posts";
import { cn } from "@/lib/utils";

const title = "Blog | OpinaCraft";
const description = "Lo que aprendemos monitorizando servidores y leyendo reseñas, contado sin humo.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: blogPath },
  openGraph: { title, description, type: "website" },
};

function CategoryFilters({ active }: { active?: string }) {
  return (
    <nav aria-label="Categorías del blog" className="mt-5 flex flex-wrap items-center gap-2">
      <Link
        href={blogPath}
        aria-current={active ? undefined : "page"}
        className={cn(
          "inline-flex h-8 items-center rounded-full px-3.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          active ? "border bg-card text-muted-foreground hover:text-foreground" : "bg-accent font-semibold text-accent-foreground",
        )}
      >
        Todos
      </Link>
      {blogCategories.map((category) => {
        const meta = blogCategoryMeta[category];
        const isActive = active === meta.slug;
        return (
          <Link
            key={category}
            href={blogCategoryHref(category)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              isActive ? "bg-accent font-semibold text-accent-foreground" : "border bg-card font-medium text-muted-foreground hover:text-foreground",
            )}
          >
            <span aria-hidden="true" className={cn("size-1.5 rounded-full", meta.dot)} />
            {category}
          </Link>
        );
      })}
    </nav>
  );
}

// One card, two shapes: a square thumbnail beside the text on a phone, where four stacked covers
// would turn the page into a strip of images, and a cover-led card once there is a grid to sit in.
// The image is wrapped so the Card's own `img:first-child` rounding does not fight the thumbnail.
function PostCard({ post }: { post: BlogPost }) {
  return (
    <Card className="relative grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3.5 p-3.5 transition-colors hover:bg-muted/30 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50 sm:block sm:gap-0 sm:p-0">
      <div className="min-w-0">
        <Image src={post.cover} alt="" width={480} height={270} sizes="(min-width: 640px) 22rem, 5.5rem" className="aspect-square w-full rounded-[0.625rem] object-cover sm:aspect-video sm:rounded-none" />
      </div>
      <div className="min-w-0 sm:px-4 sm:pb-5 sm:pt-4">
        <BlogCategoryBadge category={post.category} />
        <h3 className="mt-2 text-[0.9375rem] font-bold leading-[1.3125rem] tracking-[-0.005em] sm:mt-3">
          <Link href={blogPostPath(post.slug)} className="transition-colors after:absolute after:inset-0 hover:text-primary focus-visible:text-primary focus-visible:outline-none">
            {post.title}
          </Link>
        </h3>
        <p className="mt-2 hidden text-[0.8125rem] leading-5 text-muted-foreground sm:block">{post.excerpt}</p>
        <p className="mt-2 text-[0.71875rem] text-muted-foreground sm:mt-3.5">{formatBlogDate(post.publishedAt)} · {post.readingMinutes} min de lectura</p>
      </div>
    </Card>
  );
}

export default async function BlogIndexPage({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  const category = blogCategoryBySlug(categoria);
  const activeSlug = category ? blogCategoryMeta[category].slug : undefined;
  const posts = postsInCategory(category);
  // The lead card is the editorial front of the whole blog; inside a filtered view every post is
  // equally relevant, so the list stays a plain grid.
  const featured = category ? undefined : posts[0];
  const rest = featured ? posts.slice(1) : posts;

  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
        <header>
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">Del blog</p>
          <h1 className="mt-2.5 max-w-[40rem] text-3xl font-bold tracking-tight sm:text-[2rem]">Guías para elegir servidor y para llevar el tuyo</h1>
          <p className="mt-2.5 max-w-[35rem] text-sm leading-6 text-muted-foreground">{description}</p>
        </header>

        <CategoryFilters active={activeSlug} />

        {featured ? (
          <Card className="relative mt-6 gap-0 py-0 transition-colors hover:bg-muted/30 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50 lg:grid lg:grid-cols-[minmax(0,33rem)_minmax(0,1fr)]">
            <Image src={featured.cover} alt="" width={blogCoverWidth} height={blogCoverHeight} priority sizes="(min-width: 1024px) 33rem, 100vw" className="aspect-video w-full object-cover lg:h-full lg:rounded-l-xl lg:rounded-tr-none" />
            <div className="flex flex-col justify-center px-5 py-6 sm:px-8">
              <div className="flex flex-wrap items-center gap-2.5">
                <BlogCategoryBadge category={featured.category} />
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">Destacado</span>
              </div>
              <h2 className="mt-3.5 text-2xl font-bold leading-[1.9375rem] tracking-[-0.015em]">
                <Link href={blogPostPath(featured.slug)} className="transition-colors after:absolute after:inset-0 hover:text-primary focus-visible:text-primary focus-visible:outline-none">
                  {featured.title}
                </Link>
              </h2>
              <p className="mt-2.5 max-w-[32rem] text-sm leading-[1.4375rem] text-muted-foreground">{featured.excerpt}</p>
              <p className="mt-4.5 text-xs text-muted-foreground">{formatBlogDate(featured.publishedAt)} · {featured.readingMinutes} min de lectura</p>
              <span className="mt-4.5 inline-flex items-center gap-1.5 text-[0.8125rem] font-semibold text-primary">
                Leer el artículo<ArrowRight aria-hidden="true" className="size-3.5" />
              </span>
            </div>
          </Card>
        ) : null}

        {rest.length > 0 ? (
          <>
            <h2 className="mt-10 text-lg font-bold tracking-tight">{category ? `Artículos de ${category.toLowerCase()}` : "Últimos artículos"}</h2>
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((post) => <PostCard key={post.slug} post={post} />)}
            </div>
          </>
        ) : null}

        {posts.length === 0 ? (
          <Empty className="mt-6 rounded-xl border">
            <EmptyHeader>
              <EmptyTitle>Todavía no hay artículos en esta categoría</EmptyTitle>
              <EmptyDescription>Quita el filtro para ver todo lo publicado.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </main>
    </div>
  );
}
