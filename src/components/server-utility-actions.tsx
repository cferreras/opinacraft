"use client";

import { useState } from "react";
import { Check, Flag, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function useShareServer(name: string) {
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

  return { shared, shareServer };
}

/** The icon-only share action for the phone's bottom bar. */
export function ShareServerButton({ name, className }: { name: string; className?: string }) {
  const { shared, shareServer } = useShareServer(name);
  return (
    <Button type="button" variant="outline" size="icon" onClick={() => void shareServer()} aria-label={shared ? "Compartido" : "Compartir"} className={cn("size-12 shrink-0", className)}>
      {shared ? <Check className="size-4" /> : <Share2 className="size-4" />}
    </Button>
  );
}

export function ServerUtilityActions({ name }: { name: string }) {
  const { shared, shareServer } = useShareServer(name);

  return (
    <div className="grid grid-cols-2 border-t">
      <Button type="button" variant="ghost" onClick={() => void shareServer()} className="h-11 gap-2 rounded-none text-[0.8125rem] font-bold text-foreground/80">
        {shared ? <Check className="size-4" /> : <Share2 className="size-4" />}
        {shared ? "Compartido" : "Compartir"}
      </Button>
      {/* The divider is drawn here: Button's own transparent border would swallow a `divide-x`. */}
      <Button variant="ghost" asChild className="h-11 gap-2 rounded-none border-0 border-l border-border text-[0.8125rem] font-bold text-foreground/80">
        <a href="#report"><Flag className="size-4" /> Reportar</a>
      </Button>
    </div>
  );
}
