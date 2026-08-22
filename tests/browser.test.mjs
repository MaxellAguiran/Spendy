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
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".md": "text/markdown; charset=utf-8", ".xml": "application/xml; charset=utf-8"
};
const activePaths = ["index.html", "case-study.html", "labs/monthly-ad-report.html"];
const funnelPaths = ["fit-check.html", "fit-check-thanks.html"];
const policyPaths = ["privacy.html", "audit-terms.html"];
const retiredPaths = ["404.html", "dragon-analytics.html", "writing.html", "ibex.html", "firstservice.html", "tamboran.html", "rex.html", "nordic-american-tankers.html", "labs/marketing-allocation.html", "labs/churn-risk.html"];
let server;
let browser;
let baseUrl;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = normalize(pathname).replace(/^(\.\.[/\\])+/, "").replace(/^[/\\]+/, "");
    const path = join(root, relative || "index.html");
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

test("Spendy exposes a fixed-fee ROAS audit and retires the duplicate service route", async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  for (const path of activePaths) {
    const { page } = await openCheckedPage(context, path);
    const mainText = await page.locator("main").innerText();
    assert.match(mainText, /Spendy/i, `${path} must identify the business`);
    assert.match(mainText, /budget/i, `${path} must explain the spend decision`);
    assert.doesNotMatch(mainText, /Maxell|Dragon Analytics|equity research|company research|churn/i, `${path} exposes a retired surface`);
    assert.equal(await page.locator("nav[aria-label='Primary navigation']").getByRole("link", { name: "Check fit", exact: true }).count(), 1);
    await page.close();
  }
  for (const path of retiredPaths) {
    const { page } = await openCheckedPage(context, path);
    assert.equal(await page.locator('meta[name="robots"]').getAttribute("content"), "noindex,follow");
    assert.match(await page.locator("main").innerText(), /This route is no longer published/i);
    if (path === "dragon-analytics.html") {
      assert.ok(await page.getByRole("link", { name: /Case study/i }).count() >= 1);
      assert.ok(await page.getByRole("link", { name: /Sample plan/i }).count() >= 1);
    } else {
      assert.ok(await page.getByRole("link", { name: /How it works/i }).count() >= 1);
      assert.ok(await page.getByRole("link", { name: /View sample report/i }).count() >= 1);
    }
    await page.close();
  }
  await context.close();
});

test("the agency-first hero keeps its evidence promise, commercial facts, and primary action visible", async () => {
  for (const { viewport, requirePreview } of [
    { viewport: { width: 390, height: 844 }, requirePreview: false },
    { viewport: { width: 430, height: 932 }, requirePreview: false },
    { viewport: { width: 1440, height: 900 }, requirePreview: true },
  ]) {
    const context = await browser.newContext({ viewport });
    const { page } = await openCheckedPage(context, "index.html");
    const hero = page.locator(".home-hero");
    const heroText = await hero.innerText();
    assert.match(heroText, /For European performance marketing agencies/i);
    assert.match(heroText, /Know what your ad evidence actually supports\./i);
    assert.match(heroText, /2 compatible ad platforms/i);
    assert.match(heroText, /€1,500 ROAS Budget Audit/i);
    const headline = await hero.locator("h1").boundingBox();
    const primary = hero.getByRole("link", { name: "Check if your data fits" });
    const primaryBox = await primary.boundingBox();
    assert.ok(headline.y + headline.height <= viewport.height, `Headline is below the first viewport at ${viewport.width}px: ${JSON.stringify(headline)}`);
    assert.ok(primaryBox.y + primaryBox.height <= viewport.height, `Primary action is below the first viewport at ${viewport.width}px: ${JSON.stringify(primaryBox)}`);
    assert.equal(await primary.getAttribute("href"), "fit-check.html");
    const preview = await page.locator("[data-deliverable-preview]").boundingBox();
    if (requirePreview) assert.ok(preview.y < viewport.height, `Decision preview does not begin in the first viewport at ${viewport.width}px: ${JSON.stringify(preview)}`);
    await context.close();
  }
});

test("the fit check collects only the approved context, requires a platform, and blocks an unconfigured endpoint", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { page } = await openCheckedPage(context, "fit-check.html");
  const form = page.locator("#spendy-fit-check");
  assert.equal(await form.locator('input[type="file"]').count(), 0);
  assert.notEqual(await form.getByLabel("Business email").evaluate((field) => getComputedStyle(field).borderColor), "rgb(139, 47, 43)", "An untouched field must not look like an error");
  assert.equal(await form.locator('[name="full_name"], [name="api_key"], [name="upload"]').count(), 0);
  await form.getByLabel("Business email").fill("ana@example.com");
  await form.getByLabel("Agency or company").fill("Northstar Studio");
  await form.getByLabel("Website").fill("https://northstar.example");
  await form.getByLabel("Combined monthly ad spend").selectOption("€25,000–€49,999");
  await form.getByLabel("Approximate total ads").selectOption("51–100");
  await form.getByLabel("Do you use Shopify?").selectOption("Yes");
  await form.getByLabel("What allocation decision do you need to make?").fill("We need a clearer allocation decision before next month.");
  await form.getByLabel(/I have read the Privacy/i).check();
  await form.getByRole("button", { name: "Send fit check" }).click();
  await page.waitForFunction(() => document.querySelector("[data-fit-check-status]")?.textContent.includes("Complete the required"));
  await form.locator('input[data-platform="Meta Ads"]').check();
  await form.getByRole("button", { name: "Send fit check" }).click();
  await page.waitForFunction(() => document.querySelector("[data-fit-check-status]")?.textContent.includes("being configured"));
  assert.match(await form.locator("[data-fit-check-status]").innerText(), /do not attach files/i);
  assert.match(await form.getByRole("link", { name: "Email Spendy directly" }).getAttribute("href"), /^mailto:/);
  await context.close();
});

test("limited conversion analytics emits only approved event context", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    window.__spendyPlausibleCalls = [];
    window.plausible = (name, options) => window.__spendyPlausibleCalls.push({ name, options });
  });
  const { page } = await openCheckedPage(context, "index.html");
  await page.waitForFunction(() => window.__spendyPlausibleCalls?.some((event) => event.name === "landing_view"));
  const heroCta = page.getByRole("link", { name: "Check if your data fits" }).first();
  await heroCta.evaluate((element) => element.addEventListener("click", (event) => event.preventDefault(), { once: true }));
  await heroCta.click();
  const faq = page.locator("details[data-disclosure]").first();
  await faq.locator("summary").click();
  await page.waitForFunction(() => window.__spendyPlausibleCalls?.some((event) => event.name === "faq_open"));
  const events = await page.evaluate(() => window.__spendyPlausibleCalls);
  assert.deepEqual(events, [
    { name: "landing_view", options: { props: { page_type: "landing" } } },
    { name: "primary_cta_click", options: { props: { cta_location: "hero", page_type: "landing" } } },
    { name: "faq_open", options: { props: { page_type: "landing" } } },
  ]);
  assert.doesNotMatch(JSON.stringify(events), /email|agency|website|decision/i);
  await context.close();
});

test("all public routes avoid horizontal overflow and browser errors across responsive ranges", async () => {
  for (const viewport of [
    { width: 320, height: 700 }, { width: 360, height: 800 }, { width: 390, height: 844 },
    { width: 430, height: 932 }, { width: 768, height: 1000 }, { width: 1024, height: 768 },
    { width: 1280, height: 720 }, { width: 1440, height: 900 }, { width: 1920, height: 1080 }
  ]) {
    const context = await browser.newContext({ viewport });
    for (const path of [...activePaths, ...funnelPaths, ...policyPaths, ...retiredPaths]) {
      const { page, errors } = await openCheckedPage(context, path);
      const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${path} overflows at ${viewport.width}px: ${JSON.stringify(dimensions)}`);
      assert.deepEqual(errors, [], `${path} emitted browser errors at ${viewport.width}px`);
      await page.close();
    }
    await context.close();
  }
});

test("the anonymous case study renders only after its JSON, arithmetic, and period-file hash pass", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page } = await openCheckedPage(context, "case-study.html");
  await page.waitForFunction(() => document.querySelector("[data-case-study]")?.dataset.state === "ready");
  assert.equal(await page.locator("[data-case-value='period-count']").innerText(), "12");
  assert.equal(await page.locator("[data-case-value='decision-coverage']").innerText(), "432/432");
  assert.equal(await page.locator("[data-case-value='advantage']").first().innerText(), "€4,304");
  assert.equal(await page.locator("[data-case-chart] svg[role='img']").count(), 1);
  await context.close();

  const failedContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const failed = await failedContext.newPage();
  await failed.route("**/case-study-periods.csv", (route) => route.fulfill({ status: 200, contentType: "text/csv", body: "period_id,label,equal_profit_cents,spendy_profit_cents,difference_cents\n1,Changed,1,2,1\n" }));
  await failed.goto(`${baseUrl}/case-study.html`, { waitUntil: "networkidle" });
  await failed.getByRole("heading", { name: "Case-study evidence is temporarily unavailable." }).waitFor();
  assert.equal(await failed.locator("[data-case-content]:visible").count(), 0);
  assert.equal(await failed.locator("[data-case-value]:visible").count(), 0);
  await failedContext.close();
});

test("the checked sample plan has identical desktop rows and phone cards from one evidence source", async () => {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page } = await openCheckedPage(desktop, "labs/monthly-ad-report.html");
  await page.waitForFunction(() => document.querySelector("[data-ad-report]")?.dataset.state === "ready");
  assert.equal(await page.locator("[data-report-rows] tr").count(), 12);
  assert.equal(await page.locator("[data-report-cards]").isVisible(), false);
  assert.equal(await page.locator("[data-report-value='recommended-total']").innerText(), "$125,000.00");
  await desktop.close();

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page: phone } = await openCheckedPage(mobile, "labs/monthly-ad-report.html");
  await phone.waitForFunction(() => document.querySelector("[data-ad-report]")?.dataset.state === "ready");
  assert.equal(await phone.locator("[data-report-cards] .report-card").count(), 12);
  assert.equal(await phone.locator(".report-table-desktop").isVisible(), false);
  assert.equal(await phone.locator("[data-report-cards] [data-report-action]").count(), 12);
  await mobile.close();
});

test("mobile navigation, disclosures, and no-JavaScript narrative remain usable", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const { page } = await openCheckedPage(context, "index.html");
  const toggle = page.locator(".nav-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  const summary = page.locator("details[data-disclosure] summary").first();
  await summary.click();
  assert.equal(await summary.getAttribute("aria-expanded"), "true");
  await context.close();

  const noJs = await browser.newContext({ viewport: { width: 390, height: 844 }, javaScriptEnabled: false });
  for (const path of ["index.html", "fit-check.html", "fit-check-thanks.html", "case-study.html", "labs/monthly-ad-report.html", "privacy.html", "audit-terms.html", "writing.html"]) {
    const pageWithoutJs = await noJs.newPage();
    await pageWithoutJs.goto(`${baseUrl}/${path}`, { waitUntil: "load" });
    assert.equal(await pageWithoutJs.locator("h1").isVisible(), true);
    assert.equal(await pageWithoutJs.getByRole("link").first().isVisible(), true);
    assert.equal(await pageWithoutJs.locator("[data-case-value]:visible").count(), 0);
    await pageWithoutJs.close();
  }
  await noJs.close();
});

test("the active experience has no automated WCAG 2.2 AA violations", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const path of [...activePaths, ...funnelPaths, ...policyPaths, "404.html"]) {
    const { page } = await openCheckedPage(context, path);
    if (path === "case-study.html") await page.waitForFunction(() => document.querySelector("[data-case-study]")?.dataset.state !== "loading");
    if (path === "labs/monthly-ad-report.html") await page.waitForFunction(() => document.querySelector("[data-ad-report]")?.dataset.state === "ready");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    assert.deepEqual(results.violations.map((violation) => ({ id: violation.id, impact: violation.impact, targets: violation.nodes.map((node) => node.target) })), [], `${path} has accessibility violations`);
    await page.close();
  }
  await context.close();
});

test("homepage transfer stays below 1 MB on a phone-sized view", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let bytes = 0;
  const bodyReads = [];
  page.on("response", (response) => {
    if (!response.url().startsWith(baseUrl)) return;
    bodyReads.push(response.body().then((body) => { bytes += body.byteLength; }).catch(() => {}));
  });
  await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
  await Promise.all(bodyReads);
  assert.ok(bytes < 1024 * 1024, `Homepage transferred ${bytes} bytes locally`);
  await context.close();
});
