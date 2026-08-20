import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";


const root = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".md": "text/markdown; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

let server;
let browser;
let baseUrl;


before(async () => {
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    let path = join(root, relative || "index.html");
    try {
      const payload = await readFile(path);
      response.writeHead(200, { "Content-Type": contentTypes[extname(path)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(payload);
    } catch {
      path = join(root, "404.html");
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(path));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.SITE_TEST_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  });
});


after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});


async function openCheckedPage(context, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/${path}`, { waitUntil: "networkidle" });
  return { page, errors };
}


test("representative pages have no horizontal overflow or console errors at required viewports", async () => {
  const viewports = [
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 768, height: 1024 },
    { width: 1280, height: 720 },
    { width: 1440, height: 900 }
  ];
  const paths = ["index.html", "dragon-analytics.html", "writing.html", "labs/marketing-allocation.html", "labs/churn-risk.html", "ibex.html"];
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    for (const path of paths) {
      const { page, errors } = await openCheckedPage(context, path);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${path} overflows at ${viewport.width}px: ${JSON.stringify(dimensions)}`);
      assert.deepEqual(errors, [], `${path} emitted browser errors at ${viewport.width}px`);
      await page.close();
    }
    await context.close();
  }
});


test("the first mobile viewport identifies Maxell, the service, the wordmark, and an action", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page } = await openCheckedPage(context, "index.html");
  await assert.doesNotReject(() => page.locator(".brand span").waitFor({ state: "visible" }));
  assert.match(await page.locator(".hero-copy").innerText(), /Maxell Aguiran/i);
  assert.match(await page.locator(".hero-copy").innerText(), /predictive analytics|Dragon Analytics/i);
  const primary = page.locator('.hero-actions a[href="#evidence"]');
  assert.equal(await primary.isVisible(), true);
  const box = await primary.boundingBox();
  assert.ok(box.y < 844, `Primary action begins below the first mobile viewport at y=${box.y}`);
  await context.close();
});


test("Dragon Analytics is materially shorter and places contact before FAQ", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page } = await openCheckedPage(context, "dragon-analytics.html");
  const measurements = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    contact: document.getElementById("contact").offsetTop,
    faq: document.getElementById("faq").offsetTop
  }));
  assert.ok(measurements.height < 9000, `Mobile page is still too long: ${measurements.height}px`);
  assert.ok(measurements.contact < measurements.faq, "Contact must appear before FAQ");
  assert.ok(measurements.contact < 7500, `Contact appears too late at ${measurements.contact}px`);
  await context.close();
});


test("mobile navigation, FAQ disclosure, copy feedback, and focus treatment are keyboard accessible", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
  const { page } = await openCheckedPage(context, "dragon-analytics.html");
  const toggle = page.locator("[data-nav-toggle]");
  await toggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  assert.equal(await toggle.evaluate((element) => element === document.activeElement), true);
  const focusStyle = await toggle.evaluate((element) => {
    const style = getComputedStyle(element);
    return { outlineStyle: style.outlineStyle, outlineWidth: parseFloat(style.outlineWidth), boxShadow: style.boxShadow };
  });
  assert.equal(focusStyle.outlineStyle, "solid");
  assert.ok(focusStyle.outlineWidth >= 2);
  assert.notEqual(focusStyle.boxShadow, "none");

  const faq = page.locator("details[data-disclosure]").first();
  const summary = faq.locator("summary");
  await summary.click();
  await page.waitForFunction(() => (
    document.querySelector("details[data-disclosure] > summary")?.getAttribute("aria-expanded") === "true"
  ));
  assert.equal(await summary.getAttribute("aria-expanded"), "true");
  await page.locator("[data-copy-email]").click();
  await page.waitForFunction(() => document.getElementById("copy-status-dragon")?.textContent.trim().length > 0);
  assert.match(await page.locator("#copy-status-dragon").innerText(), /copied|select the email/i);
  await context.close();
});


test("lab artifacts render checked metrics, narrated charts, and accessible tables", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  for (const path of ["labs/marketing-allocation.html", "labs/churn-risk.html"]) {
    const { page } = await openCheckedPage(context, path);
    await page.locator(".stat").first().waitFor();
    assert.equal(await page.locator(".stat").count(), 4);
    assert.equal(await page.locator(".evidence-chart").count(), 4);
    assert.equal(await page.locator(".chart-summary").count(), 4);
    assert.equal(await page.locator(".data-table-wrap table").count(), 4);
    for (const chart of await page.locator(".evidence-chart").all()) {
      assert.ok(await chart.locator("svg text").count() >= 3, "Each visual chart needs visible scale or category labels");
    }
    assert.equal(await page.locator(".evidence-unavailable").count(), 0);
    await page.close();
  }
  await context.close();
});


test("failed lab evidence produces a visible fail-closed state", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await page.route("**/labs/data/marketing-allocation.json", (route) => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto(`${baseUrl}/labs/marketing-allocation.html`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Evidence unavailable" }).waitFor();
  assert.equal(await page.locator(".stat").count(), 0);
  await context.close();
});


test("essential content stays usable without JavaScript and with a failed mascot", async () => {
  const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  for (const path of ["index.html", "labs/marketing-allocation.html"]) {
    const page = await noJs.newPage();
    await page.goto(`${baseUrl}/${path}`, { waitUntil: "load" });
    assert.equal(await page.locator("h1").isVisible(), true);
    assert.equal(await page.locator("a.button").first().isVisible(), true);
    if (path.startsWith("labs/")) assert.equal(await page.locator("noscript .evidence-unavailable").isVisible(), true);
    await page.close();
  }
  await noJs.close();

  const failedAsset = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await failedAsset.newPage();
  await page.route("**/assets/dragon-mascot.webp", (route) => route.abort());
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("h1").isVisible(), true);
  assert.equal(await page.locator(".hero-actions .button").first().isVisible(), true);
  await failedAsset.close();
});


test("reduced motion exposes final states without transform or chart animation", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const { page } = await openCheckedPage(context, "labs/marketing-allocation.html");
  await page.locator(".stat").first().waitFor();
  const reveal = page.locator("[data-reveal]").last();
  const styles = await reveal.evaluate((element) => ({ opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform }));
  assert.equal(styles.opacity, "1");
  assert.equal(styles.transform, "none");
  const animation = await page.locator(".chart-line").first().evaluate((element) => getComputedStyle(element).animationName);
  assert.equal(animation, "none");
  await context.close();
});


test("representative pages have no automated WCAG 2.2 AA violations", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const path of ["index.html", "dragon-analytics.html", "ibex.html", "labs/marketing-allocation.html", "labs/churn-risk.html"]) {
    const { page } = await openCheckedPage(context, path);
    if (path.startsWith("labs/")) await page.locator(".stat").first().waitFor();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    assert.deepEqual(results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) })), [], `${path} has accessibility violations`);
    await page.close();
  }
  await context.close();
});


test("initial homepage transfer stays below 500 KB in local representative testing", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  let bytes = 0;
  const bodyReads = [];
  page.on("response", (response) => {
    if (!response.url().startsWith(baseUrl)) return;
    bodyReads.push(response.body()
      .then((body) => { bytes += body.byteLength; })
      .catch(() => { /* navigation responses may already be disposed */ }));
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await Promise.all(bodyReads);
  assert.ok(bytes < 500 * 1024, `Homepage transferred ${bytes} bytes locally`);
  await context.close();
});
