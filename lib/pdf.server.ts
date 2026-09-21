import type { Browser } from "playwright-core";

// A4 at 96dpi. deviceScaleFactor 2 renders at double resolution so text and
// the QR code stay crisp once printed to PDF.
const PAGE_WIDTH = 794;
const PAGE_HEIGHT = 1123;

// Cached on globalThis rather than a module-level `let`: Next.js splits
// server code into separate bundles (route handlers vs. server components),
// and each bundle would otherwise get its own browser process, launching
// Chromium — a real ~1s cost — on every request instead of once.
declare global {
  // eslint-disable-next-line no-var
  var __pdfBrowser: Promise<Browser> | undefined;
}

async function getBrowser(): Promise<Browser> {
  if (!globalThis.__pdfBrowser) {
    const { chromium } = await import("playwright-core");
    globalThis.__pdfBrowser = chromium.launch({ headless: true }).catch((err) => {
      // A dead launch promise would otherwise poison every request after it —
      // clear it so the next request tries again instead of inheriting the
      // same rejection forever.
      globalThis.__pdfBrowser = undefined;
      throw err;
    });
  }
  return globalThis.__pdfBrowser;
}

// Renders `url` (a page in this app) to a PDF buffer. `cookieHeader` forwards
// the caller's session cookies, since the headless browser has none of its
// own and the print route requires being signed in.
export async function renderPdf(url: string, cookieHeader: string | undefined): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: PAGE_WIDTH, height: PAGE_HEIGHT },
    deviceScaleFactor: 2,
  });
  try {
    if (cookieHeader) {
      const target = new URL(url);
      const cookies = cookieHeader.split(";").map((pair) => {
        const idx = pair.indexOf("=");
        return {
          name: pair.slice(0, idx).trim(),
          value: pair.slice(idx + 1).trim(),
          domain: target.hostname,
          path: "/",
        };
      });
      await context.addCookies(cookies);
    }

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    // networkidle doesn't guarantee a webfont has actually finished loading —
    // without this a page rendered just after networkidle can bake in the
    // fallback font instead of the one that arrives a moment later.
    await page.evaluate(() => (document as any).fonts?.ready);

    return await page.pdf({
      printBackground: true,
      margin: { top: "16mm", bottom: "16mm", left: "14mm", right: "14mm" },
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate:
        '<div style="width:100%;font-size:9px;color:#888;text-align:center;">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',
    });
  } finally {
    await context.close();
  }
}
