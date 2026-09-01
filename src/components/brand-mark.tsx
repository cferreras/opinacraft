import { BRAND_MARK_PATH } from "@/lib/brand/mark-path";

// The mark draws with currentColor rather than shipping one raster per theme:
// --primary already carries a lifted green for dark mode, so `text-primary` is
// enough to keep the logo legible on both surfaces, and the auth panel can flip
// it to the foreground colour without a second file.
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path fill="currentColor" fillRule="evenodd" clipRule="evenodd" d={BRAND_MARK_PATH} />
    </svg>
  );
}
