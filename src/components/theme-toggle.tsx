"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const themes = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

/** Theme choice inside the account menu; the header itself no longer carries a theme button. */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();

  return (
    <>
      <DropdownMenuLabel className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme ?? "system"} onValueChange={setTheme}>
        {themes.map(({ value, label, icon: Icon }) => (
          <DropdownMenuRadioItem key={value} value={value}>
            <Icon className="size-4" /> {label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/** Theme choice for the mobile menu, where a nested dropdown would be awkward to reach. */
export function ThemeSegmented({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const current = theme ?? "system";

  return (
    <div role="group" aria-label="Tema" className={cn("grid grid-cols-3 gap-0.5 rounded-lg bg-muted p-0.75", className)}>
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          onClick={() => setTheme(value)}
          className="flex h-9 items-center justify-center gap-1.5 rounded-md text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-card aria-pressed:font-bold aria-pressed:text-foreground aria-pressed:shadow-sm"
        >
          <Icon aria-hidden="true" className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

const emptySubscribe = () => () => {};

/**
 * Theme switch for the footer: icons only on wide screens, labelled and thumb-sized on phones.
 * The saved theme only exists in the browser, so the server marks no option as pressed and the
 * client fills it in after hydration; otherwise a page rendered as "system" would mismatch a
 * visitor's saved "dark".
 */
export function ThemeSwitch({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const current = hydrated ? (theme ?? "system") : undefined;

  return (
    <div
      role="group"
      aria-label="Tema"
      className={cn(
        "grid grid-cols-3 gap-0.75 rounded-xl border bg-card p-0.75 sm:inline-flex sm:gap-0.5 sm:rounded-full",
        className,
      )}
    >
      {themes.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          title={label}
          aria-pressed={current === value}
          onClick={() => setTheme(value)}
          className="flex h-11 items-center justify-center gap-1.5 rounded-[0.5625rem] text-[0.8125rem] font-semibold text-(--footer-muted) outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-(--footer-pressed) aria-pressed:font-bold aria-pressed:text-foreground aria-pressed:shadow-[inset_0_0_0_1px_var(--border)] sm:size-8 sm:rounded-full"
        >
          <Icon aria-hidden="true" className="size-4 sm:size-[0.9375rem]" />
          <span className="sm:sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
