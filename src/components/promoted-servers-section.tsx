import { Clock, Megaphone } from "lucide-react";

import { Badge } from "@/components/ui/badge";

// Parked, not deleted. This used to render above the catalogue, where it took roughly a fifth of
// the first mobile screen to announce a product that does not exist yet -- above-the-fold space
// belongs to the listings until there is inventory to promote. Render it again from the catalogue
// page on the day the paid slots have something in them.
export function PromotedServersSection({ className = "" }: { className?: string }) {
  return (
    <section aria-labelledby="promoted-servers-heading" className={`flex items-center gap-4 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 px-5 py-4 ${className}`}>
      <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/12 text-warning">
        <Megaphone className="size-[1.125rem]" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="promoted-servers-heading" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          Servidores promocionados
          <Badge variant="secondary" className="font-semibold text-muted-foreground"><Clock aria-hidden="true" />Próximamente</Badge>
        </h2>
        <p className="mt-0.5 max-w-[35rem] text-xs leading-relaxed text-muted-foreground">
          Estamos preparando los cuatro espacios de pago que aparecerán sobre el catálogo. Esta función se añadirá próximamente.
        </p>
      </div>
    </section>
  );
}
