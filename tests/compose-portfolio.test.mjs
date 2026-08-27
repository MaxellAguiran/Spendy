import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../", import.meta.url));
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const samples = [
  "articles/how-to-read-a-10-k.html",
  "articles/free-cash-flow.html",
  "articles/dividend-yield-vs-total-return.html",
];

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

async function openPage(context, path) {
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  const response = await page.goto(`${baseUrl}/${path}`, { waitUntil: "networkidle" });
  return { page, errors, response };
}

test("the homepage introduces Maxell as a finance and investing writer and leads to real samples", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors, response } = await openPage(context, "index.html");

  assert.equal(response.status(), 200);
  assert.equal(await page.title(), "Maxell Aguiran | Finance & Investing Writer");
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Clear finance writing for readers who want to invest with context.");
  assert.equal(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Work" }).count(), 1);
  assert.equal(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Media Buying" }).getAttribute("href"), "media-buying.html");
  assert.equal(await page.getByRole("link", { name: "View writing samples" }).count(), 1);
  assert.ok(await page.getByRole("link", { name: "Email Maxell" }).count() >= 1);
  assert.equal(await page.getByRole("link", { name: "Email Maxell" }).first().getAttribute("href"), "mailto:maxell.aguiran@gmail.com?subject=Freelance%20writing%20enquiry");
  assert.equal(await page.locator("[data-sample-card]").count(), 3);
  assert.deepEqual(await page.locator("[data-sample-card] h3 a").evaluateAll((links) => links.map((link) => link.getAttribute("href"))), samples);
  assert.deepEqual(errors, []);

  await context.close();
});

test("the media-buying tab presents Spendy as a clearly disclosed portfolio project", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { page, errors, response } = await openPage(context, "media-buying.html");

  assert.equal(response.status(), 200);
  assert.equal(await page.title(), "Maxell Aguiran | Media Buying Portfolio");
  assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "Media-buying work built around evidence before budget decisions.");
  assert.equal(await page.getByText("Portfolio example: not client performance.", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("heading", { name: "Bold Decisions", exact: true }).count(), 1);
  assert.equal(await page.getByText("Client work", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("link", { name: "Open the sample monthly plan", exact: true }).first().getAttribute("href"), "labs/monthly-ad-report.html");
  assert.equal(await page.getByText("Dragon Analytics", { exact: true }).count(), 1);
  assert.deepEqual(errors, []);

  await context.close();
});

test("the sample monthly plan remains available as a synthetic portfolio demonstration", async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  const { page, errors, response } = await openPage(context, "labs/monthly-ad-report.html");

  assert.equal(response.status(), 200);
  assert.equal(await page.title(), "Spendy Sample Monthly Plan | Maxell Aguiran");
  assert.equal(await page.getByText("Illustrative portfolio example: not a client result.", { exact: true }).count(), 1);
  assert.equal(await page.getByRole("link", { name: "Back to media-buying portfolio" }).getAttribute("href"), "../media-buying.html");
  assert.deepEqual(errors, []);

  await context.close();
});

test("each writing sample is a readable finance article with an educational disclaimer and source links", async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  for (const path of samples) {
    const { page, errors, response } = await openPage(context, path);
    const article = page.locator("main article");

    assert.equal(response.status(), 200, `${path} must be published`);
    assert.equal(await article.count(), 1, `${path} must expose one readable article`);
    assert.equal(await article.getByText("Educational only: not investment advice.", { exact: true }).count(), 1);
    assert.equal(await article.getByRole("heading", { name: "Sources", exact: true }).count(), 1);
    assert.ok(await article.locator('a[href^="https://"]').count() >= 2, `${path} needs a reader-verifiable source list`);
    assert.equal(await page.locator('meta[property="og:type"]').getAttribute("content"), "article");
    assert.match(await page.locator('link[rel="canonical"]').getAttribute("href"), /^https:\/\/maxellaguiran\.github\.io\/articles\//);
    assert.deepEqual(errors, [], `${path} emitted browser errors`);
    await page.close();
  }
  await context.close();
});

test("the portfolio navigation remains usable and the public pages do not overflow on a phone", async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  for (const path of ["index.html", "media-buying.html", ...samples]) {
    const { page, errors } = await openPage(context, path);
    const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    assert.ok(dimensions.scrollWidth <= dimensions.clientWidth + 1, `${path} overflows on mobile: ${JSON.stringify(dimensions)}`);
    assert.deepEqual(errors, [], `${path} emitted browser errors`);
    await page.close();
  }

  const { page } = await openPage(context, "index.html");
  const toggle = page.getByRole("button", { name: "Toggle navigation" });
  await toggle.click();
  assert.equal(await toggle.getAttribute("aria-expanded"), "true");
  assert.equal(await page.getByRole("navigation", { name: "Primary navigation" }).getByRole("link", { name: "Contact" }).isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await toggle.getAttribute("aria-expanded"), "false");
  await context.close();
});

test("retired Spendy routes return the portfolio's not-found page instead of resurfacing the old service", async () => {
  const context = await browser.newContext({ viewport: { width: 1024, height: 768 } });
  for (const path of ["fit-check.html", "case-study.html", "privacy.html", "writing.html"]) {
    const { page, response } = await openPage(context, path);
    assert.equal(response.status(), 404, `${path} must not be served as an active page`);
    assert.equal(await page.getByRole("heading", { level: 1 }).innerText(), "This page has moved or never existed.");
    await page.close();
  }
  await context.close();
});
