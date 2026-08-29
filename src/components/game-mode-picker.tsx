"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Field, FieldDescription } from "@/components/ui/field";
import { MAX_SERVER_GAME_MODES, nicheGameModes, popularGameModes } from "@/lib/servers/game-modes";

type GameModePickerProps = {
  name: string;
  label?: string;
  initialModes?: readonly string[];
  onSelectedChange?: (modes: string[]) => void;
};

/**
 * Plain checkboxes styled as chips: the browser submits `gameModes` once per checked box, so the
 * picker keeps working with JavaScript off. The only thing the client adds is the cap — once
 * {@link MAX_SERVER_GAME_MODES} are picked the rest go disabled, which explains the limit better
 * than an error after saving.
 */
export function GameModePicker({ name, label = "Modos de juego", initialModes = [], onSelectedChange }: GameModePickerProps) {
  const [selected, setSelected] = useState<string[]>([...initialModes]);
  const full = selected.length >= MAX_SERVER_GAME_MODES;

  function toggle(slug: string, checked: boolean) {
    const next = checked ? [...selected, slug].slice(0, MAX_SERVER_GAME_MODES) : selected.filter((item) => item !== slug);
    setSelected(next);
    onSelectedChange?.(next);
  }

  return (
    <Field className="gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">{selected.length} / {MAX_SERVER_GAME_MODES}</span>
      </div>
      {[
        { key: "popular", heading: "Más habituales", modes: popularGameModes },
        { key: "niche", heading: "Nicho", modes: nicheGameModes },
      ].map((group) => (
        <fieldset key={group.key} className="grid gap-1.5">
          <legend className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{group.heading}</legend>
          <div className="flex flex-wrap gap-1.5">
            {group.modes.map((mode) => {
              const checked = selected.includes(mode.slug);
              const disabled = full && !checked;
              return (
                <label
                  key={mode.slug}
                  title={mode.description}
                  data-checked={checked}
                  data-disabled={disabled}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 data-[checked=true]:border-primary/40 data-[checked=true]:bg-primary/10 data-[checked=true]:text-primary data-[checked=false]:hover:bg-muted/60 data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45 data-[disabled=true]:hover:bg-transparent"
                >
                  <input
                    type="checkbox"
                    name={name}
                    value={mode.slug}
                    checked={checked}
                    disabled={disabled}
                    onChange={(event) => toggle(mode.slug, event.target.checked)}
                    className="sr-only"
                  />
                  {checked ? <Check aria-hidden="true" className="size-3" /> : null}
                  {mode.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <FieldDescription>Elige hasta {MAX_SERVER_GAME_MODES}. Son los modos por los que los jugadores filtran el catálogo.</FieldDescription>
    </Field>
  );
}
