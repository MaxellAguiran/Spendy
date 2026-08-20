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


test("the homepage first screen tells marketing agencies exactly what Maxell does", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport });
    const { page } = await openCheckedPage(context, "index.html");
    await assert.doesNotReject(() => page.locator(".brand span").waitFor({ state: "visible" }));
    const heroText = await page.locator(".hero-copy").innerText();
    assert.match(await page.locator("h1").innerText(), /budget optimization and churn prediction for marketing agencies/i);
    assert.match(heroText, /where client marketing budgets should go/i);
    assert.match(heroText, /which client accounts may leave/i);
    assert.match(heroText, /clear budget plan/i);
    assert.match(heroText, /list of accounts to contact first/i);
    assert.doesNotMatch(heroText, /founder-led|growing businesses|decision models|operators/i);
    const actions = await page.locator(".hero-actions a").all();
    assert.equal(actions.length, 2);
    assert.deepEqual(await page.locator(".hero-actions a").allInnerTexts(), ["See the budget example", "Talk about your agency"]);
    for (const action of actions) {
      assert.equal(await action.isVisible(), true);
      const box = await action.boundingBox();
      assert.ok(box.y + box.height <= viewport.height, `Hero action extends below ${viewport.width}×${viewport.height}: ${JSON.stringify(box)}`);
    }
    await context.close();
  }
});


test("public-facing pages explain the work without unexplained analyst jargon", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const forbidden = /\b(?:artifact|baseline|holdout|held-out|model|MAE|Brier|calibration|cohort|falsifier|incrementality|extrapolation|adstock|regression|log loss|false positives?|marginal returns?|response curves?|reproducible|chronological|probability quality|top-decile|EV\/EBITDA|DCF|valuation|thesis|scenarios?)\b/i;
  for (const path of ["index.html", "dragon-analytics.html", "labs/marketing-allocation.html", "labs/churn-risk.html", "writing.html", "404.html"]) {
    const { page } = await openCheckedPage(context, path);
    if (path.startsWith("labs/")) await page.locator(".stat").first().waitFor();
    const visibleMainText = await page.locator("main").innerText();
    assert.doesNotMatch(visibleMainText, forbidden, `${path} exposes unexplained jargon`);
    if (path.startsWith("labs/")) {
      assert.ok(await page.locator("details.technical-note").count() >= 1, `${path} must keep exact definitions in an optional technical note`);
    }
    await page.close();
  }
  await context.close();
});


test("the homepage presents one flagship case before work, founder evidence, research, and contact", async () => {
  for (const expected of [
    { viewport: { width: 390, height: 844 }, maxHeight: 6000 },
    { viewport: { width: 1280, height: 720 }, maxHeight: 4200 }
  ]) {
    const context = await browser.newContext({ viewport: expected.viewport });
    const { page } = await openCheckedPage(context, "index.html");
    const structure = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      ids: [...document.querySelectorAll("main > section")].map((section) => section.id),
      positions: Object.fromEntries(["proof", "services", "about", "research", "contact"].map((id) => [id, document.getElementById(id)?.offsetTop]))
    }));
    assert.deepEqual(structure.ids, ["", "proof", "services", "about", "research", "contact"]);
    assert.ok(structure.height < expected.maxHeight, `Homepage is still too long at ${expected.viewport.width}px: ${structure.height}px`);
    assert.ok(structure.positions.proof < structure.positions.about);
    assert.ok(structure.positions.proof < structure.positions.services);
    assert.ok(structure.positions.services < structure.positions.about);
    assert.ok(structure.positions.about < structure.positions.research);
    assert.ok(structure.positions.research < structure.positions.contact);
    if (expected.viewport.width === 1280) {
      assert.ok(structure.positions.proof < 760, `The flagship case does not approach the first desktop viewport: ${structure.positions.proof}px`);
    }
    assert.ok(structure.positions.about < structure.positions.contact);
    assert.equal(await page.locator(".hero .instrument-card").count(), 0);
    assert.equal(await page.locator(".hero img[src*='dragon-mascot']").count(), 0);
    assert.equal(await page.locator("#proof [data-featured-case]").count(), 1);
    assert.equal(await page.locator("#proof a[href='labs/churn-risk.html']").count(), 0, "Churn must not compete with the flagship case");
    await context.close();
  }
});


test("Dragon Analytics is a compact work-with-me page with decision, stop conditions, contact, and five FAQs or fewer", async () => {
  for (const expected of [
    { viewport: { width: 390, height: 844 }, maxHeight: 6500, maxContact: 5000 },
    { viewport: { width: 1280, height: 720 }, maxHeight: 4200, maxContact: 3200 }
  ]) {
    const context = await browser.newContext({ viewport: expected.viewport });
    const { page } = await openCheckedPage(context, "dragon-analytics.html");
    const measurements = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      ids: [...document.querySelectorAll("main > section")].map((section) => section.id),
      contact: document.getElementById("contact").offsetTop,
      faq: document.getElementById("faq").offsetTop
    }));
    assert.deepEqual(measurements.ids, ["", "marketing", "churn", "process", "fit", "contact", "faq"]);
    assert.ok(measurements.height < expected.maxHeight, `Dragon Analytics is still too long at ${expected.viewport.width}px: ${measurements.height}px`);
    assert.ok(measurements.contact < measurements.faq, "Contact must appear before FAQ");
    assert.ok(measurements.contact < expected.maxContact, `Contact appears too late at ${measurements.contact}px`);
    assert.equal(await page.locator(".hero .instrument-card").count(), 0);
    assert.equal(await page.locator("img[src*='dragon-mascot']").count(), 1);
    assert.match(await page.locator("h1").innerText(), /bring me the decision/i);
    assert.doesNotMatch(await page.locator("main").innerText(), /two focused analytics services/i);
    assert.equal(await page.locator("#marketing dt").allTextContents().then((labels) => labels.includes("When I stop")), true);
    assert.equal(await page.locator("#churn dt").allTextContents().then((labels) => labels.includes("When I stop")), true);
    const faqCount = await page.locator("details[data-disclosure]").count();
    assert.ok(faqCount >= 4 && faqCount <= 5, `Expected 4–5 concise FAQs, found ${faqCount}`);
    await context.close();
  }
});


test("the flagship allocation renderer exposes checked values and keyboard-operable views", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const { page } = await openCheckedPage(context, "index.html");
  const caseStudy = page.locator("[data-featured-case]");
  await page.waitForFunction(() => document.querySelector("[data-featured-case]")?.dataset.state === "ready");
  assert.equal(await caseStudy.locator("[data-allocation-channel]").count(), 4);
  assert.equal(await caseStudy.locator("[data-case-value='current-total']").innerText(), "$41,282");
  assert.equal(await caseStudy.locator("[data-case-value='recommended-total']").innerText(), "$41,282");
  assert.match(await caseStudy.locator("[data-case-value='baseline-mae']").innerText(), /15,558/);
  assert.match(await caseStudy.locator("[data-case-value='model-mae']").innerText(), /7,778/);
  assert.equal(await caseStudy.getByRole("button").count(), 3);
  const current = caseStudy.getByRole("button", { name: "Current" });
  await current.focus();
  await page.keyboard.press("Enter");
  assert.equal(await current.getAttribute("aria-pressed"), "true");
  assert.equal(await caseStudy.locator("[data-series='recommended']:visible").count(), 0);
  const compare = caseStudy.getByRole("button", { name: "Compare" });
  await compare.click();
  assert.equal(await compare.getAttribute("aria-pressed"), "true");
  assert.ok(await caseStudy.locator("[data-series='recommended']:visible").count() > 0);
  assert.match(await caseStudy.locator("[data-case-narration]").innerText(), /same|unchanged/i);
  await context.close();
});


test("the flagship allocation renderer fails closed on invalid or unavailable evidence", async () => {
  for (const routeHandler of [
    (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ schema: "lab-evidence/v2" }) }),
    (route) => route.abort()
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await page.route("**/labs/data/marketing-allocation.json", routeHandler);
    await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Evidence unavailable" }).waitFor();
    assert.equal(await page.locator("[data-series='recommended']:visible").count(), 0);
    assert.equal(await page.locator("[data-case-value='recommended-total']:visible").count(), 0);
    assert.equal(await page.locator("a[href='labs/data/marketing-allocation.json']:visible").count(), 1);
    assert.ok(await page.locator("a[href='labs/data/marketing-allocation.csv']:visible").count() >= 1);
    assert.equal(await page.locator("a[href='labs/data/marketing-allocation-methodology.md']:visible").count(), 1);
    await context.close();
  }
});


test("worked-example heroes translate the decision before technical metrics", async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  for (const [path, heading, businessPhrase] of [
    ["labs/marketing-allocation.html", "Can the same weekly budget work harder?", /fixed|unchanged/i],
    ["labs/churn-risk.html", "Which accounts deserve the first outreach?", /100 customers|wrong people/i]
  ]) {
    const { page } = await openCheckedPage(context, path);
    assert.equal(await page.locator("h1").innerText(), heading);
    assert.match(await page.locator(".page-hero").innerText(), businessPhrase);
    const firstMetric = await page.locator(".stat span").first().innerText();
    assert.match(firstMetric, /average .*error/i);
    await page.close();
  }
  await context.close();
});


test("the research hub shows the five reports without a second methodology or sales section", async () => {
  for (const expected of [
    { viewport: { width: 390, height: 844 }, maxHeight: 4300 },
    { viewport: { width: 1280, height: 720 }, maxHeight: 3000 }
  ]) {
    const context = await browser.newContext({ viewport: expected.viewport });
    const { page } = await openCheckedPage(context, "writing.html");
    const structure = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      ids: [...document.querySelectorAll("main > section")].map((section) => section.id)
    }));
    assert.deepEqual(structure.ids, ["", "reports"]);
    assert.ok(structure.height < expected.maxHeight, `Research hub is still too long at ${expected.viewport.width}px: ${structure.height}px`);
    assert.equal(await page.locator("#reports a[href$='.html']").count(), 5);
    assert.equal(await page.locator(".page-hero-card").count(), 0);
    await context.close();
  }
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
  for (const [path, firstChart] of [
    ["labs/marketing-allocation.html", /current versus recommended/i],
    ["labs/churn-risk.html", /likely leavers found as the call list grows/i]
  ]) {
    const { page } = await openCheckedPage(context, path);
    await page.locator(".stat").first().waitFor();
    assert.equal(await page.locator(".stat").count(), 4);
    assert.equal(await page.locator(".evidence-chart").count(), 4);
    assert.match(await page.locator(".evidence-chart h3").first().innerText(), firstChart);
    assert.equal(await page.locator(".chart-summary").count(), 4);
    assert.equal(await page.locator(".data-table-wrap table").count(), 4);
    if (path.includes("marketing-allocation")) {
      const fills = await page.locator(".evidence-chart").first().locator("rect").evaluateAll((bars) => bars.slice(0, 2).map((bar) => bar.getAttribute("fill")));
      assert.deepEqual(fills, ["#C45A49", "#197A55"], "Current allocation must be terracotta and recommended allocation green");
    }
    if (path.includes("churn-risk")) {
      assert.match(await page.locator(".evidence-chart").first().locator("table").textContent(), /compared with random outreach/i, "The lift comparison must remain available in plain language");
    }
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
    if (path === "index.html") {
      assert.match(await page.locator("#proof").innerText(), /Can the same weekly budget work harder/i);
      assert.match(await page.locator("#proof").innerText(), /Example built from generated data/i);
    }
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
