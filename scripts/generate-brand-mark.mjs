// Generates every OpinaCraft brand asset from one piece of geometry: a 3x3
// crafting grid with its centre slot empty, so it reads as the "O" of OpinaCraft,
// and its bottom-left slot pulled into a speech-bubble corner. Everything
// downstream -- the SVG files, the raster fallbacks, the favicon and the path
// constants the React components draw -- comes from here, so the shapes cannot
// drift apart.
//
// Run with: node scripts/generate-brand-mark.mjs
import { writeFileSync } from "node:fs";
import sharp from "sharp";

// --- oklch -> sRGB hex -------------------------------------------------------
// The design tokens live in oklch(); SVG rasterizers only understand sRGB.
function oklch(L, C, H) {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const rgb = [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + rgb.map((v) => {
    const s8 = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, s8)) * 255).toString(16).padStart(2, "0");
  }).join("");
}

const GREEN = oklch(0.54, 0.16, 160); // --primary
const INK = oklch(0.145, 0.01, 160);  // --foreground

// --- geometry ----------------------------------------------------------------
// Everything sits in a 128x128 box. Nine 28-unit slots with 6-unit gaps make a
// 96-unit square (x 19..115, y 9..105); the gaps are wide enough to stay open at
// header sizes, where a narrower gutter smeared the grid into a plain ring. The
// centre slot is left out -- that hole is the "O".
const SLOT = 28;
const GAP = 6;
const RADIUS = 4;
const ORIGIN = { x: 19, y: 9 };
const RING_SIZE = 3 * SLOT + 2 * GAP;

const slotAt = (column, row) => ({ x: ORIGIN.x + column * (SLOT + GAP), y: ORIGIN.y + row * (SLOT + GAP) });
const roundedSlot = ({ x, y }) => {
  const r = RADIUS, s = SLOT;
  return `M${x + r} ${y}H${x + s - r}Q${x + s} ${y} ${x + s} ${y + r}V${y + s - r}Q${x + s} ${y + s} ${x + s - r} ${y + s}H${x + r}Q${x} ${y + s} ${x} ${y + s - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
};

// The eight slots round the edge, bar the bottom-left one, which is the tail.
const RING_SLOTS = [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [1, 2], [2, 2]].map(([c, r]) => slotAt(c, r));
const RING_PATH = RING_SLOTS.map(roundedSlot).join("");

// The bottom-left slot keeps three rounded corners; its fourth runs out into a
// speech-bubble point aimed down and to the left. Aiming it outwards rather than
// straight down is deliberate: a slot hanging under the baseline made the "O" read
// as a "p". The 4-unit flat foot keeps a needle point from vanishing at favicon
// sizes, and the 13-unit drop stays within a descender's reach.
const tailSlot = slotAt(0, 2);
const TAIL_PATH = (() => {
  const { x, y } = tailSlot, r = RADIUS, s = SLOT;
  return `M${x + r} ${y}H${x + s - r}Q${x + s} ${y} ${x + s} ${y + r}V${y + s - r}Q${x + s} ${y + s} ${x + s - r} ${y + s}H${x + 11}L${x - 2} ${y + s + 13}L${x - 6} ${y + s + 13}L${x} ${y + s - 16}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
})();

// One path for single-colour uses (Open Graph cards, the mono SVG).
const MARK_PATH = `${RING_PATH}${TAIL_PATH}`;

// The tight box round the drawn shapes, used when the mark stands in for the
// "O" of the wordmark. Its top edge is the ring's top, and the ring's bottom sits
// RING_SIZE below it, so CSS can line those up with the cap height and baseline.
const O_BOX = { x: ORIGIN.x - 6, y: ORIGIN.y, width: RING_SIZE + 6, height: RING_SIZE + 13 };

const round = (v) => String(Number((Math.round(v * 100) / 100).toFixed(2)));

// --- svg ---------------------------------------------------------------------
// The two-tone mark: the grid in ink, the tail in brand green. As a browser-tab
// icon it follows the tab's colour scheme so the ink grid never disappears on a
// dark tab bar.
const duoSvg = (desc) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" role="img" aria-labelledby="markTitle markDesc">
  <title id="markTitle">OpinaCraft</title>
  <desc id="markDesc">${desc}</desc>
  <style>.grid{fill:${INK}}@media (prefers-color-scheme:dark){.grid{fill:#ffffff}}</style>
  <path class="grid" d="${RING_PATH}" />
  <path fill="${GREEN}" d="${TAIL_PATH}" />
</svg>
`;

const markSvg = (fill, desc) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" role="img" aria-labelledby="markTitle markDesc">
  <title id="markTitle">OpinaCraft</title>
  <desc id="markDesc">${desc}</desc>
  <path fill="${fill}" d="${MARK_PATH}" />
</svg>
`;

writeFileSync("public/brand/opinacraft-mark.svg", duoSvg("Marca de OpinaCraft: rejilla de crafteo 3×3 que forma la O, con la esquina de un bocadillo."));
writeFileSync("public/brand/opinacraft-mark-mono.svg", markSvg("currentColor", "Marca de OpinaCraft a una tinta; hereda el color del texto."));

// The lockup sets the mark as the "O" of the wordmark. Manrope's cap height is
// 0.72 em, so at 96px the ring (RING_SIZE units) is scaled to 69.1px and its
// bottom sits on the baseline at y=100; the tail drops below it like a descender.
const LOCKUP_FONT = 96;
const LOCKUP_BASELINE = 100;
const capHeight = LOCKUP_FONT * 0.72;
const oScale = capHeight / RING_SIZE;
const oWidth = O_BOX.width * oScale;
writeFileSync("public/brand/opinacraft-lockup.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 128" fill="none" role="img" aria-labelledby="lockupTitle">
  <title id="lockupTitle">OpinaCraft</title>
  <!-- Convert the wordmark to outlines before using this file anywhere Manrope
       is not loaded; inside the app the webfont is already present. -->
  <g transform="translate(8 ${round(LOCKUP_BASELINE - capHeight)}) scale(${round(oScale * 1000) / 1000}) translate(${-O_BOX.x} ${-O_BOX.y})">
    <path fill="${INK}" d="${RING_PATH}" />
    <path fill="${GREEN}" d="${TAIL_PATH}" />
  </g>
  <text x="${round(8 + oWidth + 4)}" y="${LOCKUP_BASELINE}" fill="${INK}" font-family="Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="${LOCKUP_FONT}" font-weight="800" letter-spacing="-3">pinaCraft</text>
</svg>
`);

// The React components draw from these constants so a geometry change here
// reaches the header and footer without anyone re-typing a path.
writeFileSync("src/lib/brand/mark-path.ts", `// Generated by scripts/generate-brand-mark.mjs. Do not edit by hand.

/** The whole mark in one path, for single-colour uses. 128x128 box. */
export const BRAND_MARK_PATH =
  "${MARK_PATH}";

/** The seven grid slots that stay in the foreground colour. */
export const BRAND_MARK_GRID_PATH =
  "${RING_PATH}";

/** The bottom-left slot with its speech-bubble point, drawn in brand green. */
export const BRAND_MARK_TAIL_PATH =
  "${TAIL_PATH}";

/**
 * The tight box round the mark when it stands in for the wordmark's "O": its top
 * is the grid's top, and the grid's bottom sits \`gridHeight\` units lower.
 */
export const BRAND_O_BOX = { x: ${O_BOX.x}, y: ${O_BOX.y}, width: ${O_BOX.width}, height: ${O_BOX.height}, gridHeight: ${RING_SIZE} } as const;
`);

// --- raster ------------------------------------------------------------------
// Rasterise from a large SVG and scale down: librsvg renders at the declared
// size, so asking for 1024 and reducing gives far cleaner edges than rendering
// straight to 16 pixels.
const source = Buffer.from(markSvg(GREEN, "OpinaCraft").replace("<svg ", '<svg width="1024" height="1024" '));

const webp = await sharp(source).resize(256, 256).webp({ lossless: true }).toBuffer();
writeFileSync("public/brand/opinacraft-mark.webp", webp);

// iOS ignores transparency on home-screen icons and composites onto white, so
// this one ships on the brand green with its own padding: a white grid and an
// ink tail, the same two-tone split as the header.
writeFileSync("public/brand/opinacraft-apple-touch-icon.png", await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
     <rect width="180" height="180" fill="${GREEN}" />
     <g transform="translate(26 26) scale(1)">
       <svg width="128" height="128" viewBox="0 0 128 128"><path fill="#ffffff" d="${RING_PATH}" /><path fill="${INK}" d="${TAIL_PATH}" /></svg>
     </g>
   </svg>`,
)).png().toBuffer());

// --- favicon.ico -------------------------------------------------------------
// Entries are resized from the WebP rather than re-rasterised, so the favicon is
// pixel-identical to the brand mark -- which is exactly what tests/branding.test.ts
// asserts.
const SIZES = [16, 32, 48];
const frames = await Promise.all(SIZES.map((size) => sharp(webp).resize(size, size).png().toBuffer()));

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(SIZES.length, 4);

let offset = 6 + SIZES.length * 16;
const directory = SIZES.map((size, index) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt8(0, 2); // palette size
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(frames[index].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += frames[index].length;
  return entry;
});

writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...directory, ...frames]));

console.log(`brand mark rebuilt: green ${GREEN}, ink ${INK}, grid ${RING_SIZE} units square at (${ORIGIN.x}, ${ORIGIN.y})`);
