import { createElement } from "react";

import { findServerCountry } from "@/lib/servers/countries";
import { cn } from "@/lib/utils";

export function ServerCountryCode({ code, className }: { code: string | null | undefined; className?: string }) {
  const country = findServerCountry(code);
  if (!country) return null;

  const visibleCode = country.code === "global" ? "INTL" : country.code.toUpperCase();

  return createElement(
    "span",
    {
      "aria-label": `País: ${country.label}`,
      className: cn(
        "shrink-0 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground",
        className,
      ),
    },
    visibleCode,
  );
}
