"use client";

import { useState } from "react";
import { Check, Flag, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ServerUtilityActions({ name }: { name: string }) {
  const [shared, setShared] = useState(false);

  async function shareServer() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${name} | OpinaCraft`, url });
      else {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch {
      setShared(false);
    }
  }

  return (
    <div className="grid grid-cols-2 divide-x border-t">
      <Button type="button" variant="ghost" onClick={() => void shareServer()} className="h-11 rounded-none gap-2 text-xs font-medium">
        {shared ? <Check className="size-4" /> : <Share2 className="size-4" />}
        {shared ? "Compartido" : "Compartir"}
      </Button>
      <Button variant="ghost" asChild className="h-11 rounded-none gap-2 text-xs font-medium">
        <a href="#report"><Flag className="size-4" /> Reportar</a>
      </Button>
    </div>
  );
}
