"use client";

import type { KeyboardEvent } from "react";

import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { Input } from "@/components/ui/input";

export function ServerSearchInput({ defaultValue }: { defaultValue: string }) {
  const navigate = useFilterFormNavigation();

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const form = event.currentTarget.form;
    if (!form) return;
    event.preventDefault();
    navigate(form);
  }

  return <Input id="server-search" name="q" defaultValue={defaultValue} onKeyDown={submitOnEnter} placeholder="Buscar por nombre, modalidad o dirección" className="h-10 min-w-0 flex-1 bg-card pl-8 text-sm" />;
}
