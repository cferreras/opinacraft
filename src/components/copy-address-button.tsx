"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "@tabler/icons-react";

export function CopyAddressButton({
  value,
  className = "",
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
      const clipboard = navigator.clipboard;
      if (!clipboard || typeof clipboard.writeText !== "function") {
        throw new Error("Clipboard API unavailable");
      }
      await clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copyAddress()}
      aria-label={iconOnly ? (copied ? "Dirección copiada" : `Copiar ${value}`) : undefined}
      title={iconOnly ? (copied ? "Dirección copiada" : "Copiar dirección") : undefined}
      className={iconOnly ? `inline-flex h-9 w-9 items-center justify-center rounded-md transition ${className}` : `inline-flex min-h-10 items-center justify-center gap-2 transition ${className}`}
    >
      {iconOnly ? (copied ? <IconCheck aria-hidden="true" size={15} /> : <IconCopy aria-hidden="true" size={15} />) : (
        <>
          {showIcon ? (copied ? <IconCheck aria-hidden="true" size={17} /> : <IconCopy aria-hidden="true" size={17} />) : null}
          <span>{copied ? "Copiada" : label}</span>
        </>
      )}
    </button>
  );
}
