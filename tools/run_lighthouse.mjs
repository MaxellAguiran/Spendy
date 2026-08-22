import { spawn } from "node:child_process";
import { readFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const base = process.env.LIGHTHOUSE_BASE_URL || "http://127.0.0.1:4173";
const routes = ["index.html", "case-study.html", "labs/monthly-ad-report.html", "privacy.html", "audit-terms.html", "dragon-analytics.html", "404.html"];
const nonIndexableRoutes = new Set(["privacy.html", "audit-terms.html", "dragon-analytics.html", "404.html"]);
const outputDirectory = join(root, ".lighthouse");
await mkdir(outputDirectory, { recursive: true });

function run(command, arguments_) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, arguments_, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

for (const route of routes) {
  const chromeProfile = await mkdtemp(join(tmpdir(), "spendy-lighthouse-"));
  try {
    const slug = route.replace(/[/.]+/g, "-").replace(/-html$/, "");
    const output = join(outputDirectory, `${slug}.json`);
    await run(process.execPath, [
      join(root, "node_modules", "lighthouse", "cli", "index.js"),
      `${base}/${route}`,
      "--quiet",
      "--output=json",
      `--output-path=${output}`,
      "--only-categories=performance,accessibility,best-practices,seo",
      `--chrome-flags=--headless=new --no-sandbox --user-data-dir=${chromeProfile}`
    ]);
    const report = JSON.parse(await readFile(output, "utf8"));
    const scores = Object.fromEntries(Object.entries(report.categories).map(([name, category]) => [name, Math.round(category.score * 100)]));
    await rm(output, { force: true });
    console.log(`${route}: ${JSON.stringify(scores)}`);
    for (const [name, score] of Object.entries(scores)) {
      const minimum = name === "performance" ? 90 : name === "accessibility" ? 100 : name === "seo" && nonIndexableRoutes.has(route) ? 0 : 95;
      if (score < minimum) throw new Error(`${route} ${name} score ${score} is below ${minimum}`);
    }
  } finally {
    await rm(chromeProfile, { recursive: true, force: true });
  }
}
