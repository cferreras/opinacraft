import { Blocks } from "lucide-react";
import { getImageProps } from "next/image";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { ServerMedia } from "@/lib/servers/queries";
import { cn } from "@/lib/utils";

export function ServerLogo({
  name,
  media,
  className = "h-11 w-11 rounded-md",
  // The CSS box is set by `className`; these are the intrinsic dimension attributes, so the
  // image declares its own aspect ratio instead of arriving without one.
  size = 44,
  monogram = false,
}: {
  name: string;
  media: ServerMedia[];
  className?: string;
  size?: number;
  /** Large placements draw the server's initial instead of the generic block icon. */
  monogram?: boolean;
}) {
  const logo = media.find((item) => item.kind === "logo");
  const initial = name.trim().charAt(0).toUpperCase();
  // Owners upload logos at up to 1024px and the card draws them at 44. Going through the image
  // optimizer serves a 1x/2x pair sized for the slot instead of the original file.
  const image = logo ? getImageProps({ src: logo.url, alt: "", width: size, height: size }).props : null;
  return (
    // `className` goes last so a caller's radius wins over the default one.
    <Avatar className={cn("shrink-0 rounded-md", className)}>
      {image && <AvatarImage src={image.src} srcSet={image.srcSet} alt={`Logotipo de ${name}`} width={size} height={size} decoding="async" className="rounded-[inherit] object-cover" />}
      {monogram && initial ? (
        <AvatarFallback aria-hidden="true" className="rounded-[inherit] bg-[oklch(0.32_0.06_160)] text-[length:inherit] font-extrabold tracking-[-0.04em] text-[oklch(0.9_0.09_160)]">
          {initial}
        </AvatarFallback>
      ) : (
        <AvatarFallback aria-hidden="true" className="rounded-[inherit] bg-primary/10 text-primary">
          <Blocks className="size-5" />
        </AvatarFallback>
      )}
    </Avatar>
  );
}
