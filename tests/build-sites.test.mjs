import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tools/build_sites.mjs"], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, output }));
  });
}

async function listFiles(directory, relativePath = "") {
  const entries = await readdir(join(directory, relativePath), { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(relativePath, entry.name);
    return entry.isDirectory() ? listFiles(directory, entryPath) : [entryPath];
  }));
  return files.flat();
}

test("build packages the finance-writing portfolio, its three samples, and hosting metadata without retired service pages", async () => {
  const result = await runBuild();
  assert.equal(result.code, 0, result.output);

  for (const path of [
    "index.html", "404.html", "styles.css", "scripts/site.mjs", ".openai/hosting.json",
    "articles/how-to-read-a-10-k.html", "articles/free-cash-flow.html", "articles/dividend-yield-vs-total-return.html",
    "assets/social/maxell-finance-portfolio.png",
  ]) {
    await access(join(root, "dist", path));
  }
  await assert.rejects(access(join(root, "dist", "fit-check.html")));
  await assert.rejects(access(join(root, "dist", "case-study.html")));
  await assert.rejects(access(join(root, "dist", "labs", "monthly-ad-report.html")));
  await assert.rejects(access(join(root, "dist", "assets", "spend-signal-mark.svg")));

  const homepage = await readFile(join(root, "dist", "index.html"), "utf8");
  assert.match(homepage, /Maxell Aguiran \| Finance &amp; Investing Writer/);
  assert.doesNotMatch(homepage, /Spendy/i);

  assert.deepEqual((await listFiles(join(root, "dist"))).sort(), [
    ".openai/hosting.json",
    "404.html",
    "articles/dividend-yield-vs-total-return.html",
    "articles/free-cash-flow.html",
    "articles/how-to-read-a-10-k.html",
    "assets/favicon.svg",
    "assets/fonts/fraunces-latin-variable.woff2",
    "assets/fonts/manrope-latin-variable.woff2",
    "assets/social/maxell-finance-portfolio.png",
    "index.html",
    "robots.txt",
    "scripts/site.mjs",
    "server/index.js",
    "sitemap.xml",
    "styles.css",
  ]);

  const workerModuleUrl = `${pathToFileURL(join(root, "dist", "server", "index.js")).href}?test=${Date.now()}`;
  const { default: worker } = await import(workerModuleUrl);
  const assets = {
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/404.html") {
        return new Response("<main>Portfolio page not found</main>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      if (path === "/index.html") return new Response("<main>Portfolio homepage</main>", { status: 200 });
      return new Response("Generic asset host 404", { status: 404 });
    },
  };

  const retiredPage = await worker.fetch(new Request("https://portfolio.test/fit-check.html"), { ASSETS: assets });
  assert.equal(retiredPage.status, 404);
  assert.equal(await retiredPage.text(), "<main>Portfolio page not found</main>");
});
