"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { buildFilterFormHref } from "@/lib/servers/filter-form-href";

type NavigateOptions = { clearFields?: readonly string[]; keepPage?: boolean };

// Shared by every control inside the catalog filter form: the search box and the facet pills all navigate the
// same way, and the form keeps its action as the no-JS fallback.
export function useFilterFormNavigation() {
  const router = useRouter();

  return useCallback(
    (form: HTMLFormElement, { clearFields, keepPage = false }: NavigateOptions = {}) => {
      const href = buildFilterFormHref({
        action: form.getAttribute("action") || window.location.pathname,
        entries: new FormData(form).entries(),
        clearFields,
        keepPage: keepPage ? new URLSearchParams(window.location.search).get("page") : null,
      });
      router.push(href);
    },
    [router],
  );
}
