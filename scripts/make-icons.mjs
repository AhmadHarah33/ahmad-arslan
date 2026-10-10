// Renders the Orbito icons (public/icons/*.png and app/favicon.ico) from the
// same geometry as components/orbito-mark.tsx. Run: node scripts/make-icons.mjs
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const BLACK = "#141414";
const AMBER = "#FF9F1C";

// scale < 1 shrinks the mark inside the tile (maskable icons need a safe zone).
const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
<rect width="100" height="100" fill="${BLACK}"/>
<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
<circle cx="50" cy="50" r="36" fill="none" stroke="#fff" stroke-opacity="0.18" stroke-width="19"/>
<path d="M50 14 A36 36 0 1 1 18.82 32" fill="none" stroke="#fff" stroke-width="19" stroke-linecap="round"/>
<circle cx="18.82" cy="32" r="12" fill="${AMBER}"/></g></svg>`;

const jobs = [
  ["public/icons/icon-192.png", 192, 0.78],
  ["public/icons/icon-512.png", 512, 0.78],
  ["public/icons/icon-maskable-512.png", 512, 0.6],
];
const icoSizes = [16, 32, 48];

const browser = await chromium.launch();
const render = async (size, scale) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg(scale)}</body>`);
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
};

for (const [path, size, scale] of jobs) writeFileSync(path, await render(size, scale));

// ICO container holding PNG images.
const pngs = [];
for (const s of icoSizes) pngs.push(await render(s, 0.82));
const head = Buffer.alloc(6);
head.writeUInt16LE(1, 2);
head.writeUInt16LE(pngs.length, 4);
let offset = 6 + 16 * pngs.length;
const dir = pngs.map((png, i) => {
  const e = Buffer.alloc(16);
  e[0] = icoSizes[i];
  e[1] = icoSizes[i];
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(png.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += png.length;
  return e;
});
writeFileSync("app/favicon.ico", Buffer.concat([head, ...dir, ...pngs]));
await browser.close();
