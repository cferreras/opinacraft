"use client";

import type { ChangeEvent, ReactNode } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";

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
    const form = event.currentTarget.form;
    queueMicrotask(() => form?.requestSubmit());
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
        aria-label={accessibleLabel && accessibleLabel !== label ? accessibleLabel : undefined}
        defaultValue={defaultValue}
        onChange={submitOnChange ? handleChange : undefined}
        className="w-full"
      >
        {children}
      </NativeSelect>
    </Field>
  );
}
