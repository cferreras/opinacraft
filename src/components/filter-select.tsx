"use client";

import { useRef } from "react";
import type { FocusEvent, MouseEvent, PointerEvent, ReactNode } from "react";

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
  const pendingSubmitRef = useRef(false);

  function handleChange() {
    if (submitOnChange) pendingSubmitRef.current = true;
  }

  function submitPending(form: HTMLFormElement | null) {
    if (!pendingSubmitRef.current) return;
    pendingSubmitRef.current = false;
    form?.requestSubmit();
  }

  function handleBlur(event: FocusEvent<HTMLSelectElement>) {
    submitPending(event.currentTarget.form);
  }

  function handlePointerUp(event: PointerEvent<HTMLSelectElement>) {
    const form = event.currentTarget.form;
    queueMicrotask(() => submitPending(form));
  }

  function handleClick(event: MouseEvent<HTMLSelectElement>) {
    submitPending(event.currentTarget.form);
  }

  return (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </FieldLabel>
      <NativeSelect
        id={id}
        name={name}
        aria-label={accessibleLabel && accessibleLabel !== label ? accessibleLabel : undefined}
        defaultValue={defaultValue}
        onChange={submitOnChange ? handleChange : undefined}
        onBlur={submitOnChange ? handleBlur : undefined}
        onPointerUp={submitOnChange ? handlePointerUp : undefined}
        onClick={submitOnChange ? handleClick : undefined}
        className="w-full"
      >
        {children}
      </NativeSelect>
    </Field>
  );
}
