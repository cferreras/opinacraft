import { Badge } from "@/components/ui/badge";

export function SectionHeading({
  number,
  icon,
  id,
  title,
  description,
  requirement,
}: {
  number: string;
  icon: React.ReactNode;
  id?: string;
  title: string;
  description: string;
  requirement?: "required" | "optional";
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-primary">{number}</p>
        <h2 id={id} className="mt-0.5 text-base font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
      </div>
      {requirement ? <Badge variant="secondary" className="mt-0.5 shrink-0 font-semibold text-muted-foreground">{requirement === "required" ? "Obligatorio" : "Opcional"}</Badge> : null}
    </div>
  );
}
