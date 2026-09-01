import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BlogCategoryBadge } from "@/components/blog-category-badge";
import { Card } from "@/components/ui/card";
import { blogPath, blogPostPath, formatBlogDate, latestBlogPosts } from "@/lib/blog/posts";

// Rail module on the catalog: the newest post leads with its cover, the rest stay as compact text
// rows. One image gives the module presence; four would compete with the results table beside it.
export function BlogHighlightsCard({ className = "" }: { className?: string }) {
  const [featured, ...rest] = latestBlogPosts();
  if (!featured) return null;

  return (
    <Card className={`gap-0 py-0 ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 lg:h-10 lg:py-0">
        <h2 id="blog-highlights-heading" className="text-sm font-semibold tracking-tight lg:text-[0.6875rem] lg:font-bold lg:uppercase lg:tracking-[0.08em] lg:text-muted-foreground">Del blog</h2>
        <Link href={blogPath} className="inline-flex shrink-0 items-center gap-1 text-[0.8125rem] font-semibold text-primary transition-opacity hover:opacity-80 lg:text-xs">
          Ver todo<ArrowRight aria-hidden="true" className="hidden size-3 lg:inline" />
        </Link>
      </div>

      <Link
        href={blogPostPath(featured.slug)}
        className="group block border-t transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
      >
        <Image src={featured.cover} alt={featured.coverAlt} width={480} height={270} sizes="(min-width: 1024px) 15rem, 100vw" className="h-[10.5rem] w-full object-cover lg:h-[8.25rem]" />
        <div className="px-4 pb-3.5 pt-3">
          <BlogCategoryBadge category={featured.category} className="h-5 px-2 text-[0.625rem]" />
          <p className="mt-2 text-[0.84375rem] font-bold leading-[1.1875rem] tracking-[-0.008em] transition-colors group-hover:text-primary">{featured.title}</p>
          <p className="mt-1.5 text-[0.6875rem] text-muted-foreground">{formatBlogDate(featured.publishedAt)} · {featured.readingMinutes} min</p>
        </div>
      </Link>

      {rest.map((post) => (
        <Link
          key={post.slug}
          href={blogPostPath(post.slug)}
          className="group block border-t px-4 py-2.5 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
        >
          <p className="text-[0.78125rem] font-semibold leading-[1.0625rem] transition-colors group-hover:text-primary">{post.title}</p>
          <p className="mt-1 text-[0.65625rem] text-muted-foreground">{formatBlogDate(post.publishedAt)} · {post.category}</p>
        </Link>
      ))}
    </Card>
  );
}
