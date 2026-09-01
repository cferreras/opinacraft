import { Blocks } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ServerMedia } from "@/lib/servers/queries";

export function ServerLogo({
  name,
  media,
  className = "h-11 w-11 rounded-md",
  // The CSS box is set by `className`; these are the intrinsic dimension attributes, so the
  // image declares its own aspect ratio instead of arriving without one.
  size = 44,
}: {
  name: string;
  media: ServerMedia[];
  className?: string;
  size?: number;
}) {
  const logo = media.find((item) => item.kind === "logo");
  return (
    <Avatar className={`${className} shrink-0 rounded-md`}>
      {logo && <AvatarImage src={logo.url} alt={`Logotipo de ${name}`} width={size} height={size} className="rounded-md object-cover" />}
      <AvatarFallback aria-hidden="true" className="rounded-md bg-primary/10 text-primary">
        <Blocks className="size-5" />
      </AvatarFallback>
    </Avatar>
  );
}
