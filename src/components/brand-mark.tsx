import { BRAND_MARK_GRID_PATH, BRAND_MARK_TAIL_PATH, BRAND_O_BOX } from "@/lib/brand/mark-path";
import { cn } from "@/lib/utils";

type Tone = "duo" | "mono";

// The grid draws with currentColor and the tail with --primary, which already
// carries a lifted green for dark mode, so one component stays legible on both
// surfaces. `mono` paints the tail in currentColor too, for places that sit on
// the brand green itself (the auth panel), where a green tail would vanish.
function MarkPaths({ tone }: { tone: Tone }) {
  return (
    <>
      <path fill="currentColor" d={BRAND_MARK_GRID_PATH} />
      <path className={tone === "duo" ? "fill-primary" : undefined} fill={tone === "mono" ? "currentColor" : undefined} d={BRAND_MARK_TAIL_PATH} />
    </>
  );
}

/** The isotipo on its own, in a square box. */
export function BrandMark({ size = 28, tone = "duo", className }: { size?: number; tone?: Tone; className?: string }) {
  return (
    <svg viewBox="0 0 128 128" width={size} height={size} fill="none" aria-hidden="true" focusable="false" className={className}>
      <MarkPaths tone={tone} />
    </svg>
  );
}

// Manrope's cap height, as a fraction of the font size. The grid's top and
// bottom are pinned to the cap height and the baseline, so the mark sits in the
// line exactly where a capital O would; the tail hangs below like a descender.
const CAP_HEIGHT_EM = 0.72;
const unit = CAP_HEIGHT_EM / BRAND_O_BOX.gridHeight;
const oStyle = {
  width: `${BRAND_O_BOX.width * unit}em`,
  height: `${BRAND_O_BOX.height * unit}em`,
  verticalAlign: `${-(BRAND_O_BOX.height - BRAND_O_BOX.gridHeight) * unit}em`,
  marginRight: "0.045em",
} as const;

/**
 * The logo: "OpinaCraft" with the crafting-grid mark standing in for the "O".
 * Size and weight come from the surrounding text, so it is set like any other
 * line of type. The "O" is kept as screen-reader text, so the accessible name is
 * still "OpinaCraft".
 */
export function BrandWordmark({ tone = "duo", className }: { tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-block whitespace-nowrap leading-none", className)}>
      <svg
        viewBox={`${BRAND_O_BOX.x} ${BRAND_O_BOX.y} ${BRAND_O_BOX.width} ${BRAND_O_BOX.height}`}
        fill="none"
        aria-hidden="true"
        focusable="false"
        className="inline-block"
        style={oStyle}
      >
        <MarkPaths tone={tone} />
      </svg>
      <span className="sr-only">O</span>
      pinaCraft
    </span>
  );
}
