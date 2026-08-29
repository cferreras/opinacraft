"use client";

import type { MouseEvent, ReactNode } from "react";

import { useFilterFormNavigation } from "@/hooks/use-filter-form-navigation";
import { Button } from "@/components/ui/button";

// Submits the catalog filter form the same way its fields do, so pressing the button is a client
// navigation; without JavaScript the button falls back to the form's native GET action.
export function FilterFormSubmitButton({ children }: { children: ReactNode }) {
  const navigate = useFilterFormNavigation();

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    event.preventDefault();
    navigate(form);
  }

  return (
    <Button type="submit" size="lg" onClick={handleClick} className="h-10 shrink-0 px-5">
      {children}
    </Button>
  );
}
