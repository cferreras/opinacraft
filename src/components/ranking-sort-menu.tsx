import Link from "next/link";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type RankingSortOption = { key: string; label: string; href: string };

/**
 * The votes are the order; the rest are a click away but not on show. A quiet trigger that names
 * the current order, rather than a row of tabs that would put "Mejor valorados" on equal footing.
 */
export function RankingSortMenu({ options, activeKey, fallbackLabel }: { options: readonly RankingSortOption[]; activeKey: string | null; fallbackLabel: string }) {
  const [primary, ...rest] = options;
  const active = options.find((option) => option.key === activeKey);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="-mr-2 text-xs font-semibold text-muted-foreground">
          <span className="font-medium">Orden:</span> {active?.label ?? fallbackLabel}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <SortItem option={primary} active={activeKey === primary.key} />
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[0.625rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">Otros órdenes</DropdownMenuLabel>
        {rest.map((option) => <SortItem key={option.key} option={option} active={activeKey === option.key} />)}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortItem({ option, active }: { option: RankingSortOption; active: boolean }) {
  return (
    <DropdownMenuItem asChild className="text-[0.8125rem]">
      <Link href={option.href} prefetch={false} aria-current={active ? "true" : undefined}>
        <span className="flex-1">{option.label}</span>
        {active ? <Check aria-hidden="true" className="size-3.5 text-primary" /> : null}
      </Link>
    </DropdownMenuItem>
  );
}
