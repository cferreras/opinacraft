"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { descriptionHasOverflow, normalizeServerDescription } from "@/lib/servers/description";

type ServerDescriptionPreviewProps = {
  description: string | null | undefined;
  href: string;
  lines?: 2 | 3;
  className?: string;
};

export function ServerDescriptionPreview({ description, href, lines = 3, className }: ServerDescriptionPreviewProps) {
  const normalizedDescription = normalizeServerDescription(description);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const lineClampClass = lines === 2 ? "line-clamp-2" : "line-clamp-3";

  useEffect(() => {
    const element = descriptionRef.current;
    if (!element) return;

    const updateOverflow = () => {
      setHasOverflow(descriptionHasOverflow(element.scrollHeight, element.clientHeight));
    };

    updateOverflow();
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOverflow);
    resizeObserver?.observe(element);
    window.addEventListener("resize", updateOverflow);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateOverflow);
    };
  }, [lineClampClass, normalizedDescription]);

  if (!normalizedDescription) return null;

  return (
    <div className={cn("min-w-0", className)}>
      <p ref={descriptionRef} className={cn(lineClampClass, "text-sm leading-6 text-muted-foreground")}>
        {normalizedDescription}
      </p>
      {hasOverflow ? (
        <Link href={href} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
          Ver más <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
