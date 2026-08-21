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
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml",
  ".png": "image/png", ".woff2": "font/woff2", ".md": "text/markdown; charset=utf-8", ".xml": "application/xml; charset=utf-8"
};
const activePaths = ["index.html", "dragon-analytics.html", "labs/monthly-ad-report.html"];
const retiredPaths = ["404.html", "writing.html", "ibex.html", "firstservice.html", "tamboran.html", "rex.html", "nordic-american-tankers.html", "labs/marketing-allocation.html", "labs/churn-risk.html"];
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
      response.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      response.end(await readFile(join(root, "404.html")));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, executablePath: process.env.SITE_TEST_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" });
});

after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openCheckedPage(context, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  await page.goto(`${baseUrl}/${path}`, { waitUntil: "networkidle" });
  return { page, errors };
}

test("Spendy exposes one machine-learning ad-spend service and retires legacy routes", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const path of activePaths) {
    const { page } = await openCheckedPage(context, path);
    const mainText = await page.locator("main").innerText();
    assert.match(mainText, /Spendy/i, `${path} must identify the business`);
    assert.match(mainText, /machine-learning/i, `${path} must explain the service`);
    assert.match(mainText, /budget/i, `${path} must explain the spend decision`);
    assert.doesNotMatch(mainText, /Maxell|Dragon Analytics|equity research|company research|churn/i, `${path} exposes a retired surface`);
    assert.equal(await page.locator("nav[aria-label='Primary navigation']").getByText("Research", { exact: true }).count(), 0);
    await page.close();
  }
  for (const path of retiredPaths) {
    const { page } = await openCheckedPage(context, path);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,follow");
    assert.match(await page.locator("main").innerText(), /This route is no longer published/i);
    assert.ok(await page.getByRole("link", { name: /How it works/i }).count() >= 1);
    assert.ok(await page.getByRole("link", { name: /View sample report/i }).count() >= 1);
    await page.close();
  }
  await context.close();
});

test("service pages are clear and actionable in the opening viewport", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    const { page } = await openCheckedPage(context, "index.html");
    const hero = page.locator(".signal-hero");
    assert.match(await hero.innerText(), /machine-learning ad spend forecasts/i);
    assert.match(await hero.innerText(), /fixed ad budget/i);
    const primaryAction = hero.getByRole("link", { name: "Inspect the sample" });
    assert.equal(await primaryAction.isVisible(), true);
    const box = await primaryAction.boundingBox();
    assert.ok(box.y + box.height <= viewport.height, `Primary action falls below ${viewport.width}×${viewport.height}`);
    await context.close();
  }
});

test("all public routes avoid horizontal overflow and browser errors", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    for (const path of [...activePaths, ...retiredPaths]) {
      const { page, errors } = await openCheckedPage(context, path);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${path} overflows at ${viewport.width}px: ${JSON.stringify(dimensions)}`);
      assert.deepEqual(errors, [], `${path} emitted browser errors at ${viewport.width}px`);
      await page.close();
    }
    await context.close();
  }
});

test("the checked sample report renders exact allocation and fails closed when bytes change", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page } = await openCheckedPage(context, "labs/monthly-ad-report.html");
  await page.waitForFunction(() => document.querySelector("[data-ad-report]")?.dataset.state === "ready");
  assert.equal(await page.locator("[data-report-rows] tr").count(), 12);
  assert.equal(await page.locator("[data-report-value='supplied-budget']").innerText(), "$125,000.00");
  assert.equal(await page.locator("[data-report-value='recommended-total']").innerText(), "$125,000.00");
  assert.equal(await page.locator("[data-report-value='budget-difference']").innerText(), "$0.00");
  assert.deepEqual(await page.locator("[data-budget-view]").allInnerTexts(), ["Current", "Recommended", "Compare"]);
  await context.close();

  const failedContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const failed = await failedContext.newPage();
  await failed.route("**/monthly-ad-report.json", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schema: "ad-report-evidence/v2" }) }));
  await failed.goto(`${baseUrl}/labs/monthly-ad-report.html`, { waitUntil: "networkidle" });
  await failed.getByRole("heading", { name: "Evidence unavailable" }).waitFor();
  assert.equal(await failed.locator("[data-report-content]:visible").count(), 0);
  assert.equal(await failed.locator("[data-report-recommendation]:visible").count(), 0);
  await failedContext.close();
});

test("the homepage preview stays evidence-bound and also fails closed", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page } = await openCheckedPage(context, "index.html");
  const report = page.locator("#proof [data-ad-report]");
  await report.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector("#proof [data-ad-report]")?.dataset.state === "ready");
  assert.equal(await report.locator("[data-report-rows] tr").count(), 12);
  assert.equal(await report.locator("[data-report-value='recommended-total']").innerText(), "$125,000.00");
  await context.close();

  const failedContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const failed = await failedContext.newPage();
  await failed.route("**/labs/data/monthly-ad-report.json", (route) => route.abort());
  await failed.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await failed.locator("#proof [data-ad-report]").scrollIntoViewIfNeeded();
  await failed.getByRole("heading", { name: "Evidence unavailable" }).waitFor();
  assert.equal(await failed.locator("[data-report-value='recommended-total']:visible").count(), 0);
  await failedContext.close();
});

test("mobile navigation, FAQ, copy feedback, and no-JavaScript content remain usable", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["clipboard-read", "clipboard-write"] });
  const { page } = await openCheckedPage(context, "dragon-analytics.html");
  const toggle = page.locator(".nav-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  const summary = page.locator("details[data-disclosure] summary").first();
  await summary.click();
  await page.waitForFunction(() => document.querySelector("details[data-disclosure] summary")?.getAttribute("aria-expanded") === "true");
  assert.equal(await summary.getAttribute("aria-expanded"), "true");
  await page.locator("[data-copy-email]").click();
  await page.waitForFunction(() => document.querySelector(".copy-status")?.textContent.trim().length > 0);
  assert.match(await page.locator(".copy-status").innerText(), /copied|select the email/i);
  await context.close();

  const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  for (const path of ["index.html", "labs/monthly-ad-report.html", "writing.html"]) {
    const pageWithoutJs = await noJs.newPage();
    await pageWithoutJs.goto(`${baseUrl}/${path}`, { waitUntil: "load" });
    assert.equal(await pageWithoutJs.locator("h1").isVisible(), true);
    assert.equal(await pageWithoutJs.getByRole("link").first().isVisible(), true);
    await pageWithoutJs.close();
  }
  await noJs.close();
});

test("the active experience has no automated WCAG 2.2 AA violations", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const path of [...activePaths, "404.html"]) {
    const { page } = await openCheckedPage(context, path);
    if (path === "labs/monthly-ad-report.html") await page.waitForFunction(() => document.querySelector("[data-ad-report]")?.dataset.state === "ready");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    assert.deepEqual(results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) })), [], `${path} has accessibility violations`);
    await page.close();
  }
  await context.close();
});

test("initial homepage transfer stays below 500 KB", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  let bytes = 0;
  const bodyReads = [];
  page.on("response", (response) => {
    if (!response.url().startsWith(baseUrl)) return;
    bodyReads.push(response.body().then((body) => { bytes += body.byteLength; }).catch(() => {}));
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await Promise.all(bodyReads);
  assert.ok(bytes < 500 * 1024, `Homepage transferred ${bytes} bytes locally`);
  await context.close();
});
