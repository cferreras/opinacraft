import { IconBrandMinecraft } from "@tabler/icons-react";

import type { ServerMedia } from "@/lib/servers/queries";

const logoPalettes = [
  "bg-[#e8f8f4] text-[#109789]",
  "bg-[#fff0e9] text-[#d64919]",
  "bg-[#eaf1ff] text-[#1b4273]",
  "bg-[#edf5e6] text-[#607e31]",
  "bg-[#f2ebfa] text-[#5a3c7b]",
  "bg-[#e8f5f7] text-[#168e9e]",
];

function paletteFor(name: string) {
  const hash = [...name].reduce((total, character) => total + character.charCodeAt(0), 0);
  return logoPalettes[hash % logoPalettes.length];
}

export function ServerLogo({
  name,
  media,
  className = "h-11 w-11 rounded-[0.3125rem]",
}: {
  name: string;
  media: ServerMedia[];
  className?: string;
}) {
  const logo = media.find((item) => item.kind === "logo");

  if (logo) {
    return (
      <img
        src={logo.url}
        alt={`${name} logo`}
        className={`${className} shrink-0 object-cover ring-1 ring-black/5`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} ${paletteFor(name)} inline-flex shrink-0 items-center justify-center ring-1 ring-black/5`}
    >
      <IconBrandMinecraft size="1.6875rem" stroke={1.7} />
    </span>
  );
}
