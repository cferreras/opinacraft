"use client";

import { useState } from "react";
import { Check, Flag, Globe, MessageCircle, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

function UtilityLink({ href, label, children }: { href?: string | null; label: string; children: React.ReactNode }) {
  if (!href) return <Button variant="ghost" disabled className="h-auto min-w-0 flex-1 flex-col gap-1.5 py-2 text-xs"><span className="flex h-7 items-center justify-center">{children}</span><span>{label}</span></Button>;
  return <Button variant="ghost" asChild className="h-auto min-w-0 flex-1 flex-col gap-1.5 py-2 text-xs"><a href={href} target="_blank" rel="noopener noreferrer"><span className="flex h-7 items-center justify-center">{children}</span><span>{label}</span></a></Button>;
}

export function ServerUtilityActions({ name, websiteUrl, discordUrl }: { name: string; websiteUrl: string | null; discordUrl: string | null }) {
  const [shared, setShared] = useState(false);
  async function shareServer() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${name} | OpinaCraft`, url });
      else await navigator.clipboard?.writeText(url);
      setShared(true); window.setTimeout(() => setShared(false), 1600);
    } catch { setShared(false); }
  }
  return <div className="mt-4 flex items-start justify-between gap-2 border-t pt-3"><UtilityLink href={discordUrl} label="Discord"><MessageCircle className="size-5" /></UtilityLink><UtilityLink href={websiteUrl} label="Web"><Globe className="size-5" /></UtilityLink><Button type="button" variant="ghost" onClick={() => void shareServer()} className="h-auto min-w-0 flex-1 flex-col gap-1.5 py-2 text-xs"><span className="flex h-7 items-center justify-center">{shared ? <Check className="size-5" /> : <Share2 className="size-5" />}</span><span>{shared ? "Copiado" : "Compartir"}</span></Button><Button variant="ghost" asChild className="h-auto min-w-0 flex-1 flex-col gap-1.5 py-2 text-xs"><a href="#report"><span className="flex h-7 items-center justify-center"><Flag className="size-5" /></span><span>Reportar</span></a></Button></div>;
}
