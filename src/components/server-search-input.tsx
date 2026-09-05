"use client";

import type { ChangeEvent, KeyboardEvent } from "react";

import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { useSyncedFieldValue } from "@/hooks/use-synced-field-value";
import { Input } from "@/components/ui/input";

export function ServerSearchInput({ value: incomingValue, cleared }: { value: string; cleared: boolean }) {
  const navigate = useFilterFormNavigation();
  const [value, setValue] = useSyncedFieldValue(incomingValue, cleared);

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    const form = event.currentTarget.form;
    if (!form) return;
    event.preventDefault();
    navigate(form);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.currentTarget.value);
  }

  return <Input id="server-search" name="q" value={value} onChange={handleChange} onKeyDown={submitOnEnter} placeholder="Buscar por nombre, modalidad o dirección" className="h-10 min-w-0 flex-1 bg-card pl-8 text-sm" />;
}
