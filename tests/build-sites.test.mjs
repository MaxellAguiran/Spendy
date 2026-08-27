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

test("build packages the finance-writing and media-buying portfolios with a static asset mapping", async () => {
  const result = await runBuild();
  assert.equal(result.code, 0, result.output);

  for (const path of [
    "assets/index.html", "assets/media-buying.html", "assets/404.html", "assets/styles.css", "assets/scripts/site.mjs", "assets/scripts/ad-report.mjs", ".openai/hosting.json", "server/wrangler.json",
    "assets/articles/how-to-read-a-10-k.html", "assets/articles/free-cash-flow.html", "assets/articles/dividend-yield-vs-total-return.html",
    "assets/labs/monthly-ad-report.html", "assets/labs/data/monthly-ad-report.json", "assets/assets/social/maxell-finance-portfolio.png", "assets/assets/social/monthly-ad-report.png",
  ]) {
    await access(join(root, "dist", path));
  }
  await assert.rejects(access(join(root, "dist", "assets", "fit-check.html")));
  await assert.rejects(access(join(root, "dist", "assets", "case-study.html")));

  const homepage = await readFile(join(root, "dist", "assets", "index.html"), "utf8");
  assert.match(homepage, /Maxell Aguiran \| Finance &amp; Investing Writer/);
  assert.doesNotMatch(homepage, /Spendy/i);

  const mediaBuying = await readFile(join(root, "dist", "assets", "media-buying.html"), "utf8");
  assert.match(mediaBuying, /Bold Decisions/);
  assert.match(mediaBuying, /PDF analysis with monthly budget recommendations/);

  const wrangler = JSON.parse(await readFile(join(root, "dist", "server", "wrangler.json"), "utf8"));
  assert.equal(wrangler.main, "index.js");
  assert.deepEqual(wrangler.assets, { directory: "../assets", binding: "ASSETS" });

  const builtFiles = new Set(await listFiles(join(root, "dist")));
  assert.ok(builtFiles.has("assets/assets/favicon.svg"));
  assert.ok(builtFiles.has("assets/assets/fonts/fraunces-latin-variable.woff2"));
  assert.ok(builtFiles.has("assets/assets/fonts/manrope-latin-variable.woff2"));
  assert.ok(builtFiles.has("assets/labs/data/monthly-ad-report.csv"));
  assert.ok(builtFiles.has("assets/labs/data/monthly-ad-report-methodology.md"));

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
