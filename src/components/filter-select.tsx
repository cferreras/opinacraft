"use client";

import { IconChevronDown } from "@tabler/icons-react";
import { useRef } from "react";
import type { FocusEvent, MouseEvent, PointerEvent, ReactNode } from "react";

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
    <label htmlFor={id} className="relative block min-w-0">
      <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-500">{label}</span>
      <span className="relative block">
        <select
          id={id}
          name={name}
          aria-label={accessibleLabel && accessibleLabel !== label ? accessibleLabel : undefined}
          defaultValue={defaultValue}
          onChange={submitOnChange ? handleChange : undefined}
          onBlur={submitOnChange ? handleBlur : undefined}
          onPointerUp={submitOnChange ? handlePointerUp : undefined}
          onClick={submitOnChange ? handleClick : undefined}
          className="ui-select h-9 appearance-none pr-8 text-[11px]"
        >
          {children}
        </select>
        <IconChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#465360]" size={14} />
      </span>
    </label>
  );
}
