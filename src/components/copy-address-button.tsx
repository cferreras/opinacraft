"use client";

import { useState } from "react";

export function CopyAddressButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="ml-2 underline">{copied ? "Copiada" : "Copiar"}</button>;
}
