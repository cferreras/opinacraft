// Generates every OpinaCraft brand asset from one piece of geometry: a chamfered
// speech bubble with a five-pointed star knocked out of it. Everything downstream
// -- the SVG files, the raster fallbacks, the favicon and the path constant the
// React component draws -- comes from here, so the shapes cannot drift apart.
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
// Everything sits in a 128x128 box. The body is an octagon (x 12..116, y 6..102,
// 16-unit chamfers) with a wedge tail fused into its bottom edge: vertical left
// side, 45-degree right side, and a 4-unit flat foot so no needle point survives
// rasterisation at favicon sizes.
const BODY = "M28 6L100 6L116 22L116 86L100 102L52 102L32 122L28 122L28 102L12 86L12 22Z";

// The star is a true pentagram -- centre (64, 55), outer radius 38, inner radius
// 0.45 of that -- with each of the five tips sliced off 6 units short by a line
// perpendicular to the point's own axis. Slicing on the axis is what makes all
// five terminals identical; drawing them by hand is what made earlier drafts
// lopsided.
const CENTRE = { x: 64, y: 55 };
const OUTER = 38;
const INNER = OUTER * 0.45;
const TIP_CUT = 6;

const radians = (deg) => (deg * Math.PI) / 180;
const polar = (deg, radius) => ({
  x: CENTRE.x + radius * Math.cos(radians(deg)),
  y: CENTRE.y + radius * Math.sin(radians(deg)),
});

// Where the edge running inner -> outer crosses the tip's cut line.
function tipCorner(innerDeg, outerDeg) {
  const from = polar(innerDeg, INNER);
  const to = polar(outerDeg, OUTER);
  const axis = { x: Math.cos(radians(outerDeg)), y: Math.sin(radians(outerDeg)) };
  const reach = (from.x - CENTRE.x) * axis.x + (from.y - CENTRE.y) * axis.y;
  const t = (OUTER - TIP_CUT - reach) / (OUTER - reach);
  return { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) };
}

const pointAngle = (k) => -90 + 72 * k;
const valleyAngle = (k) => -54 + 72 * k;
const tip = (k) => [tipCorner(valleyAngle(k - 1), pointAngle(k)), tipCorner(valleyAngle(k), pointAngle(k))];

// Only the top point and the right flank are computed; the left flank is their
// reflection, so symmetry about x = 64 is exact rather than merely rounded.
const flip = (p) => ({ x: 2 * CENTRE.x - p.x, y: p.y });
const [topLeft, topRight] = tip(0);
const [armStart, armEnd] = tip(1);
const [legStart, legEnd] = tip(2);

const STAR_POINTS = [
  topLeft, topRight, polar(valleyAngle(0), INNER),
  armStart, armEnd, polar(valleyAngle(1), INNER),
  legStart, legEnd, polar(valleyAngle(2), INNER),
  flip(legEnd), flip(legStart), flip(polar(valleyAngle(1), INNER)),
  flip(armEnd), flip(armStart), flip(polar(valleyAngle(0), INNER)),
  flip(topRight),
];

const round = (v) => String(Number((Math.round(v * 100) / 100).toFixed(2)));
const STAR = STAR_POINTS.map((p, i) => `${i ? "L" : "M"}${round(p.x)} ${round(p.y)}`).join("") + "Z";

// evenodd is what turns the star into a hole rather than a second shape.
const MARK_PATH = `${BODY}${STAR}`;

// --- svg ---------------------------------------------------------------------
const markSvg = (fill, desc) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none" role="img" aria-labelledby="markTitle markDesc">
  <title id="markTitle">OpinaCraft</title>
  <desc id="markDesc">${desc}</desc>
  <path fill="${fill}" fill-rule="evenodd" clip-rule="evenodd" d="${MARK_PATH}" />
</svg>
`;

writeFileSync("public/brand/opinacraft-mark.svg", markSvg(GREEN, "Marca de OpinaCraft: burbuja de opinión con una estrella recortada."));
writeFileSync("public/brand/opinacraft-mark-mono.svg", markSvg("currentColor", "Marca de OpinaCraft a una tinta; hereda el color del texto."));

// The wordmark is measured, not guessed: Manrope 800 at 76px with -2.6 tracking
// runs 388.8 units wide from x=156. Baseline 82 puts the cap-height centre on the
// body's centre (y=54) -- the tail hangs below like a descender and is left out of
// that alignment on purpose.
writeFileSync("public/brand/opinacraft-lockup.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 128" fill="none" role="img" aria-labelledby="lockupTitle">
  <title id="lockupTitle">OpinaCraft</title>
  <!-- Convert the wordmark to outlines before using this file anywhere Manrope
       is not loaded; inside the app the webfont is already present. -->
  <path fill="${GREEN}" fill-rule="evenodd" clip-rule="evenodd" d="${MARK_PATH}" />
  <text x="156" y="82" fill="${INK}" font-family="Manrope, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="76" font-weight="800" letter-spacing="-2.6">OpinaCraft</text>
</svg>
`);

// The React component draws from this constant so a geometry change here reaches
// the header and footer without anyone re-typing a path.
writeFileSync("src/lib/brand/mark-path.ts", `// Generated by scripts/generate-brand-mark.mjs. Do not edit by hand.
export const BRAND_MARK_PATH =
  "${MARK_PATH}";
`);

// --- raster ------------------------------------------------------------------
// Rasterise from a large SVG and scale down: librsvg renders at the declared
// size, so asking for 1024 and reducing gives far cleaner edges than rendering
// straight to 16 pixels.
const source = Buffer.from(markSvg(GREEN, "OpinaCraft").replace("<svg ", '<svg width="1024" height="1024" '));

const webp = await sharp(source).resize(256, 256).webp({ lossless: true }).toBuffer();
writeFileSync("public/brand/opinacraft-mark.webp", webp);

// iOS ignores transparency on home-screen icons and composites onto white, so
// this one ships as a white mark on the brand green with its own padding.
writeFileSync("public/brand/opinacraft-apple-touch-icon.png", await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
     <rect width="180" height="180" fill="${GREEN}" />
     <g transform="translate(26 26) scale(1)">
       <svg width="128" height="128" viewBox="0 0 128 128"><path fill="#ffffff" fill-rule="evenodd" clip-rule="evenodd" d="${MARK_PATH}" /></svg>
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

console.log(`brand mark rebuilt: green ${GREEN}, star ${round(Math.min(...STAR_POINTS.map((p) => p.x)))}..${round(Math.max(...STAR_POINTS.map((p) => p.x)))} wide`);
