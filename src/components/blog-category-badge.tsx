import { blogCategoryMeta, type BlogCategory } from "@/lib/blog/posts";
import { cn } from "@/lib/utils";

export function BlogCategoryBadge({ category, className = "" }: { category: BlogCategory; className?: string }) {
  return (
    <span className={cn("inline-flex h-[1.375rem] w-fit items-center rounded-full px-2.5 text-[0.6875rem] font-bold", blogCategoryMeta[category].badge, className)}>
      {category}
    </span>
  );
}

/** The compact form used where a full badge would crowd the card: label only, in the category ink. */
export function BlogCategoryLabel({ category, className = "" }: { category: BlogCategory; className?: string }) {
  return (
    <p className={cn("text-[0.625rem] font-bold uppercase tracking-[0.06em]", blogCategoryMeta[category].ink, className)}>
      {category}
    </p>
  );
}
