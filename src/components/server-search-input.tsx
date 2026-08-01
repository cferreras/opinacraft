"use client";

import type { KeyboardEvent } from "react";

type ServerSearchInputProps = {
  defaultValue: string;
};

export function ServerSearchInput({ defaultValue }: ServerSearchInputProps) {
  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();

    const form = event.currentTarget.form;
    if (!form) return;

    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value) params.append(key, value);
    }
    params.set("q", event.currentTarget.value);
    params.delete("page");

    const action = form.getAttribute("action") || window.location.pathname;
    const query = params.toString();
    window.location.assign(query ? `${action}?${query}` : action);
  }

  return (
    <input
      id="server-search"
      name="q"
      aria-label="Buscar"
      defaultValue={defaultValue}
      onKeyDown={submitOnEnter}
      placeholder="Buscar por nombre, modalidad o dirección"
      className="h-full min-w-0 flex-1 bg-transparent px-3 text-[12px] text-[#33404c] outline-none placeholder:text-[#8b96a1]"
    />
  );
}
