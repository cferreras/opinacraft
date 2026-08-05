"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CopyAddressButton({
  value,
  className,
  iconOnly = false,
  showIcon = false,
  label = "Copiar",
}: {
  value: string;
  className?: string;
  iconOnly?: boolean;
  showIcon?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAddress() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <Button
      type="button"
      onClick={() => void copyAddress()}
      aria-label={iconOnly ? (copied ? "Dirección copiada" : `Copiar ${value}`) : undefined}
      title={iconOnly ? (copied ? "Dirección copiada" : "Copiar dirección") : undefined}
      variant="ghost"
      size={iconOnly ? "icon" : "default"}
      className={cn("text-muted-foreground hover:text-foreground", className)}
    >
      {iconOnly || showIcon ? <Icon aria-hidden="true" /> : null}
      {!iconOnly && <span>{copied ? "Copiada" : label}</span>}
    </Button>
  );
}
