import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const cards = JSON.parse(await readFile(new URL("./social-cards.json", import.meta.url), "utf8"));
const contentTypes = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".webp": "image/webp", ".woff2": "font/woff2" };

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const path = join(root, relative || "index.html");
    const payload = await readFile(path);
    response.writeHead(200, { "Content-Type": contentTypes[extname(path)] || "application/octet-stream" });
    response.end(payload);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SOCIAL_CARD_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const outputDirectory = join(root, "assets", "social");
await mkdir(outputDirectory, { recursive: true });

try {
  for (const card of cards) {
    const query = new URLSearchParams(Object.entries(card).filter(([key]) => key !== "output").map(([key, value]) => [key, String(value)]));
    await page.goto(`http://127.0.0.1:${port}/tools/social-card.html?${query}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator(".social-card").screenshot({ path: join(outputDirectory, card.output), type: "png" });
    console.log(`Generated assets/social/${card.output}`);
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
