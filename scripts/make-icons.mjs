// Renders the Mars Technical icons (public/icons/*.png and public/favicon.ico)
// from the same geometry as components/mars-mark.tsx (the brand board's
// "Tilted Twins"). Run: node scripts/make-icons.mjs
// Small sizes use the board's simplified mark (one orbit, Phobos dropped).
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";

const INDIGO = "#323490";
const LIME = "#BED631";

const tiers = {
  lg: { o: [43, 13.5, 3], i: [29, 9, 3.5], pk: 19, pb: 15, m1: [76, 41.27, 10, 6.8], m2: [11.43, 62.89, 7, 4.2], s: 0.82 },
  md: { o: [43, 13.5, 4.5], i: [29, 9, 5], pk: 20, pb: 15, m1: [76, 41.27, 11, 8], m2: [11.43, 62.89, 8, 5], s: 0.82 },
  sm: { o: [40, 13, 6.5], i: null, pk: 21, pb: 16, m1: [83, 36, 13, 9.5], m2: null, s: 0.84 },
  xs: { o: [40, 13, 9], i: null, pk: 22, pb: 17, m1: [83, 36, 15, 11], m2: null, s: 0.86 },
};
const tierFor = (px) => (px >= 80 ? "lg" : px >= 44 ? "md" : px >= 24 ? "sm" : "xs");

// scale < 1 shrinks the mark inside the tile (maskable icons need a safe zone).
const svg = (px, safe = 1) => {
  const t = tiers[tierFor(px)];
  const arc = (r) => `<path d="M${50 - r[0]} 50 A${r[0]} ${r[1]} 0 0 0 ${50 + r[0]} 50" fill="none" stroke="#fff" stroke-width="${r[2]}"/>`;
  const ell = (r) => `<ellipse cx="50" cy="50" rx="${r[0]}" ry="${r[1]}" transform="rotate(-25 50 50)" fill="none" stroke="#fff" stroke-width="${r[2]}"/>`;
  const moon = (m, body) => `<circle cx="${m[0]}" cy="${m[1]}" r="${m[2]}" fill="${INDIGO}"/><circle cx="${m[0]}" cy="${m[1]}" r="${m[3]}" fill="${body}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
<rect width="100" height="100" fill="${INDIGO}"/>
<g transform="translate(50 50) scale(${t.s * safe}) translate(-50 -50)">
${ell(t.o)}${t.i ? ell(t.i) : ""}
<circle cx="50" cy="50" r="${t.pk}" fill="${INDIGO}"/><circle cx="50" cy="50" r="${t.pb}" fill="#fff"/>
<g transform="rotate(-25 50 50)">${arc(t.o)}${t.i ? arc(t.i) : ""}</g>
${moon(t.m1, LIME)}${t.m2 ? moon(t.m2, "#fff") : ""}
</g></svg>`;
};

const jobs = [
  ["public/icons/icon-192.png", 192, 1],
  ["public/icons/icon-512.png", 512, 1],
  ["public/icons/icon-maskable-512.png", 512, 0.72],
];
const icoSizes = [16, 32, 48];

const browser = await chromium.launch();
const render = async (size, safe) => {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0">${svg(size, safe)}</body>`);
  const buf = await page.screenshot({ type: "png" });
  await page.close();
  return buf;
};

for (const [path, size, safe] of jobs) writeFileSync(path, await render(size, safe));

// ICO container holding PNG images.
const pngs = [];
for (const s of icoSizes) pngs.push(await render(s, 1));
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
writeFileSync("public/favicon.ico", Buffer.concat([head, ...dir, ...pngs]));
await browser.close();
