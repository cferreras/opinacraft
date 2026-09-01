"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type TocEntry = { id: string; heading: string };

// Highlights the section the reader is actually in. Purely presentational: with JS off, or before
// hydration, every entry still renders as a working anchor.
export function BlogArticleToc({ entries }: { entries: readonly TocEntry[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const entryKey = entries.map((entry) => entry.id).join(",");

  useEffect(() => {
    const headings = entryKey.split(",").map((id) => document.getElementById(id)).filter((element) => element !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((record) => record.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      // Only the band under the sticky header counts as "here", so the active entry advances as a
      // heading reaches the top rather than as soon as it appears at the bottom.
      { rootMargin: "-88px 0px -68% 0px" },
    );

    for (const heading of headings) observer.observe(heading);
    return () => observer.disconnect();
  }, [entryKey]);

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex h-10 items-center px-4">
        <h2 id="blog-toc-heading" className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">En esta página</h2>
      </div>
      {entries.map((entry, index) => {
        const isActive = activeId ? activeId === entry.id : index === 0;
        return (
          <a
            key={entry.id}
            href={`#${entry.id}`}
            aria-current={isActive ? "true" : undefined}
            className="flex gap-2.5 px-4 py-2.5 first-of-type:border-t focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
          >
            <span aria-hidden="true" className={cn("w-0.5 shrink-0 rounded-full transition-colors", isActive ? "bg-primary" : "bg-transparent")} />
            <span className={cn("text-[0.78125rem] leading-[1.125rem] transition-colors", isActive ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground")}>
              {entry.heading}
            </span>
          </a>
        );
      })}
    </div>
  );
}
