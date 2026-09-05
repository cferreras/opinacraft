"use client";

import type { ChangeEvent, ReactNode } from "react";

import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { useSyncedFieldValue } from "@/hooks/use-synced-field-value";
import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

type FilterSelectProps = {
  id: string;
  name: string;
  label: string;
  accessibleLabel?: string;
  /** The value the URL currently carries; the control follows it across client-side navigations. */
  value: string;
  submitOnChange?: boolean;
  /** "pill" puts the label inside the control, for the catalog's single-row filter bar. */
  variant?: "stacked" | "pill";
  children: ReactNode;
};

export function FilterSelect({
  id,
  name,
  label,
  accessibleLabel,
  value: incomingValue,
  submitOnChange = false,
  variant = "stacked",
  children,
}: FilterSelectProps) {
  const navigate = useFilterFormNavigation();
  const [value, setValue] = useSyncedFieldValue(incomingValue);

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setValue(event.currentTarget.value);
    const form = event.currentTarget.form;
    if (form && submitOnChange) navigate(form);
  }

  const ariaLabel = accessibleLabel && accessibleLabel !== label ? accessibleLabel : undefined;

  if (variant === "pill") {
    // The border lives on the wrapper so the label and the value read as one control; the select
    // keeps its own chevron and hit area but drops the styling that would draw a second box.
    return (
      <div className="flex h-10 min-w-0 items-center rounded-lg border bg-muted/40 pl-3 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <FieldLabel htmlFor={id} className="shrink-0 text-xs font-medium text-muted-foreground">
          {label}
        </FieldLabel>
        <NativeSelect
          id={id}
          name={name}
          aria-label={ariaLabel}
          value={value}
          onChange={handleChange}
          className="min-w-0 flex-1 [&>select]:h-9 [&>select]:border-0 [&>select]:bg-transparent [&>select]:pl-1.5 [&>select]:font-medium [&>select]:shadow-none [&>select]:focus-visible:ring-0 dark:[&>select]:bg-transparent dark:[&>select]:hover:bg-transparent"
        >
          {children}
        </NativeSelect>
      </div>
    );
  }

  return (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        size="lg"
        aria-label={ariaLabel}
        value={value}
        onChange={handleChange}
        className="w-full"
      >
        {children}
      </NativeSelect>
    </Field>
  );
}
