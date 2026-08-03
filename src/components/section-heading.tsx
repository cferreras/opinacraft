export function SectionHeading({
  number,
  icon,
  id,
  title,
  description,
}: {
  number: string;
  icon: React.ReactNode;
  id?: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f0f1ff] text-[#2d34cf]">
        {icon}
      </span>
      <div>
        <p className="text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-[#7a86a0]">{number}</p>
        <h2 id={id} className="mt-0.5 text-[1rem] font-semibold tracking-[-0.02em] text-[#17202a]">{title}</h2>
        <p className="mt-1 text-[0.6875rem] leading-5 text-[#667287]">{description}</p>
      </div>
    </div>
  );
}
