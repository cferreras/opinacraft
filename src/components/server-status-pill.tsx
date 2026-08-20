import type { ServerStatus } from "@/lib/servers/format";
import { statusLabel } from "@/lib/servers/format";

export function StatusPill({ status, className = "text-[0.6875rem]" }: { status: ServerStatus; className?: string }) {
  const tone =
    status === "online"
      ? "bg-success-soft text-success"
      : status === "offline"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";
  const dot = status === "online" ? "bg-success" : status === "offline" ? "bg-destructive" : "bg-muted-foreground/40";

  return (
    <span className={`inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full px-2 font-semibold ${className} ${tone}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
      {statusLabel(status)}
    </span>
  );
}
