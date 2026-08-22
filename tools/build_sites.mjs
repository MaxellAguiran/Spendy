import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "dist");
const publicFolders = ["assets"];
const publicFiles = [
  "index.html", "case-study.html", "privacy.html", "audit-terms.html", "404.html", "writing.html", "dragon-analytics.html", "firstservice.html",
  "ibex.html", "nordic-american-tankers.html", "rex.html", "tamboran.html", "styles.css",
  "robots.txt", "sitemap.xml",
  "labs/monthly-ad-report.html", "labs/marketing-allocation.html", "labs/churn-risk.html",
  "labs/data/monthly-ad-report.json", "labs/data/monthly-ad-report.csv", "labs/data/monthly-ad-report-methodology.md",
  "data/case-study-evidence.json", "data/case-study-periods.csv",
  "scripts/site.mjs", "scripts/qualification.mjs", "scripts/ad-report.mjs", "scripts/case-study.mjs"
];

const worker = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") url.pathname = "/index.html";
    const response = await env.ASSETS.fetch(new Request(url, request));
    if (response.status !== 404 || url.pathname.includes(".")) return response;
    return env.ASSETS.fetch(new Request(new URL("/404.html", url), request));
  }
};\n`;

await rm(output, { recursive: true, force: true });
await mkdir(join(output, "server"), { recursive: true });
for (const file of publicFiles) {
  const destination = join(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(join(root, file), destination);
}
for (const folder of publicFolders) await cp(join(root, folder), join(output, folder), { recursive: true });
await writeFile(join(output, "server", "index.js"), worker, "utf8");
console.log("Built static Spendy site for Sites hosting.");
