import { Blocks } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ServerMedia } from "@/lib/servers/queries";

export function ServerLogo({
  name,
  media,
  className = "h-11 w-11 rounded-md",
}: {
  name: string;
  media: ServerMedia[];
  className?: string;
}) {
  const logo = media.find((item) => item.kind === "logo");
  return (
    <Avatar className={`${className} shrink-0 rounded-md`}>
      {logo && <AvatarImage src={logo.url} alt={`${name} logo`} className="rounded-md object-cover" />}
      <AvatarFallback aria-hidden="true" className="rounded-md bg-primary/10 text-primary">
        <Blocks className="size-5" />
      </AvatarFallback>
    </Avatar>
  );
}
