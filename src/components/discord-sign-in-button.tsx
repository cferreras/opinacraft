import { IconBrandDiscord } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

export function DiscordSignInButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      onClick={onClick}
      className="w-full gap-2 !border-primary/40 !bg-primary/10 font-semibold text-foreground hover:!border-primary/70 hover:!bg-primary/20"
    >
      <IconBrandDiscord aria-hidden="true" className="size-4 text-primary" />
      Continuar con Discord
    </Button>
  );
}
