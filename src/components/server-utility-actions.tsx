"use client";

import { useState } from "react";
import {
  IconBrandDiscord,
  IconCheck,
  IconFlag3,
  IconShare3,
  IconWorld,
} from "@tabler/icons-react";

function UtilityLink({
  href,
  label,
  children,
}: {
  href?: string | null;
  label: string;
  children: React.ReactNode;
}) {
  if (!href) {
    return (
      <span className="inline-flex min-w-0 flex-1 flex-col items-center gap-1.5 text-[11px] text-[#a2aab7]" aria-disabled="true">
        <span className="inline-flex h-7 items-center justify-center">{children}</span>
        <span>{label}</span>
      </span>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 flex-1 flex-col items-center gap-1.5 text-[11px] text-[#59657e] transition hover:text-[#2d2de4]">
      <span className="inline-flex h-7 items-center justify-center">{children}</span>
      <span>{label}</span>
    </a>
  );
}

export function ServerUtilityActions({
  name,
  websiteUrl,
  discordUrl,
}: {
  name: string;
  websiteUrl: string | null;
  discordUrl: string | null;
}) {
  const [shared, setShared] = useState(false);

  async function shareServer() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${name} | OpinaCraft`, url });
      } else {
        await navigator.clipboard?.writeText(url);
      }
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch {
      setShared(false);
    }
  }

  return (
    <div className="mt-4 flex items-start justify-between gap-2 border-t border-transparent">
      <UtilityLink href={discordUrl} label="Discord">
        <IconBrandDiscord aria-hidden="true" size={22} stroke={1.7} />
      </UtilityLink>
      <UtilityLink href={websiteUrl} label="Web">
        <IconWorld aria-hidden="true" size={22} stroke={1.7} />
      </UtilityLink>
      <button type="button" onClick={() => void shareServer()} className="inline-flex min-w-0 flex-1 flex-col items-center gap-1.5 text-[11px] text-[#59657e] transition hover:text-[#2d2de4]">
        <span className="inline-flex h-7 items-center justify-center">
          {shared ? <IconCheck aria-hidden="true" size={22} stroke={1.8} /> : <IconShare3 aria-hidden="true" size={22} stroke={1.7} />}
        </span>
        <span>{shared ? "Copiado" : "Compartir"}</span>
      </button>
      <a href="#report" className="inline-flex min-w-0 flex-1 flex-col items-center gap-1.5 text-[11px] text-[#59657e] transition hover:text-[#2d2de4]">
        <span className="inline-flex h-7 items-center justify-center"><IconFlag3 aria-hidden="true" size={22} stroke={1.7} /></span>
        <span>Reportar</span>
      </a>
    </div>
  );
}
