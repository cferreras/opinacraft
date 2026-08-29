"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChangeEvent, KeyboardEvent } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { ManagedServerFilter, ManagedServerSort } from "@/lib/servers/managed-servers";

const filterTabs: Array<{ value: ManagedServerFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "online", label: "En línea" },
  { value: "attention", label: "Con avisos" },
  { value: "draft", label: "Borradores" },
];

const sortOptions: Array<{ value: ManagedServerSort; label: string }> = [
  { value: "status", label: "Estado" },
  { value: "name", label: "Nombre" },
  { value: "players", label: "Jugadores" },
  { value: "recent", label: "Más recientes" },
];

type Props = {
  query: string;
  filter: ManagedServerFilter;
  sort: ManagedServerSort;
  counts: Record<ManagedServerFilter, number>;
};

function buildHref({ query, filter, sort }: { query: string; filter: ManagedServerFilter; sort: ManagedServerSort }) {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (filter !== "all") params.set("filter", filter);
  if (sort !== "status") params.set("sort", sort);
  const search = params.toString();
  return search ? `/dashboard/servers?${search}` : "/dashboard/servers";
}

export function ManagedServersToolbar({ query, filter, sort, counts }: Props) {
  const router = useRouter();

  function submitSearch(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    router.push(buildHref({ query: event.currentTarget.value, filter, sort }));
  }

  function changeSort(event: ChangeEvent<HTMLSelectElement>) {
    router.push(buildHref({ query, filter, sort: event.currentTarget.value as ManagedServerSort }));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-72">
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <label htmlFor="managed-server-search" className="sr-only">Filtrar servidores</label>
        <Input
          id="managed-server-search"
          name="q"
          defaultValue={query}
          onKeyDown={submitSearch}
          placeholder="Filtrar por nombre o dirección"
          className="h-9 bg-card pl-8 text-sm"
        />
      </div>

      <div role="tablist" aria-label="Filtrar servidores por estado" className="flex h-9 items-center gap-0.5 rounded-lg bg-muted p-[3px]">
        {filterTabs.map((tab) => {
          const active = tab.value === filter;
          return (
            <Link
              key={tab.value}
              role="tab"
              aria-selected={active}
              href={buildHref({ query, filter: tab.value, sort })}
              className={`inline-flex h-[30px] items-center gap-1.5 rounded-md px-3 text-[0.8rem] transition-colors ${active ? "bg-card font-semibold text-foreground shadow-sm ring-1 ring-foreground/10" : "font-medium text-muted-foreground hover:text-foreground"}`}
            >
              {tab.label}
              <span className="tabular-nums text-muted-foreground">{counts[tab.value]}</span>
            </Link>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <label htmlFor="managed-server-sort" className="text-sm text-muted-foreground">Ordenar</label>
        <NativeSelect id="managed-server-sort" value={sort} onChange={changeSort} className="w-auto [&_select]:bg-card">
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </NativeSelect>
      </div>
    </div>
  );
}
