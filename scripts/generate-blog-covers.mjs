// Generates the blog cover art: flat isometric block scenes, one hue per category.
// Emits sRGB hex because the SVG rasterizer does not understand oklch().
import { mkdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";

// Cover art is committed under public/blog: it changes only when a post is added.
const out = process.argv[2] ?? "public/blog";
mkdirSync(out, { recursive: true });

// --- oklch -> sRGB hex -------------------------------------------------------
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

// --- isometric geometry ------------------------------------------------------
const W = 960, H = 540;
const TW = 54;        // tile half-width
const TH = 27;        // tile half-height
const BLOCK = 34;     // extrusion per stacked block

function column({ col, row, height, originX, originY, faces, edge, bounds }) {
  const sx = originX + (col - row) * TW;
  const ground = originY + (col + row) * TH;
  const top = ground - height * BLOCK;
  const e = height * BLOCK;
  const topFace = `${sx},${top - TH} ${sx + TW},${top} ${sx},${top + TH} ${sx - TW},${top}`;
  const leftFace = `${sx - TW},${top} ${sx},${top + TH} ${sx},${top + TH + e} ${sx - TW},${top + e}`;
  const rightFace = `${sx},${top + TH} ${sx + TW},${top} ${sx + TW},${top + e} ${sx},${top + TH + e}`;
  bounds.push([sx - TW, top - TH], [sx + TW, top + TH + e]);
  // Every face is stroked: without an edge, columns of the same height fuse into one mass.
  const paint = ` stroke="${edge}" stroke-width="2" stroke-linejoin="round"`;
  return [
    `<polygon points="${leftFace}" fill="${faces.left}"${paint}/>`,
    `<polygon points="${rightFace}" fill="${faces.right}"${paint}/>`,
    `<polygon points="${topFace}" fill="${faces.top}"${paint}/>`,
  ].join("");
}

// Painter's order: far tiles (small col+row) first.
function scene(cells, originX, originY, palette, bounds) {
  return [...cells]
    .sort((a, b) => (a.col + a.row) - (b.col + b.row))
    .map((cell) => column({ ...cell, originX, originY, faces: cell.accent ? palette.accent : palette.block, edge: palette.edge, bounds }))
    .join("");
}

function palette(hue) {
  return {
    bgFrom: oklch(0.32, 0.07, hue),
    bgTo: oklch(0.17, 0.04, hue),
    grid: oklch(0.55, 0.08, hue),
    block: { top: oklch(0.7, 0.12, hue), left: oklch(0.46, 0.11, hue), right: oklch(0.34, 0.08, hue) },
    accent: { top: oklch(0.88, 0.14, hue), left: oklch(0.62, 0.15, hue), right: oklch(0.47, 0.12, hue) },
    edge: oklch(0.14, 0.03, hue),
    glow: oklch(0.82, 0.13, hue),
  };
}

// Faint ground lattice so the scene sits in a space instead of floating.
function lattice(originX, originY, cols, rows, color) {
  const lines = [];
  for (let c = 0; c <= cols; c += 1) {
    const x1 = originX + c * TW, y1 = originY + c * TH;
    const x2 = originX + (c - rows) * TW, y2 = originY + (c + rows) * TH;
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`);
  }
  for (let r = 0; r <= rows; r += 1) {
    const x1 = originX - r * TW, y1 = originY + r * TH;
    const x2 = originX + (cols - r) * TW, y2 = originY + (cols + r) * TH;
    lines.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1"/>`);
  }
  return `<g opacity="0.16">${lines.join("")}</g>`;
}

function svg({ hue, cells, originX = 480, originY = 250, lat = [6, 6] }) {
  const p = palette(hue);
  const bounds = [];
  const blocks = scene(cells, originX, originY, p, bounds);
  // Fit the composition to a constant optical area so the four covers sit as a set.
  const xs = bounds.map((point) => point[0]);
  const ys = bounds.map((point) => point[1]);
  const bw = Math.max(...xs) - Math.min(...xs);
  const bh = Math.max(...ys) - Math.min(...ys);
  const scale = Math.min((W * 0.52) / bw, (H * 0.62) / bh);
  const dx = W / 2 - scale * (Math.min(...xs) + bw / 2);
  const dy = H * 0.54 - scale * (Math.min(...ys) + bh / 2);
  const shadowY = Math.max(...ys);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${p.bgFrom}"/><stop offset="1" stop-color="${p.bgTo}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.3" cy="0.16" r="0.8">
      <stop offset="0" stop-color="${p.glow}" stop-opacity="0.34"/>
      <stop offset="1" stop-color="${p.glow}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="shadow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${p.bgTo}" stop-opacity="0.75"/>
      <stop offset="1" stop-color="${p.bgTo}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <g transform="translate(${dx.toFixed(2)} ${dy.toFixed(2)}) scale(${scale.toFixed(4)})">
    ${lattice(originX, originY - 24, lat[0], lat[1], p.grid)}
    <ellipse cx="${originX}" cy="${shadowY + 18}" rx="${bw * 0.62}" ry="${bh * 0.16}" fill="url(#shadow)"/>
    ${blocks}
  </g>
</svg>`;
}

// One composition per article, each saying something about its subject.
const covers = {
  // Guías — three plinths of different heights: the choice, with one picked.
  "portada-elegir-servidor.png": svg({
    hue: 160,
    originX: 480,
    originY: 300,
    cells: [
      { col: 0, row: 2, height: 2 }, { col: 1, row: 2, height: 2 },
      { col: 2, row: 1, height: 4, accent: true }, { col: 2, row: 2, height: 4, accent: true },
      { col: 3, row: 1, height: 1 }, { col: 3, row: 2, height: 1 },
      { col: 1, row: 1, height: 2 }, { col: 0, row: 1, height: 1 },
    ],
  }),
  // Comparativas — two equal masses, mirrored across a seam.
  "portada-java-o-bedrock.png": svg({
    hue: 230,
    originX: 480,
    originY: 290,
    cells: [
      { col: 0, row: 3, height: 3 }, { col: 1, row: 3, height: 3 }, { col: 0, row: 2, height: 3 },
      { col: 3, row: 0, height: 3, accent: true }, { col: 3, row: 1, height: 3, accent: true }, { col: 2, row: 0, height: 3, accent: true },
      { col: 1, row: 2, height: 1 }, { col: 2, row: 1, height: 1 },
    ],
  }),
  // Rendimiento — a latency profile: steady columns and one spike.
  "portada-ping-y-latencia.png": svg({
    hue: 80,
    originX: 470,
    originY: 300,
    lat: [7, 3],
    cells: [
      { col: 0, row: 1, height: 1 }, { col: 1, row: 1, height: 2 }, { col: 2, row: 1, height: 1 },
      { col: 3, row: 1, height: 5, accent: true },
      { col: 4, row: 1, height: 2 }, { col: 5, row: 1, height: 1 }, { col: 6, row: 1, height: 2 },
    ],
  }),
  // Para admins — a base that grows: a rising arc of blocks over a plinth.
  "portada-primeras-resenas.png": svg({
    hue: 300,
    originX: 470,
    originY: 300,
    lat: [6, 4],
    cells: [
      { col: 0, row: 3, height: 1 }, { col: 1, row: 3, height: 1 }, { col: 2, row: 3, height: 1 }, { col: 3, row: 3, height: 1 },
      { col: 1, row: 2, height: 2 }, { col: 2, row: 2, height: 3 },
      { col: 3, row: 1, height: 4, accent: true }, { col: 4, row: 1, height: 5, accent: true },
    ],
  }),
};

for (const [name, source] of Object.entries(covers)) {
  const png = await sharp(Buffer.from(source)).png({ palette: true, colors: 160, dither: 0, effort: 10 }).toBuffer();
  writeFileSync(`${out}/${name}`, png);
  console.log(name, (png.length / 1024).toFixed(1) + " KB");
}
