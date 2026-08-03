"use client";

import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";

type ServerSearchInputProps = {
  defaultValue: string;
};

export function ServerSearchInput({ defaultValue }: ServerSearchInputProps) {
  const router = useRouter();

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();

    const form = event.currentTarget.form;
    if (!form) return;

    const formData = new FormData(form);
    const params = new URLSearchParams();
    for (const [key, value] of formData.entries()) {
      if (typeof value === "string" && value) params.append(key, value);
    }
    const normalizedQuery = String(formData.get("q") ?? "").trim();
    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");
    params.delete("page");

    const action = form.action || window.location.pathname;
    const queryString = params.toString();
    router.push(queryString ? `${action}?${queryString}` : action);
  }

  return (
    <input
      id="server-search"
      name="q"
      defaultValue={defaultValue}
      onKeyDown={submitOnEnter}
      placeholder="Buscar por nombre, modalidad o dirección"
      className="h-full min-w-0 flex-1 bg-transparent px-3 text-[0.75rem] text-[#33404c] outline-none placeholder:text-[#8b96a1]"
    />
  );
}
