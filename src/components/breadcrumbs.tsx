import Link from "next/link";
import { Fragment } from "react";
import { ChevronRight } from "lucide-react";

type Crumb = { label: string; href: string };

// One breadcrumb for every detail page. Server fichas and blog articles used to spell out their
// own, which is how they drifted apart.
export function Breadcrumbs({ trail, current, className = "" }: { trail: readonly Crumb[]; current: string; className?: string }) {
  return (
    <nav aria-label="Ruta de navegación" className={`flex items-center gap-1.5 pb-4 text-xs text-muted-foreground ${className}`}>
      {trail.map((crumb) => (
        <Fragment key={crumb.href}>
          <Link href={crumb.href} className="shrink-0 transition-colors hover:text-foreground">{crumb.label}</Link>
          <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/50" />
        </Fragment>
      ))}
      <span className="truncate font-semibold text-foreground">{current}</span>
    </nav>
  );
}
