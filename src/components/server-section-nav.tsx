"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type Section = { id: string; label: string; count?: number };

// Tabs for the ficha's sections. Purely presentational, like the blog's contents rail: without JS
// every tab is still a working anchor, and the first one reads as current.
export function ServerSectionNav({ sections }: { sections: readonly Section[] }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sectionKey = sections.map((section) => section.id).join(",");

  useEffect(() => {
    const targets = sectionKey.split(",").map((id) => document.getElementById(id)).filter((element) => element !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (records) => {
        const visible = records
          .filter((record) => record.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-88px 0px -60% 0px" },
    );

    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [sectionKey]);

  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 flex gap-8.5 overflow-x-auto border-b px-4 text-sm font-bold sm:mx-0 sm:px-0">
      {sections.map((section, index) => {
        const isActive = activeId ? activeId === section.id : index === 0;
        return (
          <a
            key={section.id}
            href={`#${section.id}`}
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 py-3.25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50",
              isActive ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {section.label}
            {section.count !== undefined ? <span className="ml-1.5 font-semibold tabular-nums">{section.count}</span> : null}
          </a>
        );
      })}
    </nav>
  );
}
