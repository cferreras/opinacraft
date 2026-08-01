"use client";

import { IconChevronDown } from "@tabler/icons-react";
import type { ChangeEvent, ReactNode } from "react";

type FilterSelectProps = {
  id: string;
  name: string;
  label: string;
  accessibleLabel?: string;
  defaultValue: string;
  submitOnChange?: boolean;
  children: ReactNode;
};

export function FilterSelect({
  id,
  name,
  label,
  accessibleLabel,
  defaultValue,
  submitOnChange = false,
  children,
}: FilterSelectProps) {
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    if (submitOnChange) event.currentTarget.form?.requestSubmit();
  }

  return (
    <label htmlFor={id} className="relative block min-w-0">
      <span className="sr-only">{label}</span>
      <select
        id={id}
        name={name}
        aria-label={accessibleLabel ?? label}
        defaultValue={defaultValue}
        onChange={submitOnChange ? handleChange : undefined}
        className="h-9 w-full appearance-none rounded-lg border border-[#e1e6e9] bg-white px-3 pr-8 text-[11px] text-[#53606c] outline-none transition hover:border-[#cbd4d9] focus:border-[#4655e8] focus:ring-2 focus:ring-[#4655e8]/15"
      >
        {children}
      </select>
      <IconChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#465360]" size={14} />
    </label>
  );
}
