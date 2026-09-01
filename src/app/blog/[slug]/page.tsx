import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Blocks } from "lucide-react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { BlogArticleToc } from "@/components/blog-article-toc";
import { BlogCategoryBadge, BlogCategoryLabel } from "@/components/blog-category-badge";
import { Card } from "@/components/ui/card";
import { SiteHeader } from "@/components/site-header";
import {
  blogCoverHeight,
  blogCoverWidth,
  blogPath,
  blogPosts,
  blogPostPath,
  blogSectionId,
  findBlogPost,
  formatBlogDate,
  formatBlogDateLong,
  otherBlogPosts,
} from "@/lib/blog/posts";
import { catalogPath } from "@/lib/servers/catalog-route";

type BlogPostPageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = findBlogPost(slug);
  // notFound() below cannot set a 404 status: cacheComponents streams the shell
  // first, so the response is already committed as a 200. noindex is what keeps
  // the resulting soft 404 out of the index. dynamicParams = false, the usual
  // fix, is rejected outright when cacheComponents is on.
  if (!post) return { title: "Artículo no encontrado | OpinaCraft", robots: { index: false, follow: false } };

  const title = `${post.title} | OpinaCraft`;
  return {
    title,
    description: post.excerpt,
    alternates: { canonical: blogPostPath(post.slug) },
    openGraph: { title, description: post.excerpt, type: "article", publishedTime: post.publishedAt, images: [post.cover] },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = findBlogPost(slug);
  if (!post) notFound();
  const entries = post.sections.map((section) => ({ id: blogSectionId(section.heading), heading: section.heading }));
  const more = otherBlogPosts(post.slug, 2);

  return (
    <div className="flex-1 bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl px-4 pb-14 pt-9 sm:px-6 lg:px-8">
        <Breadcrumbs trail={[{ label: "Blog", href: blogPath }]} current={post.title} />

        <div className="mt-2 grid items-start gap-x-8 lg:grid-cols-[minmax(0,1fr)_15.5rem]">
          <article className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <BlogCategoryBadge category={post.category} />
              <span className="text-xs text-muted-foreground">
                <time dateTime={post.publishedAt}>{formatBlogDateLong(post.publishedAt)}</time> · {post.readingMinutes} min de lectura
              </span>
            </div>

            <h1 className="mt-4 max-w-[43.75rem] text-[1.75rem] font-bold leading-[2.125rem] tracking-[-0.025em] sm:text-4xl sm:leading-[2.75rem]">{post.title}</h1>
            <p className="mt-3.5 max-w-[43.75rem] text-base leading-[1.6875rem] text-muted-foreground">{post.excerpt}</p>

            <Image src={post.cover} alt="" width={blogCoverWidth} height={blogCoverHeight} priority sizes="(min-width: 1024px) 50rem, 100vw" className="mt-7 aspect-video w-full rounded-xl object-cover" />

            {post.sections.map((section, index) => (
              <section key={section.heading}>
                <h2 id={entries[index]?.id} className="mt-8 scroll-mt-24 text-[1.1875rem] font-bold tracking-[-0.012em]">{section.heading}</h2>
                {section.paragraphs.map((paragraph, paragraphIndex) => (
                  <p key={paragraph.slice(0, 48)} className={`max-w-[43.75rem] text-[0.9375rem] leading-[1.6875rem] text-foreground/70 ${paragraphIndex === 0 ? "mt-3" : "mt-4"}`}>
                    {paragraph}
                  </p>
                ))}
                {/* The pulled line sits between the second and third section, where the article's
                    middle needs a breath. */}
                {post.pullQuote && index === 1 ? (
                  <div className="mt-8 max-w-[43.75rem]">
                    <span aria-hidden="true" className="block h-0.5 w-8 bg-primary" />
                    <p className="mt-4 text-[1.1875rem] font-medium leading-[1.875rem] tracking-[-0.012em]">{post.pullQuote}</p>
                  </div>
                ) : null}
              </section>
            ))}

            {more.length > 0 ? (
              <>
                <hr className="mt-11 border-border" />
                <h2 className="mt-7 text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">Seguir leyendo</h2>
                <div className="mt-3.5 grid gap-5 sm:grid-cols-2">
                  {more.map((item) => (
                    <Card key={item.slug} className="relative gap-0 py-0 transition-colors hover:bg-muted/30 has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50">
                      <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3.5 p-3.5">
                        <Image src={item.cover} alt="" width={208} height={208} sizes="6.5rem" className="aspect-square w-full rounded-[0.625rem] object-cover" />
                        <div className="min-w-0">
                          <BlogCategoryLabel category={item.category} />
                          <p className="mt-1.5 text-sm font-semibold leading-5">
                            <Link href={blogPostPath(item.slug)} className="transition-colors after:absolute after:inset-0 hover:text-primary focus-visible:text-primary focus-visible:outline-none">
                              {item.title}
                            </Link>
                          </p>
                          <p className="mt-2 text-[0.71875rem] text-muted-foreground">{formatBlogDate(item.publishedAt)} · {item.readingMinutes} min</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </>
            ) : null}
          </article>

          <aside aria-labelledby="blog-toc-heading" className="mt-10 flex min-w-0 flex-col gap-4 lg:sticky lg:top-[calc(4rem+1.5rem)] lg:mt-0">
            <BlogArticleToc entries={entries} />

            <Card className="gap-0 p-4">
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[0.5625rem] bg-primary/10 text-primary">
                <Blocks className="size-[1.0625rem]" />
              </span>
              <p className="mt-2.5 text-[0.8125rem] font-semibold leading-[1.125rem]">Pon en práctica lo que acabas de leer</p>
              <p className="mt-1.5 text-xs leading-[1.0625rem] text-muted-foreground">Filtra el catálogo por modalidad, versión y país.</p>
              <Link
                href={catalogPath}
                className="mt-3 flex h-[2.125rem] items-center justify-center rounded-[0.5625rem] bg-primary text-[0.78125rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Ver servidores
              </Link>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}
